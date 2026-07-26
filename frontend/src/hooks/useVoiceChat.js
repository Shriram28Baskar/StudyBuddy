import { useState, useRef, useCallback, useEffect } from 'react'

const ICE_SERVERS = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
}

const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
}

// Threshold for "speaking" detection (0–255 from AnalyserNode)
const SPEAKING_THRESHOLD = 25
const SPEAKING_INTERVAL = 200 // ms between speaker_activity updates

/**
 * useVoiceChat – manages WebRTC peer connections for voice chat in a study room.
 *
 * @param {string}   userId         - Current user's ID
 * @param {Array}    participants   - Array of { user_id, connected, voice_enabled }
 * @param {Function} sendWs         - Function to send JSON message over WebSocket
 * @param {boolean}  enabled        - Whether voice chat is currently joined
 * @returns {object} Voice chat state and controls
 */
export function useVoiceChat(userId, participants, sendWs, enabled) {
  const [voiceStatus, setVoiceStatus] = useState('idle') // idle | connecting | connected | error
  const [isMuted, setIsMuted] = useState(true)
  const [micPermission, setMicPermission] = useState('prompt') // prompt | granted | denied
  const [speakingUsers, setSpeakingUsers] = useState({}) // userId → { isSpeaking, volume }

  const localStreamRef = useRef(null)
  const peerConnectionsRef = useRef(new Map()) // userId → RTCPeerConnection
  const remoteStreamsRef = useRef(new Map())   // userId → MediaStream
  const audioElementsRef = useRef(new Map())   // userId → HTMLAudioElement
  const audioContextRef = useRef(null)
  const analyserIntervalRef = useRef(null)
  const localAnalyserRef = useRef(null)

  // ── Cleanup all connections ──────────────────────────────────────────────
  const cleanupAll = useCallback(() => {
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close())
    peerConnectionsRef.current.clear()
    // Remove audio elements
    audioElementsRef.current.forEach((el) => {
      el.srcObject = null
      el.remove()
    })
    audioElementsRef.current.clear()
    remoteStreamsRef.current.clear()
    // Stop audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (analyserIntervalRef.current) {
      clearInterval(analyserIntervalRef.current)
      analyserIntervalRef.current = null
    }
    localAnalyserRef.current = null
    setSpeakingUsers({})
  }, [])

  // ── Create a peer connection for a specific user ─────────────────────────
  const createPeerConnection = useCallback((remoteUserId) => {
    if (peerConnectionsRef.current.has(remoteUserId)) {
      peerConnectionsRef.current.get(remoteUserId).close()
    }

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWs({
          type: 'ice_candidate',
          to_user_id: remoteUserId,
          payload: event.candidate.toJSON(),
        })
      }
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (remoteStream) {
        remoteStreamsRef.current.set(remoteUserId, remoteStream)

        // Create or reuse audio element
        let audioEl = audioElementsRef.current.get(remoteUserId)
        if (!audioEl) {
          audioEl = new Audio()
          audioEl.autoplay = true
          audioEl.playsInline = true
          audioElementsRef.current.set(remoteUserId, audioEl)
        }
        audioEl.srcObject = remoteStream
        audioEl.play().catch(() => {})
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setVoiceStatus('connected')
      } else if (pc.connectionState === 'failed') {
        // Retry once
        pc.restartIce()
      }
    }

    peerConnectionsRef.current.set(remoteUserId, pc)
    return pc
  }, [sendWs])

  // ── Start speaking detection ─────────────────────────────────────────────
  const startSpeakingDetection = useCallback(() => {
    if (!localStreamRef.current) return

    try {
      const ctx = new AudioContext()
      audioContextRef.current = ctx

      const source = ctx.createMediaStreamSource(localStreamRef.current)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      localAnalyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let lastSpeaking = false

      analyserIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const isSpeaking = avg > SPEAKING_THRESHOLD

        if (isSpeaking !== lastSpeaking) {
          lastSpeaking = isSpeaking
          sendWs({
            type: 'speaker_activity',
            is_speaking: isSpeaking,
            volume: Math.round(avg),
          })
        }
      }, SPEAKING_INTERVAL)
    } catch (err) {
      console.warn('Speaking detection failed:', err)
    }
  }, [sendWs])

  // ── Join voice chat ──────────────────────────────────────────────────────
  const joinVoice = useCallback(async () => {
    try {
      setVoiceStatus('connecting')

      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS)
      localStreamRef.current = stream
      setMicPermission('granted')

      // Start muted by default
      stream.getAudioTracks().forEach(t => { t.enabled = false })
      setIsMuted(true)

      // Start speaking detection
      startSpeakingDetection()

      // Broadcast voice state
      sendWs({ type: 'voice_state', voice_enabled: true, is_muted: true })

      // Create offers to all connected participants who have voice enabled
      const voiceParticipants = participants.filter(
        p => p.user_id !== userId && p.connected && p.voice_enabled
      )

      for (const p of voiceParticipants) {
        const pc = createPeerConnection(p.user_id)
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          sendWs({
            type: 'rtc_offer',
            to_user_id: p.user_id,
            payload: pc.localDescription.toJSON(),
          })
        } catch (err) {
          console.error(`Failed to create offer for ${p.user_id}:`, err)
        }
      }

      setVoiceStatus('connected')
    } catch (err) {
      console.error('Failed to join voice:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermission('denied')
      }
      setVoiceStatus('error')
      cleanupAll()
    }
  }, [participants, userId, sendWs, createPeerConnection, startSpeakingDetection, cleanupAll])

  // ── Leave voice chat ─────────────────────────────────────────────────────
  const leaveVoice = useCallback(() => {
    cleanupAll()
    setVoiceStatus('idle')
    setIsMuted(true)
    sendWs({ type: 'voice_state', voice_enabled: false, is_muted: true })
  }, [cleanupAll, sendWs])

  // ── Toggle mute ──────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return
    const newMuted = !isMuted
    localStreamRef.current.getAudioTracks().forEach(t => {
      t.enabled = !newMuted
    })
    setIsMuted(newMuted)
    sendWs({ type: 'voice_state', voice_enabled: true, is_muted: newMuted })
  }, [isMuted, sendWs])

  // ── Handle incoming WebRTC signaling messages ────────────────────────────
  const handleSignaling = useCallback(async (msg) => {
    const { type, from_user_id, payload } = msg

    if (type === 'rtc_offer') {
      const pc = createPeerConnection(from_user_id)
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendWs({
          type: 'rtc_answer',
          to_user_id: from_user_id,
          payload: pc.localDescription.toJSON(),
        })
      } catch (err) {
        console.error('Failed to handle offer:', err)
      }
    } else if (type === 'rtc_answer') {
      const pc = peerConnectionsRef.current.get(from_user_id)
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload))
        } catch (err) {
          console.error('Failed to set answer:', err)
        }
      }
    } else if (type === 'ice_candidate') {
      const pc = peerConnectionsRef.current.get(from_user_id)
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload))
        } catch (err) {
          console.error('Failed to add ICE candidate:', err)
        }
      }
    } else if (type === 'voice_state') {
      // A remote user's voice state changed. If they just enabled voice, initiate connection
      if (msg.voice_enabled && msg.user_id !== userId && enabled) {
        if (!peerConnectionsRef.current.has(msg.user_id)) {
          const pc = createPeerConnection(msg.user_id)
          try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            sendWs({
              type: 'rtc_offer',
              to_user_id: msg.user_id,
              payload: pc.localDescription.toJSON(),
            })
          } catch (err) {
            console.error('Failed to initiate connection:', err)
          }
        }
      } else if (!msg.voice_enabled && msg.user_id !== userId) {
        // Remote user left voice — clean up their connection
        const pc = peerConnectionsRef.current.get(msg.user_id)
        if (pc) {
          pc.close()
          peerConnectionsRef.current.delete(msg.user_id)
        }
        const audioEl = audioElementsRef.current.get(msg.user_id)
        if (audioEl) {
          audioEl.srcObject = null
          audioEl.remove()
          audioElementsRef.current.delete(msg.user_id)
        }
        remoteStreamsRef.current.delete(msg.user_id)
      }
    } else if (type === 'speaker_activity') {
      setSpeakingUsers(prev => ({
        ...prev,
        [msg.user_id]: {
          isSpeaking: msg.is_speaking,
          volume: msg.volume || 0,
        },
      }))
    }
  }, [createPeerConnection, sendWs, userId, enabled])

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupAll()
    }
  }, [cleanupAll])

  return {
    voiceStatus,
    isMuted,
    micPermission,
    speakingUsers,
    joinVoice,
    leaveVoice,
    toggleMute,
    handleSignaling,
  }
}

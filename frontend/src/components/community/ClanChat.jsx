import { useState, useRef, useEffect } from 'react'
import useClanChat from '@/hooks/useClanChat'
import AudioPlayer from './AudioPlayer'
import FileUploader from './FileUploader'
import VoiceRecorder from './VoiceRecorder'
import useAppStore from '@/store/useAppStore'
import { studyPlansDB } from '@/services/firestore'

const s = {
  chatContainer: {
    display: 'flex', flexDirection: 'column', height: '550px',
    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, overflow: 'hidden'
  },
  messageList: {
    flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16
  },
  messageBubble: (isMe) => ({
    display: 'flex', flexDirection: 'column',
    alignSelf: isMe ? 'flex-end' : 'flex-start',
    maxWidth: '70%', gap: 4
  }),
  senderName: { fontSize: 11, color: '#666', fontWeight: 600, paddingLeft: 4 },
  bubbleContent: (isMe, type) => ({
    background: type === 'study_plan' ? 'rgba(26,20,40,0.95)' : isMe ? '#5c35aa' : '#1e1e2a',
    color: '#e8e4f0',
    padding: type === 'study_plan' ? '0' : '10px 14px',
    borderRadius: 12,
    border: type === 'study_plan' ? '1px solid #3d2060' : 'none',
    fontSize: 14,
    lineHeight: 1.4,
    wordBreak: 'break-word',
    boxShadow: isMe ? '0 2px 8px rgba(92,53,170,0.2)' : 'none'
  }),
  timestamp: { fontSize: 9, color: '#444', alignSelf: 'flex-end', marginTop: 2, fontFamily: 'monospace' },
  inputBar: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
    background: '#0f0f13', borderTop: '1px solid #1e1e2a'
  },
  textInput: {
    flex: 1, background: '#14121a', border: '1px solid #2a2a38', borderRadius: 8,
    padding: '10px 14px', color: '#e8e4f0', fontSize: 14, outline: 'none'
  },
  sendBtn: {
    background: '#5c35aa', border: 'none', borderRadius: 8, width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16
  },
  planBtn: {
    background: 'none', border: '1px solid #3d2060', borderRadius: 8, height: 36,
    padding: '0 12px', color: '#9b6dff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s'
  },
  micBtn: {
    background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
    color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 8, transition: 'background 0.15s'
  },
  imagePreview: {
    maxWidth: '100%', borderRadius: 8, marginTop: 4, display: 'block', cursor: 'pointer'
  },
  fileCard: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    background: '#14121a', border: '1px solid #2a2a38', borderRadius: 8, minWidth: 200
  },
  fileIcon: { fontSize: 24, color: '#9b6dff' },
  fileName: { fontSize: 13, fontWeight: 600, color: '#e8e4f0', textDecoration: 'none' },
  fileSize: { fontSize: 10, color: '#666', marginTop: 2 },
  planCard: {
    padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240
  },
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200
  },
  modalBox: {
    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 16, padding: '24px',
    width: '90%', maxWidth: 450, maxHeight: '70vh', overflowY: 'auto'
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#e8e4f0' },
  modalClose: { background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer' },
  planItem: {
    padding: '12px 14px', background: '#0f0f13', border: '1px solid #1e1e2a', borderRadius: 8,
    marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    transition: 'all 0.15s'
  }
}

const formatBytes = (bytes, decimals = 2) => {
  if (!bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export default function ClanChat({ clanId }) {
  const user = useAppStore((state) => state.auth.user)
  const { messages, loading, sendMessage, sendFile, sendVoice } = useClanChat(clanId)
  
  const [text, setText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [userPlans, setUserPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendText = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    const msgText = text
    setText('')
    await sendMessage(msgText, 'text')
  }

  const handleOpenPlanModal = async () => {
    if (!user) return
    setShowPlanModal(true)
    setLoadingPlans(true)
    try {
      const plans = await studyPlansDB.getAll(user.uid)
      setUserPlans(plans)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingPlans(false)
    }
  }

  const handleSharePlan = async (plan) => {
    setShowPlanModal(false)
    
    // Compute progress percentage
    const progress = plan.progress || {}
    const completedCount = Object.values(progress).filter(Boolean).length
    
    let totalTasks = 0
    if (plan.weeks && Array.isArray(plan.weeks)) {
      plan.weeks.forEach(w => {
        if (w.daily_tasks) {
          Object.values(w.daily_tasks).forEach(tasks => {
            if (Array.isArray(tasks)) totalTasks += tasks.length
          })
        }
      })
    }
    
    const pct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0

    await sendMessage(`Shared a Study Plan: ${plan.exam || 'Plan'}`, 'study_plan', {
      studyPlan: {
        id: plan.id,
        exam: plan.exam || 'Custom Study Goal',
        createdAt: plan.createdAt ? (plan.createdAt.seconds ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString() : plan.createdAt.toString()) : 'Recently',
        completion: pct
      }
    })
  }

  const renderMessageContent = (msg) => {
    switch (msg.type) {
      case 'file':
        if (msg.fileType === 'image') {
          return (
            <div>
              <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                <img src={msg.fileUrl} alt={msg.fileName} style={s.imagePreview} />
              </a>
            </div>
          )
        }
        return (
          <div style={s.fileCard}>
            <span style={s.fileIcon}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" style={s.fileName} title={msg.fileName}>
                {msg.fileName}
              </a>
              <div style={s.fileSize}>{formatBytes(msg.fileSize)}</div>
            </div>
          </div>
        )
      case 'voice':
        return <AudioPlayer src={msg.fileUrl} duration={msg.duration} />
      case 'study_plan':
        const plan = msg.studyPlan || {}
        return (
          <div style={s.planCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>📅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ffdb5b' }}>{plan.exam}</div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>Shared Study Plan</div>
              </div>
            </div>
            <div style={{ background: '#0f0f13', borderRadius: 8, padding: '10px 12px', border: '1px solid #1e1e2a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 6 }}>
                <span>Progress</span>
                <span style={{ fontWeight: 700, color: '#5bff9b' }}>{plan.completion || 0}%</span>
              </div>
              <div style={{ height: 6, background: '#1c172b', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${plan.completion || 0}%`, background: 'linear-gradient(90deg, #5bff9b, #9b6dff)', borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
              <span>Created: {plan.createdAt}</span>
            </div>
          </div>
        )
      default:
        return <div>{msg.content}</div>
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <div style={{ fontSize: 14, color: '#888' }}>Loading chat history...</div>
      </div>
    )
  }

  return (
    <div style={s.chatContainer}>
      {/* Messages */}
      <div style={s.messageList}>
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#444', fontSize: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
            <div>Welcome to the Clan! Type a message below to start chatting.</div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.uid
            const timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            return (
              <div key={msg.id} style={s.messageBubble(isMe)}>
                {!isMe && <span style={s.senderName}>{msg.senderName}</span>}
                <div style={s.bubbleContent(isMe, msg.type)}>
                  {renderMessageContent(msg)}
                </div>
                <span style={s.timestamp}>{timeStr}</span>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={s.inputBar}>
        {isRecording ? (
          <VoiceRecorder
            onSend={(blob, dur) => {
              sendVoice(blob, dur)
              setIsRecording(false)
            }}
            onCancel={() => setIsRecording(false)}
          />
        ) : (
          <>
            <FileUploader onSelectFile={sendFile} />
            
            <button
              onClick={() => setIsRecording(true)}
              style={s.micBtn}
              title="Record Voice"
            >
              🎤
            </button>

            <button
              onClick={handleOpenPlanModal}
              style={s.planBtn}
              title="Share Study Plan"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#9b6dff'
                e.currentTarget.style.background = '#1a1428'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#3d2060'
                e.currentTarget.style.background = 'none'
              }}
            >
              📅 Share Plan
            </button>

            <form onSubmit={handleSendText} style={{ flex: 1, display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Type your message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={s.textInput}
              />
              <button type="submit" style={s.sendBtn} title="Send Message">
                <span style={{ color: '#fff', fontSize: 14 }}>➔</span>
              </button>
            </form>
          </>
        )}
      </div>

      {/* Share Study Plan Modal */}
      {showPlanModal && (
        <div style={s.modal}>
          <div style={s.modalBox}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Share a Study Plan</h3>
              <button onClick={() => setShowPlanModal(false)} style={s.modalClose}>×</button>
            </div>
            {loadingPlans ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>Loading plans...</div>
            ) : userPlans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#666', fontSize: 14 }}>
                No saved study plans found. Create one in the "Study Plan" tab first!
              </div>
            ) : (
              <div>
                {userPlans.map((plan) => (
                  <div
                    key={plan.id}
                    style={s.planItem}
                    onClick={() => handleSharePlan(plan)}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#1a1428'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#0f0f13'}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e4f0' }}>{plan.exam || 'Custom Goal'}</div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                        Created: {plan.createdAt ? (plan.createdAt.seconds ? new Date(plan.createdAt.seconds * 1000).toLocaleDateString() : plan.createdAt.toString()) : 'Recently'}
                      </div>
                    </div>
                    <span style={{ color: '#9b6dff', fontSize: 13, fontWeight: 700 }}>Share ➔</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { clansAPI } from '@/services/api'
import useAppStore from '@/store/useAppStore'
import Spinner from '@/components/ui/Spinner'
import ClanChat from '@/components/community/ClanChat'
import useClanChat from '@/hooks/useClanChat'

const s = {
  page: { maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 },
  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#9b6dff',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 4,
  },
  header: {
    background: 'rgba(20,18,26,0.85)', backdropFilter: 'blur(12px)',
    border: '1px solid #1e1e2a', borderRadius: 16, padding: '28px', position: 'relative', overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(155,109,255,0.12) 0%, transparent 70%)', pointerEvents: 'none',
  },
  clanName: { fontFamily: '"DM Serif Display",Georgia,serif', fontSize: 32, fontWeight: 700, color: '#e8e4f0', marginBottom: 6 },
  clanDesc: { fontSize: 14, color: '#aaa', lineHeight: 1.5, marginBottom: 16 },
  statsRow: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  statPill: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px',
    background: '#1a1428', borderRadius: 8, border: '1px solid #2a1f40',
  },
  tabBar: { display: 'flex', gap: 2, background: '#0f0f13', borderRadius: 10, padding: 3 },
  tab: (active) => ({
    flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
    background: active ? '#1a1428' : 'transparent', color: active ? '#c4a8ff' : '#666',
  }),
  card: { background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: '20px' },
  memberRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 10, transition: 'all 0.15s',
  },
  avatar: {
    width: 40, height: 40, borderRadius: '50%', background: '#2a1f40',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, color: '#9b6dff', fontWeight: 700, flexShrink: 0,
  },
  roleBadge: (role) => ({
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
    background: role === 'leader' ? '#2a2000' : role === 'admin' ? '#0a1a3a' : '#1a1a24',
    color: role === 'leader' ? '#ffdb5b' : role === 'admin' ? '#5bbdff' : '#888',
    border: `1px solid ${role === 'leader' ? '#3a2a00' : role === 'admin' ? '#1a2a4a' : '#2a2a38'}`,
  }),
  joinBadge: (type) => ({
    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
    background: type === 'public' ? '#0a2a1a' : '#2a1a00',
    color: type === 'public' ? '#5bff9b' : '#ffdb5b',
  }),
  btn: {
    padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s',
  },
  btnPrimary: { background: '#5c35aa', color: '#fff' },
  btnGhost: { background: 'transparent', color: '#9b6dff', border: '1px solid #3d2060' },
  btnDanger: { background: '#3a1a1a', color: '#ff8080', border: '1px solid #3a2020' },
  btnSmall: { fontSize: 11, padding: '4px 10px' },
  empty: { textAlign: 'center', padding: '40px 20px', color: '#555', fontSize: 14 },
  placeholder: {
    textAlign: 'center', padding: '60px 20px', color: '#444', fontSize: 15,
    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12,
  },
}

const initials = (name) => (name || '?').charAt(0).toUpperCase()

const formatBytes = (bytes, decimals = 2) => {
  if (!bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export default function ClanDashboard() {
  const { clanId } = useParams()
  const navigate = useNavigate()
  const showToast = useAppStore(s => s.showToast)
  const { messages } = useClanChat(clanId)

  const [clan, setClan] = useState(null)
  const [members, setMembers] = useState([])
  const [joinRequests, setJoinRequests] = useState([])
  const [myRole, setMyRole] = useState('member')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  const fetchData = useCallback(async () => {
    try {
      const [clanRes, membersRes] = await Promise.all([
        clansAPI.get(clanId),
        clansAPI.getMembers(clanId),
      ])
      setClan(clanRes.data)
      setMembers(membersRes.data)

      // Determine my role from auth store
      const user = useAppStore.getState().auth?.user
      const uid = user?.uid || 'dev-user-001'
      const me = membersRes.data.find(m => m.userId === uid || m.uid === uid)
      const role = me?.role || 'member'
      setMyRole(role)

      // Fetch join requests if leader/admin
      if (role === 'leader' || role === 'admin') {
        try {
          const reqRes = await clansAPI.getJoinRequests(clanId)
          setJoinRequests(reqRes.data)
        } catch { /* ignore */ }
      }
    } catch (e) {
      showToast('Failed to load clan', 'error')
    }
    setLoading(false)
  }, [clanId, showToast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this clan?')) return
    try {
      await clansAPI.leave(clanId)
      showToast('Left clan', 'success')
      navigate('/community')
    } catch (e) { showToast(e.response?.data?.detail || 'Failed to leave', 'error') }
  }

  const handleDelete = async () => {
    if (!confirm('⚠️ This will permanently delete the clan and all its data. Are you sure?')) return
    try {
      await clansAPI.delete(clanId)
      showToast('Clan deleted', 'success')
      navigate('/community')
    } catch (e) { showToast(e.response?.data?.detail || 'Failed to delete', 'error') }
  }

  const handleRemoveMember = async (uid) => {
    if (!confirm('Remove this member?')) return
    try {
      await clansAPI.removeMember(clanId, uid)
      showToast('Member removed', 'success')
      fetchData()
    } catch (e) { showToast(e.response?.data?.detail || 'Failed', 'error') }
  }

  const handleUpdateRole = async (uid, newRole) => {
    try {
      await clansAPI.updateRole(clanId, uid, newRole)
      showToast(`Role updated to ${newRole}`, 'success')
      fetchData()
    } catch (e) { showToast(e.response?.data?.detail || 'Failed', 'error') }
  }

  const handleAcceptRequest = async (reqId) => {
    try {
      await clansAPI.acceptJoinRequest(clanId, reqId)
      showToast('Request accepted', 'success')
      fetchData()
    } catch (e) { showToast(e.response?.data?.detail || 'Failed', 'error') }
  }

  const handleRejectRequest = async (reqId) => {
    try {
      await clansAPI.rejectJoinRequest(clanId, reqId)
      showToast('Request rejected', 'success')
      setJoinRequests(r => r.filter(x => x.id !== reqId))
    } catch { showToast('Failed', 'error') }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
      <Spinner size="lg" />
    </div>
  )

  if (!clan) return (
    <div style={s.page}>
      <div style={s.empty}>Clan not found.</div>
      <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => navigate('/community')}>← Back to Community</button>
    </div>
  )

  return (
    <div style={s.page}>
      {/* Back button */}
      <button style={s.backBtn} onClick={() => navigate('/community')}>← Back to Community</button>

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerGlow} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={s.clanName}>{clan.name}</h1>
            <p style={s.clanDesc}>{clan.description || 'No description'}</p>
            <div style={s.statsRow}>
              <div style={s.statPill}><span style={{ color: '#9b6dff' }}>👥</span> <span style={{ color: '#e8e4f0', fontWeight: 700 }}>{clan.memberCount}</span><span style={{ color: '#666' }}>/ {clan.maxMembers}</span></div>
              <div style={s.statPill}><span style={{ color: '#9b6dff' }}>👑</span> <span style={{ color: '#e8e4f0' }}>{clan.leaderName}</span></div>
              <span style={s.joinBadge(clan.joinType)}>{clan.joinType === 'public' ? '🌐 Public' : '🔒 Invite Only'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {myRole === 'leader' && <button style={{ ...s.btn, ...s.btnDanger }} onClick={handleDelete}>🗑 Delete</button>}
            {myRole !== 'leader' && <button style={{ ...s.btn, ...s.btnGhost }} onClick={handleLeave}>🚪 Leave</button>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        <button style={s.tab(tab === 'overview')} onClick={() => setTab('overview')}>Overview</button>
        <button style={s.tab(tab === 'members')} onClick={() => setTab('members')}>Members ({members.length})</button>
        <button style={s.tab(tab === 'chat')} onClick={() => setTab('chat')}>Chat</button>
        <button style={s.tab(tab === 'files')} onClick={() => setTab('files')}>Files</button>
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div style={s.card}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e8e4f0', marginBottom: 16 }}>Clan Overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div style={{ padding: 16, background: '#0f0f13', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#9b6dff' }}>{clan.memberCount}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Members</div>
            </div>
            <div style={{ padding: 16, background: '#0f0f13', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#5bbdff' }}>{clan.maxMembers - clan.memberCount}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Spots Available</div>
            </div>
            <div style={{ padding: 16, background: '#0f0f13', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#5bff9b' }}>{members.filter(m => m.role === 'admin').length}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Admins</div>
            </div>
          </div>
          <div style={{ marginTop: 20, padding: 16, background: '#0f0f13', borderRadius: 10 }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Your Role</div>
            <span style={s.roleBadge(myRole)}>{myRole}</span>
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div>
          {/* Join Requests */}
          {(myRole === 'leader' || myRole === 'admin') && joinRequests.length > 0 && (
            <div style={{ ...s.card, marginBottom: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#ffdb5b', marginBottom: 12 }}>
                ⏳ Pending Join Requests ({joinRequests.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {joinRequests.map(req => (
                  <div key={req.id} style={s.memberRow}>
                    <div style={s.avatar}>{initials(req.displayName)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e4f0' }}>{req.displayName || 'Student'}</div>
                      <div style={{ fontSize: 11, color: '#9b6dff', fontFamily: '"JetBrains Mono",monospace' }}>{req.registerId}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={{ ...s.btn, ...s.btnSmall, background: '#0a2a1a', color: '#5bff9b', border: '1px solid #1a3a2a' }}
                        onClick={() => handleAcceptRequest(req.id)}>Accept</button>
                      <button style={{ ...s.btn, ...s.btnSmall, ...s.btnDanger }} onClick={() => handleRejectRequest(req.id)}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(member => {
              const uid = member.userId || member.uid
              return (
                <div key={uid} style={s.memberRow}>
                  <div style={s.avatar}>{initials(member.displayName)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e4f0' }}>{member.displayName || 'Student'}</span>
                      <span style={s.roleBadge(member.role)}>{member.role}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#888', fontFamily: '"JetBrains Mono",monospace' }}>{member.registerId}</div>
                  </div>
                  {/* Leader actions on non-leaders */}
                  {myRole === 'leader' && member.role !== 'leader' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {member.role === 'member' && (
                        <button style={{ ...s.btn, ...s.btnSmall, background: '#0a1a3a', color: '#5bbdff', border: '1px solid #1a2a4a' }}
                          onClick={() => handleUpdateRole(uid, 'admin')} title="Promote to Admin">⬆</button>
                      )}
                      {member.role === 'admin' && (
                        <button style={{ ...s.btn, ...s.btnSmall, ...s.btnGhost }}
                          onClick={() => handleUpdateRole(uid, 'member')} title="Demote to Member">⬇</button>
                      )}
                      <button style={{ ...s.btn, ...s.btnSmall, ...s.btnDanger }}
                        onClick={() => handleRemoveMember(uid)} title="Remove Member">✕</button>
                    </div>
                  )}
                  {/* Admin actions on regular members */}
                  {myRole === 'admin' && member.role === 'member' && (
                    <button style={{ ...s.btn, ...s.btnSmall, ...s.btnDanger }}
                      onClick={() => handleRemoveMember(uid)} title="Remove Member">✕</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'chat' && (
        <ClanChat clanId={clanId} />
      )}

      {tab === 'files' && (
        <div>
          {messages && messages.filter(m => m.type === 'file').length === 0 ? (
            <div style={s.placeholder}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e4f0', marginBottom: 8 }}>Shared Files</div>
              <div>No shared files yet. Upload some in the Chat tab!</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {messages.filter(m => m.type === 'file').map((fileMsg) => (
                <div key={fileMsg.id} style={{ ...s.card, display: 'flex', flexDirection: 'column', gap: 12, background: '#14121a', border: '1px solid #1e1e2a', padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{fileMsg.fileType === 'image' ? '🖼️' : '📄'}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e4f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileMsg.fileName}>
                        {fileMsg.fileName}
                      </div>
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{formatBytes(fileMsg.fileSize)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#555', marginTop: 'auto', borderTop: '1px solid #1e1e2a', paddingTop: 8 }}>
                    <span>By: {fileMsg.senderName}</span>
                    <a href={fileMsg.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#9b6dff', fontWeight: 600, textDecoration: 'none' }}>Download ➔</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

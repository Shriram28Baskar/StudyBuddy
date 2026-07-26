import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI, friendsAPI, clansAPI } from '@/services/api'
import useAppStore from '@/store/useAppStore'
import Spinner from '@/components/ui/Spinner'

// ── Inline styles ────────────────────────────────────────────────────
const s = {
  page: { maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 },
  header: { textAlign: 'center', marginBottom: 8 },
  title: {
    fontFamily: '"DM Serif Display",Georgia,serif', fontSize: 36, fontWeight: 700,
    background: 'linear-gradient(135deg, #9b6dff 0%, #5bbdff 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6,
  },
  subtitle: { fontSize: 14, color: '#888', letterSpacing: '0.02em' },

  profileCard: {
    background: 'rgba(20,18,26,0.85)', backdropFilter: 'blur(12px)',
    border: '1px solid #1e1e2a', borderRadius: 16, padding: '24px 28px',
    display: 'flex', alignItems: 'center', gap: 20, position: 'relative', overflow: 'hidden',
  },
  profileGlow: {
    position: 'absolute', top: -40, right: -40, width: 120, height: 120,
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(155,109,255,0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  avatar: {
    width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #5c35aa, #9b6dff)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff',
    fontWeight: 700, flexShrink: 0, border: '2px solid #3d2060',
  },
  regId: {
    fontSize: 13, color: '#9b6dff', fontFamily: '"JetBrains Mono",monospace',
    background: '#1a1428', padding: '4px 10px', borderRadius: 6,
    border: '1px solid #3d2060', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
    transition: 'all 0.15s',
  },
  stat: { textAlign: 'center', minWidth: 60 },
  statNum: { fontSize: 20, fontWeight: 700, color: '#e8e4f0' },
  statLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' },

  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 },
  actionCard: {
    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 14, padding: '28px 24px',
    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center', position: 'relative', overflow: 'hidden',
  },
  actionIcon: { fontSize: 36, marginBottom: 12, display: 'block' },
  actionTitle: { fontSize: 16, fontWeight: 700, color: '#e8e4f0', marginBottom: 6 },
  actionDesc: { fontSize: 12, color: '#888', lineHeight: 1.4 },

  sectionTitle: {
    fontSize: 18, fontWeight: 700, color: '#e8e4f0', marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 10,
  },
  sectionBadge: {
    fontSize: 11, color: '#9b6dff', background: '#1a1428', padding: '2px 8px',
    borderRadius: 10, fontWeight: 600,
  },

  clanGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  clanCard: {
    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: '20px',
    cursor: 'pointer', transition: 'all 0.2s',
  },
  friendRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 10, transition: 'all 0.15s',
  },
  friendAvatar: {
    width: 36, height: 36, borderRadius: '50%', background: '#2a1f40',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, color: '#9b6dff', fontWeight: 700, flexShrink: 0,
  },

  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
  },
  modalBox: {
    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 16, padding: '28px',
    width: '90%', maxWidth: 500, maxHeight: '80vh', overflowY: 'auto', position: 'relative',
  },
  modalTitle: { fontSize: 20, fontWeight: 700, color: '#e8e4f0', marginBottom: 20 },
  modalClose: {
    position: 'absolute', top: 16, right: 16, background: 'none', border: 'none',
    color: '#666', fontSize: 20, cursor: 'pointer',
  },
  input: {
    width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #2a2a38',
    background: '#0f0f13', color: '#e8e4f0', fontSize: 14, outline: 'none',
    transition: 'border 0.15s', boxSizing: 'border-box',
  },
  btn: {
    padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s',
  },
  btnPrimary: { background: '#5c35aa', color: '#fff' },
  btnGhost: { background: 'transparent', color: '#9b6dff', border: '1px solid #3d2060' },
  btnDanger: { background: '#3a1a1a', color: '#ff8080', border: '1px solid #3a2020' },
  btnSuccess: { background: '#0a2a1a', color: '#5bff9b', border: '1px solid #1a3a2a' },

  joinBadge: (type) => ({
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
    background: type === 'public' ? '#0a2a1a' : '#2a1a00',
    color: type === 'public' ? '#5bff9b' : '#ffdb5b',
    border: `1px solid ${type === 'public' ? '#1a3a2a' : '#3a2a00'}`,
  }),
  roleBadge: (role) => ({
    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
    background: role === 'leader' ? '#2a2000' : role === 'admin' ? '#0a1a3a' : '#1a1a24',
    color: role === 'leader' ? '#ffdb5b' : role === 'admin' ? '#5bbdff' : '#888',
    border: `1px solid ${role === 'leader' ? '#3a2a00' : role === 'admin' ? '#1a2a4a' : '#2a2a38'}`,
  }),

  empty: { textAlign: 'center', padding: '40px 20px', color: '#555', fontSize: 14 },
  tabBar: { display: 'flex', gap: 2, background: '#0f0f13', borderRadius: 10, padding: 3, marginBottom: 16 },
  tab: (active) => ({
    flex: 1, padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
    background: active ? '#1a1428' : 'transparent',
    color: active ? '#c4a8ff' : '#666',
  }),
}

// ── Helpers ──────────────────────────────────────────────────────────
const initials = (name) => (name || '?').charAt(0).toUpperCase()

export default function Community() {
  const navigate = useNavigate()
  const showToast = useAppStore(s => s.showToast)

  const [profile, setProfile] = useState(null)
  const [clans, setClans] = useState([])
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(null) // 'create_clan' | 'search_clan' | 'add_friend' | 'friend_requests'

  // Fetch profile, clans, friends on mount
  useEffect(() => {
    (async () => {
      try {
        const [profRes, clansRes, friendsRes] = await Promise.allSettled([
          usersAPI.getProfile(),
          clansAPI.getMy(),
          friendsAPI.getFriends(),
        ])
        if (profRes.status === 'fulfilled') setProfile(profRes.value.data)
        if (clansRes.status === 'fulfilled') setClans(clansRes.value.data)
        if (friendsRes.status === 'fulfilled') setFriends(friendsRes.value.data)
      } catch {
        showToast('Failed to load community data', 'error')
      }
      setLoading(false)
    })()
  }, [showToast])

  const copyRegisterId = useCallback(() => {
    if (!profile?.registerId) return
    navigator.clipboard.writeText(profile.registerId)
    showToast('Register ID copied!', 'success')
  }, [profile, showToast])

  const refresh = useCallback(async () => {
    try {
      const [clansRes, friendsRes] = await Promise.allSettled([
        clansAPI.getMy(), friendsAPI.getFriends(),
      ])
      if (clansRes.status === 'fulfilled') setClans(clansRes.value.data)
      if (friendsRes.status === 'fulfilled') setFriends(friendsRes.value.data)
    } catch { /* ignore */ }
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
      <Spinner size="lg" />
    </div>
  )

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>Community</h1>
        <p style={s.subtitle}>Create clans, find friends, and study together</p>
      </div>

      {/* Profile Card */}
      {profile && (
        <div style={s.profileCard}>
          <div style={s.profileGlow} />
          <div style={s.avatar}>{initials(profile.displayName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e4f0', marginBottom: 4 }}>
              {profile.displayName || 'Student'}
            </div>
            <div style={s.regId} onClick={copyRegisterId} title="Click to copy">
              {profile.registerId || 'Generating...'}
              <span style={{ fontSize: 12, opacity: 0.6 }}>📋</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={s.stat}>
              <div style={s.statNum}>{friends.length}</div>
              <div style={s.statLabel}>Friends</div>
            </div>
            <div style={s.stat}>
              <div style={s.statNum}>{clans.length}</div>
              <div style={s.statLabel}>Clans</div>
            </div>
          </div>
        </div>
      )}

      {/* Action Cards */}
      <div style={s.grid3}>
        <div style={s.actionCard}
          onClick={() => setModal('create_clan')}
          onMouseEnter={e => { e.currentTarget.style.borderColor='#3d2060'; e.currentTarget.style.transform='translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='#1e1e2a'; e.currentTarget.style.transform='none' }}>
          <span style={s.actionIcon}>🏰</span>
          <div style={s.actionTitle}>Create a Clan</div>
          <div style={s.actionDesc}>Build your study community and invite members</div>
        </div>
        <div style={s.actionCard}
          onClick={() => setModal('search_clan')}
          onMouseEnter={e => { e.currentTarget.style.borderColor='#1a3a4a'; e.currentTarget.style.transform='translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='#1e1e2a'; e.currentTarget.style.transform='none' }}>
          <span style={s.actionIcon}>🔍</span>
          <div style={s.actionTitle}>Join / Search Clan</div>
          <div style={s.actionDesc}>Find study groups that match your interests</div>
        </div>
        <div style={s.actionCard}
          onClick={() => setModal('add_friend')}
          onMouseEnter={e => { e.currentTarget.style.borderColor='#1a3a1a'; e.currentTarget.style.transform='translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='#1e1e2a'; e.currentTarget.style.transform='none' }}>
          <span style={s.actionIcon}>👥</span>
          <div style={s.actionTitle}>Add a Friend</div>
          <div style={s.actionDesc}>Connect with fellow students by Register ID</div>
        </div>
      </div>

      {/* My Clans */}
      <div>
        <div style={s.sectionTitle}>
          🏰 My Clans <span style={s.sectionBadge}>{clans.length}</span>
        </div>
        {clans.length === 0 ? (
          <div style={s.empty}>You haven't joined any clans yet. Create or search for one!</div>
        ) : (
          <div style={s.clanGrid}>
            {clans.map(clan => (
              <div key={clan.id} style={s.clanCard}
                onClick={() => navigate(`/community/clan/${clan.id}`)}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#3d2060'; e.currentTarget.style.transform='translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#1e1e2a'; e.currentTarget.style.transform='none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e4f0' }}>{clan.name}</div>
                  <span style={s.roleBadge(clan.myRole)}>{clan.myRole}</span>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10, lineHeight: 1.4 }}>
                  {(clan.description || 'No description').slice(0, 80)}{clan.description?.length > 80 ? '...' : ''}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#666' }}>
                  <span>👥 {clan.memberCount}/{clan.maxMembers}</span>
                  <span style={s.joinBadge(clan.joinType)}>{clan.joinType}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friends */}
      <div>
        <div style={s.sectionTitle}>
          👥 Friends <span style={s.sectionBadge}>{friends.length}</span>
          <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '4px 12px', marginLeft: 'auto' }}
            onClick={() => setModal('friend_requests')}>
            📬 Requests
          </button>
        </div>
        {friends.length === 0 ? (
          <div style={s.empty}>No friends yet. Add friends using their Register ID!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {friends.map(f => (
              <div key={f.friendshipId} style={s.friendRow}>
                <div style={s.friendAvatar}>{initials(f.displayName)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e4f0' }}>{f.displayName || 'Student'}</div>
                  <div style={{ fontSize: 11, color: '#9b6dff', fontFamily: '"JetBrains Mono",monospace' }}>{f.registerId}</div>
                </div>
                <button style={{ ...s.btn, ...s.btnDanger, fontSize: 11, padding: '4px 10px' }}
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!confirm('Remove this friend?')) return
                    try { await friendsAPI.removeFriend(f.friendshipId); refresh(); showToast('Friend removed', 'success') }
                    catch { showToast('Failed to remove friend', 'error') }
                  }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'create_clan' && <CreateClanModal onClose={() => setModal(null)} onCreated={(clan) => { setModal(null); navigate(`/community/clan/${clan.id}`) }} />}
      {modal === 'search_clan' && <SearchClanModal onClose={() => setModal(null)} onJoined={refresh} />}
      {modal === 'add_friend' && <AddFriendModal onClose={() => setModal(null)} onSent={refresh} />}
      {modal === 'friend_requests' && <FriendRequestsModal onClose={() => setModal(null)} onAction={refresh} />}
    </div>
  )
}

// ── Create Clan Modal ────────────────────────────────────────────────
function CreateClanModal({ onClose, onCreated }) {
  const showToast = useAppStore(s => s.showToast)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [maxMembers, setMaxMembers] = useState(50)
  const [joinType, setJoinType] = useState('public')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || name.trim().length < 3) { showToast('Name must be at least 3 characters', 'error'); return }
    setCreating(true)
    try {
      const { data } = await clansAPI.create({ name, description: desc, maxMembers, joinType })
      showToast('Clan created!', 'success')
      onCreated(data)
    } catch (e) {
      showToast(e.response?.data?.detail || 'Failed to create clan', 'error')
    }
    setCreating(false)
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalBox} onClick={e => e.stopPropagation()}>
        <button style={s.modalClose} onClick={onClose}>✕</button>
        <div style={s.modalTitle}>🏰 Create a Clan</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: '#888', marginBottom: 4, display: 'block' }}>Clan Name *</label>
            <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Data Structures Gang" maxLength={30} />
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{name.length}/30 characters</div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#888', marginBottom: 4, display: 'block' }}>Description</label>
            <textarea style={{ ...s.input, minHeight: 80, resize: 'vertical' }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's your clan about?" maxLength={500} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#888', marginBottom: 4, display: 'block' }}>Max Members: {maxMembers}</label>
            <input type="range" min={2} max={100} value={maxMembers} onChange={e => setMaxMembers(+e.target.value)}
              style={{ width: '100%', accentColor: '#9b6dff' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#888', marginBottom: 8, display: 'block' }}>Join Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...s.btn, ...(joinType === 'public' ? s.btnSuccess : s.btnGhost), flex: 1 }}
                onClick={() => setJoinType('public')}>🌐 Public</button>
              <button style={{ ...s.btn, ...(joinType === 'invite_only' ? { background: '#2a1a00', color: '#ffdb5b', border: '1px solid #3a2a00' } : s.btnGhost), flex: 1 }}
                onClick={() => setJoinType('invite_only')}>🔒 Invite Only</button>
            </div>
          </div>
          <button style={{ ...s.btn, ...s.btnPrimary, width: '100%', marginTop: 4 }}
            onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Clan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Search Clan Modal ────────────────────────────────────────────────
function SearchClanModal({ onClose, onJoined }) {
  const showToast = useAppStore(s => s.showToast)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [joining, setJoining] = useState(null)

  const search = useCallback(async () => {
    setSearching(true)
    try {
      const { data } = await clansAPI.search(query)
      setResults(data)
    } catch { showToast('Search failed', 'error') }
    setSearching(false)
  }, [query, showToast])

  useEffect(() => { search() }, []) // Load recent on mount

  const handleJoin = async (clanId) => {
    setJoining(clanId)
    try {
      const { data } = await clansAPI.join(clanId)
      if (data.status === 'joined') showToast('Joined clan!', 'success')
      else showToast('Join request sent!', 'success')
      onJoined()
      search()
    } catch (e) { showToast(e.response?.data?.detail || 'Failed to join', 'error') }
    setJoining(null)
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={{ ...s.modalBox, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <button style={s.modalClose} onClick={onClose}>✕</button>
        <div style={s.modalTitle}>🔍 Search Clans</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input style={{ ...s.input, flex: 1 }} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by clan name..." onKeyDown={e => e.key === 'Enter' && search()} />
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={search} disabled={searching}>
            {searching ? '...' : 'Search'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.length === 0 && !searching && <div style={s.empty}>No clans found</div>}
          {results.map(clan => (
            <div key={clan.id} style={{ ...s.clanCard, cursor: 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e4f0', marginBottom: 4 }}>{clan.name}</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                  {(clan.description || 'No description').slice(0, 60)}
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#666' }}>
                  <span>👥 {clan.memberCount}/{clan.maxMembers}</span>
                  <span>👑 {clan.leaderName || 'Unknown'}</span>
                  <span style={s.joinBadge(clan.joinType)}>{clan.joinType}</span>
                </div>
              </div>
              <button style={{ ...s.btn, ...s.btnPrimary, fontSize: 12, padding: '6px 14px' }}
                onClick={() => handleJoin(clan.id)} disabled={joining === clan.id}>
                {joining === clan.id ? '...' : clan.joinType === 'public' ? 'Join' : 'Request'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Add Friend Modal ─────────────────────────────────────────────────
function AddFriendModal({ onClose, onSent }) {
  const showToast = useAppStore(s => s.showToast)
  const [regId, setRegId] = useState('')
  const [foundUser, setFoundUser] = useState(null)
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)

  const search = async () => {
    if (!regId.trim()) return
    setSearching(true); setFoundUser(null)
    try {
      const { data } = await usersAPI.searchByRegisterId(regId.trim())
      setFoundUser(data)
    } catch { setFoundUser(null); showToast('User not found', 'error') }
    setSearching(false)
  }

  const sendRequest = async () => {
    setSending(true)
    try {
      await friendsAPI.sendRequest(regId.trim())
      showToast('Friend request sent!', 'success')
      onSent(); onClose()
    } catch (e) { showToast(e.response?.data?.detail || 'Failed to send request', 'error') }
    setSending(false)
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalBox} onClick={e => e.stopPropagation()}>
        <button style={s.modalClose} onClick={onClose}>✕</button>
        <div style={s.modalTitle}>👥 Add a Friend</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input style={{ ...s.input, flex: 1, fontFamily: '"JetBrains Mono",monospace' }}
            value={regId} onChange={e => setRegId(e.target.value)}
            placeholder="SB-2026-000123" onKeyDown={e => e.key === 'Enter' && search()} />
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={search} disabled={searching}>
            {searching ? '...' : 'Search'}
          </button>
        </div>
        {foundUser && (
          <div style={{ ...s.friendRow, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={s.friendAvatar}>{initials(foundUser.displayName)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e4f0' }}>{foundUser.displayName || 'Student'}</div>
                <div style={{ fontSize: 11, color: '#9b6dff', fontFamily: '"JetBrains Mono",monospace' }}>{foundUser.registerId}</div>
              </div>
            </div>
            <button style={{ ...s.btn, ...s.btnSuccess, fontSize: 12 }}
              onClick={sendRequest} disabled={sending}>
              {sending ? '...' : '📤 Send Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Friend Requests Modal ────────────────────────────────────────────
function FriendRequestsModal({ onClose, onAction }) {
  const showToast = useAppStore(s => s.showToast)
  const [tab, setTab] = useState('received')
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [recRes, sentRes] = await Promise.allSettled([
          friendsAPI.getReceivedRequests(),
          friendsAPI.getSentRequests(),
        ])
        if (recRes.status === 'fulfilled') setReceived(recRes.value.data)
        if (sentRes.status === 'fulfilled') setSent(sentRes.value.data)
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  const handleAccept = async (id) => {
    try { await friendsAPI.acceptRequest(id); showToast('Friend added!', 'success'); onAction(); onClose() }
    catch (e) { showToast(e.response?.data?.detail || 'Failed', 'error') }
  }
  const handleReject = async (id) => {
    try { await friendsAPI.rejectRequest(id); showToast('Request rejected', 'success'); setReceived(r => r.filter(x => x.id !== id)) }
    catch { showToast('Failed', 'error') }
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalBox} onClick={e => e.stopPropagation()}>
        <button style={s.modalClose} onClick={onClose}>✕</button>
        <div style={s.modalTitle}>📬 Friend Requests</div>
        <div style={s.tabBar}>
          <button style={s.tab(tab === 'received')} onClick={() => setTab('received')}>Received ({received.length})</button>
          <button style={s.tab(tab === 'sent')} onClick={() => setTab('sent')}>Sent ({sent.length})</button>
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tab === 'received' && received.length === 0 && <div style={s.empty}>No pending requests</div>}
            {tab === 'received' && received.map(req => (
              <div key={req.id} style={s.friendRow}>
                <div style={s.friendAvatar}>{initials(req.fromName)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e4f0' }}>{req.fromName || 'Student'}</div>
                  <div style={{ fontSize: 11, color: '#9b6dff', fontFamily: '"JetBrains Mono",monospace' }}>{req.fromRegisterId}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...s.btn, ...s.btnSuccess, fontSize: 11, padding: '4px 10px' }} onClick={() => handleAccept(req.id)}>Accept</button>
                  <button style={{ ...s.btn, ...s.btnDanger, fontSize: 11, padding: '4px 10px' }} onClick={() => handleReject(req.id)}>Reject</button>
                </div>
              </div>
            ))}
            {tab === 'sent' && sent.length === 0 && <div style={s.empty}>No sent requests</div>}
            {tab === 'sent' && sent.map(req => (
              <div key={req.id} style={s.friendRow}>
                <div style={s.friendAvatar}>{initials(req.toName)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e4f0' }}>{req.toName || 'Student'}</div>
                  <div style={{ fontSize: 11, color: '#9b6dff', fontFamily: '"JetBrains Mono",monospace' }}>{req.toRegisterId}</div>
                </div>
                <span style={{ fontSize: 11, color: '#ffdb5b', fontWeight: 600 }}>⏳ Pending</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
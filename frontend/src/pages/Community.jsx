import { useState, useEffect } from 'react'
import { postsDB } from '@/services/firestore'
import useAppStore from '@/store/useAppStore'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'

const TAG_VARIANT = { 'Study Plan': 'brand', Discussion: 'blue', Tips: 'orange', Doubt: 'pink', Resource: 'green' }
const TAGS = ['Discussion', 'Study Plan', 'Tips', 'Doubt', 'Resource']

export default function Community() {
  const userId   = useAppStore((s) => s.auth.user?.uid ?? 'guest')
  const showToast = useAppStore((s) => s.showToast)

  const [posts,    setPosts]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ title: '', body: '', tag: 'Discussion' })
  const [posting,  setPosting]  = useState(false)
  const [liked,    setLiked]    = useState(new Set())

  // Real-time Firestore listener
  useEffect(() => {
    setLoading(true)
    const unsub = postsDB.subscribe((data) => {
      setPosts(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  async function handlePost() {
    if (!form.title.trim()) return
    setPosting(true)
    try {
      await postsDB.create({ userId, title: form.title, body: form.body, tag: form.tag })
      setForm({ title: '', body: '', tag: 'Discussion' })
      setShowForm(false)
      showToast('Post created!', 'success')
    } catch {
      showToast('Failed to post. Try again.', 'error')
    } finally {
      setPosting(false)
    }
  }

  async function handleLike(postId) {
    if (liked.has(postId)) return
    setLiked(prev => new Set([...prev, postId]))
    try { await postsDB.like(postId) } catch { /* optimistic — ignore */ }
  }

  return (
    <div style={{ maxWidth: 720, animation: 'fadeUp 0.2s ease-out' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: '"DM Serif Display",Georgia,serif', fontWeight: 400, fontSize: 28, color: '#e8e4f0', marginBottom: 4 }}>Community</h1>
          <p style={{ color: '#555', fontSize: 13 }}>Share plans, ask doubts, learn together.</p>
        </div>
        <Button variant="outline" onClick={() => setShowForm(!showForm)}>+ New Post</Button>
      </div>

      {/* New post form */}
      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Post title..."
              style={{ background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '9px 12px', color: '#ccc', fontSize: 14, outline: 'none' }} />
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Share your thoughts, tips, or questions..."
              rows={4}
              style={{ background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '9px 12px', color: '#ccc', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
                style={{ background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '7px 10px', color: '#ccc', fontSize: 13, outline: 'none' }}>
                {TAGS.map(t => <option key={t}>{t}</option>)}
              </select>
              <Button variant="primary" loading={posting} onClick={handlePost}>Post</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Feed */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#444', fontSize: 13 }}>Loading posts...</div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>◉</div>
          <div style={{ fontSize: 14 }}>No posts yet. Be the first to share!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {posts.map((post, i) => (
            <div key={post.id} style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: 18, animation: `fadeUp 0.18s ease-out ${i * 0.04}s both` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1428', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#9b6dff', fontWeight: 600 }}>
                    {(post.userId ?? 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#888' }}>{post.userId === userId ? 'You' : 'Student'}</span>
                    <span style={{ fontSize: 11, color: '#444', marginLeft: 8 }}>
                      {post.timestamp instanceof Date ? post.timestamp.toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
                <Badge variant={TAG_VARIANT[post.tag] ?? 'default'} size="sm">{post.tag}</Badge>
              </div>

              <div style={{ fontSize: 15, fontWeight: 500, color: '#ddd', marginBottom: 6 }}>{post.title}</div>
              {post.body && <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6, marginBottom: 12 }}>{post.body}</div>}

              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <button
                  onClick={() => handleLike(post.id)}
                  style={{ background: 'none', border: 'none', color: liked.has(post.id) ? '#9b6dff' : '#555', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, transition: 'color 0.15s' }}>
                  ↑ {(post.likes ?? 0) + (liked.has(post.id) ? 1 : 0)}
                </button>
                <span style={{ fontSize: 12, color: '#444' }}>◎ {post.commentCount ?? 0} comments</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
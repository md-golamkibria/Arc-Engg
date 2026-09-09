import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import LightPillar from '../components/LightPillar.jsx'
import CalendarConnectButton from '../components/CalendarConnectButton.jsx'
import MapPicker from '../components/MapPicker.jsx'
import AssistantWidget from '../components/AssistantWidget.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5002'

function Portal({ children }){
  if (typeof document === 'undefined') return null
  return ReactDOM.createPortal(children, document.body)
}

// Simple notifications bell for client and provider
function NotificationsBell({ me, token }){
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  async function load(){
    if (!token) return
    try{
      const r = await fetch(`${API_BASE}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){ const d = await r.json(); setItems(d.items||[]); setUnread(d.unread||0) }
    }catch{}
  }
  async function markOne(id){ try{ await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(id)}/read`, { method:'POST', headers: { Authorization: `Bearer ${token}` } }); load() }catch{} }
  async function markAll(){ try{ await fetch(`${API_BASE}/api/notifications/read-all`, { method:'POST', headers: { Authorization: `Bearer ${token}` } }); load() }catch{} }
  useEffect(()=>{ if (token) load() }, [token])
  useEffect(()=>{ if (!token) return; const id=setInterval(load, 15000); function onF(){ load() } window.addEventListener('focus', onF); return ()=>{ clearInterval(id); window.removeEventListener('focus', onF) } }, [token])
  if (!me) return null
  return (
    <div className="relative">
      <button className="btn btn-ghost relative" onClick={()=>{ setOpen(v=>!v); if (!open) load() }}>
        🔔
        {unread>0 && <span className="absolute -top-1 -right-1 text-xs bg-red-600 text-white rounded-full px-1">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto bg-white border rounded shadow-lg z-50 p-2">
          <div className="flex items-center justify-between mb-1">
            <div className="font-medium">Notifications</div>
            <button className="btn btn-ghost btn-xs" onClick={markAll}>Mark all read</button>
          </div>
          <div className="space-y-2">
            {items.map(n => (
              <div key={n._id} className={`border rounded p-2 text-sm ${n.read? 'opacity-70' : ''}`}>
                <div>{n.message}</div>
                <div className="text-xs subtle">{new Date(n.createdAt).toLocaleString()}</div>
                {!n.read && <div className="flex justify-end"><button className="btn btn-ghost btn-xs" onClick={()=>markOne(n._id)}>Mark read</button></div>}
              </div>
            ))}
            {items.length===0 && <div className="subtle">No notifications</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// Client: favorites list button & modal (defined before usage)
function ClientFavoritesPanel({ me, token }){
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function load(){
    setLoading(true); setMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/user/favorites`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){ const d = await r.json(); setItems(d.providers||[]) } else { setMsg('Failed to load') }
    }catch{ setMsg('Failed to load') }
    setLoading(false)
  }

  async function remove(username){
    setMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/user/favorites/${encodeURIComponent(username)}`, { method:'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){ const d = await r.json(); setItems(d.providers||[]) } else { setMsg('Failed to remove') }
    }catch{ setMsg('Failed to remove') }
  }

  function openPanel(){ setOpen(true); setItems([]); setMsg(''); load() }

  return (
    <>
      <button className="btn btn-ghost" onClick={openPanel}>Favourite service provider</button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
          <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">My favourite providers</div>
              <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
            </div>
            {msg && <div className="text-sm text-gray-700 mb-2">{msg}</div>}
            {loading ? (
              <div className="subtle">Loading...</div>
            ) : (
              <div className="space-y-2">
                {items.map(u => (
                  <div key={u} className="border rounded p-3 flex items-center justify-between">
                    <div className="text-sm font-medium">{u}</div>
                    <div className="flex items-center gap-2">
                      <button className="btn btn-ghost" onClick={()=>remove(u)}>Unfavorite</button>
                    </div>
                  </div>
                ))}
                {items.length===0 && <div className="subtle">No favourite providers yet.</div>}
              </div>
            )}

          </div>
        </div>
      )}
    </>
  )
}

// Search button/modal used by client/provider (defined early to avoid reference issues)
function UserSearchBtn({ me, token }){
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [arch, setArch] = useState(true)
  const [engg, setEngg] = useState(true)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  // Favorites (client)
  const [favorites, setFavorites] = useState([])
  // Ratings UI state
  const [rateOpen, setRateOpen] = useState(false)
  const [rateUser, setRateUser] = useState(null) // username string
  const [rateStars, setRateStars] = useState(5)
  const [rateComment, setRateComment] = useState('')
  const [rateMsg, setRateMsg] = useState('')
  const [rateLoading, setRateLoading] = useState(false)
  // Comments UI state
  const [cOpen, setCOpen] = useState(false)
  const [cUser, setCUser] = useState(null)
  const [cItems, setCItems] = useState([])
  const [cMsg, setCMsg] = useState('')
  const [cLoading, setCLoading] = useState(false)

  const canSearch = !!(me && (me.role === 'client' || me.role === 'provider'))
  if (!canSearch) return null

  async function search(){
    setLoading(true); setMsg('')
    try{
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const domains = []
      if (arch) domains.push('architecture')
      if (engg) domains.push('engineering')
      if (domains.length>0 && domains.length<2) params.set('domains', domains.join(','))
      const url = `${API_BASE}/api/user/search?${params.toString()}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok){ const d = await res.json(); setResults(d) } else { setMsg('Search failed') }
    }catch{ setMsg('Search failed') }
    setLoading(false)
  }

  async function loadFavorites(){
    if (!me || me.role!=='client') return
    try{
      const r = await fetch(`${API_BASE}/api/user/favorites`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){ const d = await r.json(); setFavorites(d.providers||[]) }
    }catch{}
  }

  async function addFavorite(username){
    try{
      const r = await fetch(`${API_BASE}/api/user/favorites/${encodeURIComponent(username)}`, { method:'POST', headers: { Authorization: `Bearer ${token}` }})
      if (r.ok){ const d = await r.json(); setFavorites(d.providers||[]) }
    }catch{}
  }
  async function removeFavorite(username){
    try{
      const r = await fetch(`${API_BASE}/api/user/favorites/${encodeURIComponent(username)}`, { method:'DELETE', headers: { Authorization: `Bearer ${token}` }})
      if (r.ok){ const d = await r.json(); setFavorites(d.providers||[]) }
    }catch{}
  }

  async function openComments(username){
    setCUser(username); setCItems([]); setCMsg(''); setCOpen(true)
    setCLoading(true)
    try{
      const r = await fetch(`${API_BASE}/api/user/${encodeURIComponent(username)}/ratings?limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (r.ok){
        const d = await r.json()
        setCItems(Array.isArray(d.items)? d.items : [])
      }else{
        const err = await r.json().catch(()=>({}))
        setCMsg(err && err.message ? err.message : 'Failed to load comments')
      }
    }catch{ setCMsg('Failed to load comments') }
    setCLoading(false)
  }

  function canRate(u){
    if (!me) return false
    if (me.role==='client' && u.role==='provider') return true
    if (me.role==='provider' && u.role==='client') return true
    return false
  }

  function canSeeComments(u){
    // Same visibility rule as rating: counterpart role only
    if (!me) return false
    if (me.role==='client' && u.role==='provider') return true
    if (me.role==='provider' && u.role==='client') return true
    if (me.role==='admin') return true
    return false
  }

  function renderStars(avg){
    const a = Math.round((avg||0)*2)/2
    const stars = []
    for (let i=1;i<=5;i++){
      const filled = i<=Math.floor(a)
      const half = !filled && (i-0.5)<=a
      stars.push(
        <span key={i} title={`${a.toFixed(1)} / 5`}>{filled? '★' : (half? '☆' : '☆')}</span>
      )
    }
    return <span className="text-yellow-500">{stars}</span>
  }

  async function submitRating(){
    if (!rateUser) return
    setRateLoading(true); setRateMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/user/${encodeURIComponent(rateUser)}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stars: rateStars, comment: rateComment })
      })
      const d = await r.json()
      if (r.ok){
        setRateMsg('Thanks for your rating!')
        // Optimistically update local results for the rated user
        if (rateUser && typeof d.ratingAvg !== 'undefined' && typeof d.ratingCount !== 'undefined'){
          setResults(prev => prev.map(u => u.username===rateUser ? { ...u, ratingAvg: d.ratingAvg, ratingCount: d.ratingCount } : u))
        }
        // Close modal after brief tick
        setTimeout(()=>{ setRateOpen(false) }, 300)
      }else{
        setRateMsg(d.message || 'Failed to rate')
      }
    }catch(e){ setRateMsg('Failed to rate') }
    setRateLoading(false)
  }

  // Admin: payments from clients pending approval (top-level)
  function AdminPaymentsPanelButton(){
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    async function load(){
      setLoading(true); setMsg('')
      try{
        const r = await fetch(`${API_BASE}/api/projects/admin/payments`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ setItems(await r.json()) } else { setMsg('Failed to load') }
      }catch{ setMsg('Failed to load') }
      setLoading(false)
    }
    async function accept(id){
      setMsg('')
      try{
        const r = await fetch(`${API_BASE}/api/projects/admin/payments/${id}/accept`, { method:'POST', headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ setMsg('Payment accepted'); await load() } else { setMsg('Failed to accept') }
      }catch{ setMsg('Failed to accept') }
    }
    if (!me || me.role!=='admin') return null
    return (
      <>
        <button className="btn btn-ghost" onClick={()=>{ setOpen(true); setItems([]); setMsg(''); load() }}>Payments</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-3xl h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Pending payments from clients</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              {msg && <div className="text-sm text-gray-700">{msg}</div>}
              {loading ? (<div className="subtle">Loading...</div>) : (
                <div className="space-y-3">
                  {items.map(r => (
                    <div key={r._id} className="border rounded p-3 space-y-2">
                      <div className="text-sm text-gray-700">Project: {r.projectId} • Client: {r.clientUsername}</div>
                      {r.imageUrl && <img src={`${API_BASE}${r.imageUrl}`} alt="payment" className="max-h-48 rounded border" />}
                      <div className="flex justify-end">
                        <button className="btn btn-primary" onClick={()=>accept(r._id)}>Accept</button>
                      </div>
                    </div>
                  ))}
                  {items.length===0 && <div className="subtle">No pending payments.</div>}
                </div>
              )}
              
            </div>
          </div>
        )}
      </>
    )
  }


  

  

  function openPanel(){ setOpen(true); setResults([]); setMsg(''); setLoading(false); loadFavorites() }

  return (
    <>
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost" onClick={openPanel}>Search</button>
        {/* Client favorites panel */}
        {me?.role==='client' && (
          <ClientFavoritesPanel me={me} token={token} />
        )}
        {/* Provider utilities */}
        {me?.role==='provider' && (
          <ProviderUtilities me={me} token={token} />
        )}
        <NotificationsBell me={me} token={token} />
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
          <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Search users</div>
              <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
            </div>
            <div className="space-y-3">
              <input className="input w-full" placeholder="Search by username or name" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter') search() }} />
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={arch} onChange={e=>setArch(e.target.checked)} /> Architecture
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={engg} onChange={e=>setEngg(e.target.checked)} /> Engg
                </label>
                <div className="ml-auto">
                  <button className="btn btn-primary" onClick={search} disabled={loading}>{loading? 'Searching...' : 'Search'}</button>
                </div>
              </div>
              {msg && <div className="text-sm text-red-600">{msg}</div>}
              <div className="space-y-2">
                {results.map(u => (
                  <div key={u.username} className="border rounded p-3 flex items-center gap-3">
                    {u.avatarUrl ? (
                      <img src={`${API_BASE}${u.avatarUrl}`} alt="avatar" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200" />
                    ) : (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-semibold">
                        {u.username?.[0]?.toUpperCase() || 'U'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1">
                        {u.username}
                        {u.verified && <span title="Verified" className="text-green-600">✔︎</span>}
                      </div>
                      {u.displayName && <div className="subtle truncate">{u.displayName}</div>}
                      <div className="text-xs text-gray-600">
                        Type: {u.verifiedCategory==='provider_company' ? 'Company' : (u.verifiedSubtype==='architect' ? 'Architect' : (u.verifiedSubtype==='engineer' ? 'Engineer' : ''))}
                        {Array.isArray(u.domains) && u.domains.length>0 && (
                          <> 
                            • Domains: {(u.domains || []).map(d => d==='architecture' ? 'Architecture' : 'Engg').join(', ')}
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-700 flex items-center gap-2 mt-1">
                        {renderStars(u.ratingAvg)}
                        <span>({u.ratingCount || 0})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs uppercase tracking-wide text-gray-500">{u.role==='provider' ? 'Provider' : 'Client'}</div>
                      {canRate(u) && (
                        <button className="btn btn-ghost" onClick={()=>{ setRateUser(u.username); setRateStars(5); setRateComment(''); setRateMsg(''); setRateOpen(true) }}>Rate</button>
                      )}
                      {canSeeComments(u) && (
                        <button className="btn btn-ghost" onClick={()=>openComments(u.username)}>Comments</button>
                      )}
                      {me?.role==='client' && u.role==='provider' && (
                        favorites.includes(u.username) ? (
                          <button className="btn btn-ghost" onClick={()=>removeFavorite(u.username)}>Unfavorite</button>
                        ) : (
                          <button className="btn btn-ghost" onClick={()=>addFavorite(u.username)}>Favorite</button>
                        )
                      )}
                    </div>
                  </div>
                ))}
                {results.length===0 && !loading && <div className="subtle">No results</div>}
              </div>
              {rateOpen && (
                <div className="fixed inset-0 z-50 flex">
                  <div className="flex-1 bg-black/30" onClick={()=>setRateOpen(false)} />
                  <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <div className="section-title">Rate {rateUser}</div>
                      <button className="btn btn-ghost" onClick={()=>setRateOpen(false)}>Close</button>
                    </div>
                    {rateMsg && <div className="text-sm text-gray-700 mb-2">{rateMsg}</div>}
                    <div className="space-y-3">
                      <label className="block text-sm">Stars (1-5)</label>
                      <input type="number" min="1" max="5" className="input w-full" value={rateStars} onChange={e=>setRateStars(Math.max(1, Math.min(5, Number(e.target.value)||1)))} />
                      <label className="block text-sm">Comment (optional)</label>
                      <textarea className="input w-full" rows={3} value={rateComment} onChange={e=>setRateComment(e.target.value)} />
                      <div className="flex justify-end">
                        <button className="btn btn-primary" disabled={rateLoading} onClick={submitRating}>{rateLoading? 'Submitting...' : 'Submit rating'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {cOpen && (
                <div className="fixed inset-0 z-50 flex">
                  <div className="flex-1 bg-black/30" onClick={()=>setCOpen(false)} />
                  <div className="w-full max-w-xl h-full bg-white card p-6 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <div className="section-title">Comments for {cUser}</div>
                      <button className="btn btn-ghost" onClick={()=>setCOpen(false)}>Close</button>
                    </div>
                    {cMsg && <div className="text-sm text-gray-700 mb-2">{cMsg}</div>}
                    {cLoading ? (
                      <div className="subtle">Loading...</div>
                    ) : (
                      <div className="space-y-3">
                        {cItems.map((it, idx) => (
                          <div key={idx} className="border rounded p-3 space-y-1">
                            <div className="text-sm text-gray-600 flex items-center gap-2">
                              <span className="font-medium">{it.fromUsername}</span>
                              <span className="uppercase text-xs">{it.fromRole}</span>
                              <span className="text-yellow-500">{'★'.repeat(Math.max(0, Math.min(5, Number(it.stars)||0)))}</span>
                              <span className="subtle">{new Date(it.createdAt).toLocaleString()}</span>
                            </div>
                            {it.comment && <div className="text-sm">{it.comment}</div>}
                          </div>
                        ))}
                        {cItems.length===0 && <div className="subtle">No comments yet.</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Provider utilities: favorites feed, collab requests, collab TODO, invite providers
function ProviderUtilities({ me, token }){
  const [feedOpen, setFeedOpen] = useState(false)
  const [feedItems, setFeedItems] = useState([])
  const [feedMsg, setFeedMsg] = useState('')
  const [feedLoading, setFeedLoading] = useState(false)

  const [reqOpen, setReqOpen] = useState(false)
  const [reqItems, setReqItems] = useState([])
  const [reqMsg, setReqMsg] = useState('')
  const [reqLoading, setReqLoading] = useState(false)

  const [todoOpen, setTodoOpen] = useState(false)
  const [todoItems, setTodoItems] = useState([])
  const [todoMsg, setTodoMsg] = useState('')
  const [todoLoading, setTodoLoading] = useState(false)

  // Invite providers (per project)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteProject, setInviteProject] = useState(null)
  const [inviteMsg, setInviteMsg] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteSearchQ, setInviteSearchQ] = useState('')
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false)
  const [inviteResults, setInviteResults] = useState([])
  const [inviteSelected, setInviteSelected] = useState(() => new Set())
  const [inviteToast, setInviteToast] = useState('')

  // Local BidBox used in the favorites feed list
  function BidBox({ projectId, onSent }){
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    async function send(){
      if (!text.trim()) return
      setLoading(true); setMsg('')
      try{
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/bids`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text })
        })
        if (res.ok){ setText(''); setOpen(false); setMsg(''); onSent?.() }
        else { setMsg('Failed to send bid') }
      }catch{ setMsg('Failed to send bid') }
      setLoading(false)
    }
    if (!me || me.role !== 'provider') return null
    return (
      <div className="mt-1">
        {!open ? (
          <button className="btn btn-ghost btn-xs" onClick={()=>setOpen(true)}>Bid</button>
        ) : (
          <div className="space-y-2">
            <textarea className="input min-h-[60px]" placeholder="Write your bid..." value={text} onChange={e=>setText(e.target.value)} />
            {msg && <div className="text-xs text-red-600">{msg}</div>}
            <div className="flex gap-2">
              <button className="btn btn-primary btn-xs" disabled={loading || !text.trim()} onClick={send}>{loading? 'Sending...' : 'Send'}</button>
              <button className="btn btn-ghost btn-xs" onClick={()=>{ setOpen(false); setText(''); setMsg('') }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  async function cancelInvite(projectId, username){
    try{
      const r = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/collab/invites/${encodeURIComponent(username)}/cancel`, {
        method:'POST', headers: { Authorization: `Bearer ${token}` }
      })
      if (r.ok){
        // Optimistic update for dialog project and list
        setInviteProject(prev => prev && prev._id===projectId ? {
          ...prev,
          collabInvites: (prev.collabInvites||[]).map(i=> i.toUsername===username && i.status==='pending' ? { ...i, status: 'rejected' } : i),
          collabMembers: (prev.collabMembers||[]).filter(m => !(m.username===username && m.status==='invited'))
        } : prev)
        await loadTodo()
      }
    }catch{}
  }

  async function loadFeed(){
    setFeedLoading(true); setFeedMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/projects/provider/favorites/feed`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){ setFeedItems(await r.json()) } else { setFeedMsg('Failed to load feed') }
    }catch{ setFeedMsg('Failed to load feed') }
    setFeedLoading(false)
  }
  async function openFeed(){ setFeedOpen(true); setFeedItems([]); setFeedMsg(''); loadFeed() }

  async function loadRequests(){
    setReqLoading(true); setReqMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/projects/collab/requests`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){ setReqItems(await r.json()) } else { setReqMsg('Failed to load requests') }
    }catch{ setReqMsg('Failed to load requests') }
    setReqLoading(false)
  }
  async function openRequests(){ setReqOpen(true); setReqItems([]); setReqMsg(''); loadRequests() }
  async function acceptRequest(id){
    setReqMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}/collab/accept`, { method:'POST', headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){ setReqMsg('Accepted'); await loadRequests() } else { const d = await r.json().catch(()=>({})); setReqMsg(d.message||'Failed to accept') }
    }catch{ setReqMsg('Failed to accept') }
  }

  async function loadTodo(){
    setTodoLoading(true); setTodoMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/projects/collab/todo`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){ setTodoItems(await r.json()) } else { setTodoMsg('Failed to load TODO') }
    }catch{ setTodoMsg('Failed to load TODO') }
    setTodoLoading(false)
  }
  async function openTodo(){ setTodoOpen(true); setTodoItems([]); setTodoMsg(''); loadTodo() }

  function openInvite(project){
    setInviteProject(project)
    setInviteMsg('')
    setInviteOpen(true)
    setInviteSearchQ('')
    setInviteResults([])
    setInviteSelected(new Set())
  }
  function closeInvite(){
    setInviteOpen(false)
    setInviteProject(null)
  }
  async function searchProviders(){
    setInviteSearchLoading(true)
    setInviteMsg('')
    try{
      const params = new URLSearchParams()
      if (inviteSearchQ.trim()) params.set('q', inviteSearchQ.trim())
      const r = await fetch(`${API_BASE}/api/user/search?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){
        const d = await r.json()
        const existingMembers = new Set((inviteProject?.collabMembers||[]).map(m=>m.username))
        const pendingInvites = new Set((inviteProject?.collabInvites||[]).filter(i=>i.status==='pending').map(i=>i.toUsername))
        setInviteResults(Array.isArray(d) ? d.filter(u => u.role==='provider' && u.username!==me.username && !existingMembers.has(u.username) && !pendingInvites.has(u.username)) : [])
      } else {
        setInviteMsg('Search failed')
      }
    }catch{ setInviteMsg('Search failed') }
    setInviteSearchLoading(false)
  }

  // Debounce search while typing in the per-project invite modal
  useEffect(() => {
    if (!inviteOpen) return
    const t = setTimeout(() => {
      searchProviders()
    }, 300)
    return () => clearTimeout(t)
  }, [inviteSearchQ, inviteOpen])
  function toggleInvite(username){
    setInviteSelected(prev => {
      const s = new Set(prev)
      if (s.has(username)) s.delete(username); else s.add(username)
      return s
    })
  }
  async function submitInvite(){
    if (!inviteProject){ setInviteMsg('No project selected'); return }
    const usernames = Array.from(inviteSelected)
    if (usernames.length===0){ setInviteMsg('Select at least one provider'); return }
    setInviteLoading(true); setInviteMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(inviteProject._id)}/collab/invite`, {
        method:'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ usernames })
      })
      const d = await r.json().catch(()=>({}))
      if (r.ok){
        // Optimistic update: add pending invites to local project state and show toast
        setInviteProject(prev => prev ? {
          ...prev,
          collabInvites: [
            ...(prev.collabInvites || []),
            ...usernames.map(u => ({ toUsername: u, status: 'pending' }))
          ]
        } : prev)
        setInviteMsg('Invites sent')
        setInviteToast('Invites sent')
        // Refresh TODO list and selected project after a short delay, then auto-close
        await loadTodo()
        setTimeout(async ()=>{
          // try to refresh the selected project from updated TODO list
          const refreshed = (await (async()=>todoItems)())
          const match = Array.isArray(refreshed) ? refreshed.find(p=>p._id===inviteProject._id) : null
          if (match) setInviteProject(match)
          setInviteToast('')
          closeInvite()
        }, 800)
      } else {
        setInviteMsg(d.message||'Failed to invite')
      }
    }catch{ setInviteMsg('Failed to invite') }
    setInviteLoading(false)
  }

  return (
    <>
      <button className="btn btn-ghost" onClick={openFeed}>Chosen by client feed</button>
      <button className="btn btn-ghost" onClick={openRequests}>TODO requests</button>
      <button className="btn btn-ghost" onClick={openTodo}>My collab TODO</button>

      {feedOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={()=>setFeedOpen(false)} />
          <div className="w-full max-w-3xl h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Projects from clients who favorited you</div>
              <button className="btn btn-ghost" onClick={()=>setFeedOpen(false)}>Close</button>
            </div>
            {feedMsg && <div className="text-sm text-gray-700">{feedMsg}</div>}
            {feedLoading ? (<div className="subtle">Loading...</div>) : (
              <div className="space-y-3">
                {feedItems.map(p => {
                  const membersCount = (p.collabMembers||[]).filter(m=>m.status==='accepted').length
                  const pendingCount = (p.collabInvites||[]).filter(i=>i.status==='pending').length
                  return (
                    <div key={p._id} className="border rounded p-3 space-y-2">
                      <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
                        <span>Client: <span className="font-medium">{p.authorUsername}</span></span>
                        <span>•</span>
                        <span className="capitalize">{p.category}</span>
                        {p.subcategory && <><span>•</span><span>{p.subcategory}</span></>}
                        {p.tier && <><span>•</span><span className="capitalize">{p.tier}</span></>}
                        {p.projectType && <><span>•</span><span>{p.projectType}</span></>}
                      </div>
                      {p.description && <div>{p.description}</div>}
                      {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="project" className="max-h-48 rounded" />}
                      <div className="text-xs subtle">Members: {membersCount} • Pending invites: {pendingCount}</div>
                      <div className="flex items-center gap-2">
                        <BidBox projectId={p._id} onSent={loadFeed} />
                        {p.location && (
                          <button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(p.location); setLocOpen(true) }}>View location</button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {feedItems.length===0 && <div className="subtle">No projects.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {reqOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={()=>setReqOpen(false)} />
          <div className="w-full max-w-3xl h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Collaboration requests</div>
              <button className="btn btn-ghost" onClick={()=>setReqOpen(false)}>Close</button>
            </div>
            {reqMsg && <div className="text-sm text-gray-700">{reqMsg}</div>}
            {reqLoading ? (<div className="subtle">Loading...</div>) : (
              <div className="space-y-3">
                {reqItems.map(p => {
                  const membersCount = (p.collabMembers||[]).filter(m=>m.status==='accepted').length
                  const pendingCount = (p.collabInvites||[]).filter(i=>i.status==='pending').length
                  return (
                    <div key={p._id} className="border rounded p-3 space-y-1">
                      <div className="text-sm font-medium">Project: {p._id}</div>
                      <div className="text-sm">Client: {p.authorUsername}</div>
                      <div className="text-xs subtle">Members: {membersCount} • Pending invites: {pendingCount}</div>
                      <div className="flex justify-end"><button className="btn btn-primary" onClick={()=>acceptRequest(p._id)}>Accept</button></div>
                    </div>
                  )
                })}
                {reqItems.length===0 && <div className="subtle">No pending requests.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {todoOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={()=>setTodoOpen(false)} />
          <div className="w-full max-w-3xl h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">My Collaboration TODO</div>
              <button className="btn btn-ghost" onClick={()=>setTodoOpen(false)}>Close</button>
            </div>
            {todoMsg && <div className="text-sm text-gray-700">{todoMsg}</div>}
            {todoLoading ? (<div className="subtle">Loading...</div>) : (
              <div className="space-y-3">
                {todoItems.map(p => {
                  const meMember = (p.collabMembers||[]).find(m=>m.username===me.username)
                  const canInvite = meMember && meMember.status==='accepted' && meMember.kanbanStatus==='TODO'
                  const membersCount = (p.collabMembers||[]).filter(m=>m.status==='accepted').length
                  const pendingCount = (p.collabInvites||[]).filter(i=>i.status==='pending').length
                  return (
                  <div key={p._id} className="border rounded p-3 space-y-2">
                    <div className="text-sm font-medium">Project: {p._id}</div>
                    <div className="text-sm">Client: {p.authorUsername}</div>
                    <div className="text-sm">Category: {p.category}</div>
                    <div className="text-xs subtle">Members: {membersCount} • Pending invites: {pendingCount}</div>
                    <div className="flex justify-end">
                      <button className="btn btn-primary" disabled={!canInvite} title={!canInvite? 'Invites available only in TODO status' : ''} onClick={()=>openInvite(p)}>Invite providers</button>
                    </div>
                  </div>
                  )
                })}
                {todoItems.length===0 && <div className="subtle">No items.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeInvite} />
          <div className="w-full max-w-xl h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Invite providers to project {inviteProject?._id}</div>
              <button className="btn btn-ghost" onClick={closeInvite}>Close</button>
            </div>
            {inviteMsg && <div className="text-sm text-gray-700 mb-2">{inviteMsg}</div>}
            {inviteToast && <div className="text-sm text-green-700 mb-2">{inviteToast}</div>}
            <div className="space-y-3">
              {/* Existing members and pending invites */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="font-medium text-sm mb-1">Members</div>
                  <div className="space-y-1">
                    {(inviteProject?.collabMembers||[]).filter(m=>m.status==='accepted').map(m => (
                      <div key={m.username} className="text-sm subtle">{m.username} • {m.status}</div>
                    ))}
                    {((inviteProject?.collabMembers||[]).filter(m=>m.status==='accepted').length===0) && <div className="subtle text-sm">No members yet</div>}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-sm mb-1">Pending invites</div>
                  <div className="space-y-1">
                    {(inviteProject?.collabInvites||[]).filter(i=>i.status==='pending').map(i => (
                      <div key={`${i.toUsername}-${i.status}`} className="text-sm flex items-center justify-between">
                        <span className="subtle">{i.toUsername} • pending</span>
                        <button className="btn btn-ghost" onClick={()=>cancelInvite(inviteProject._id, i.toUsername)}>Cancel</button>
                      </div>
                    ))}
                    {((inviteProject?.collabInvites||[]).filter(i=>i.status==='pending').length===0) && <div className="subtle text-sm">No pending invites</div>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input className="input flex-1" placeholder="Search providers by username or name" value={inviteSearchQ} onChange={e=>setInviteSearchQ(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter') searchProviders() }} />
                <button className="btn btn-primary" onClick={searchProviders} disabled={inviteSearchLoading}>{inviteSearchLoading? 'Searching...' : 'Search'}</button>
              </div>
              <div className="space-y-2">
                {inviteResults.map(u => (
                  <div key={u.username} className="border rounded p-2 flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">{u.username}</span> {u.displayName && <span className="subtle">• {u.displayName}</span>}
                      {typeof u.ratingAvg !== 'undefined' && (
                        <span className="subtle ml-2">★ {Number(u.ratingAvg||0).toFixed(1)} ({u.ratingCount||0})</span>
                      )}
                    </div>
                    <button className="btn btn-ghost" onClick={()=>toggleInvite(u.username)}>{inviteSelected.has(u.username)? 'Remove' : 'Add'}</button>
                  </div>
                ))}
                {inviteResults.length===0 && !inviteSearchLoading && <div className="subtle">No results</div>}
              </div>
              {inviteSelected.size>0 && (
                <div className="text-sm">Selected: {Array.from(inviteSelected).join(', ')}</div>
              )}
              <div className="flex justify-end">
                <button className="btn btn-primary" disabled={inviteLoading || inviteSelected.size===0} onClick={submitInvite}>{inviteLoading? 'Inviting...' : 'Send invites'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Backward-compatible alias used in header
function UserSearchButton(props){
  return <UserSearchBtn {...props} />
}

// Simple error boundary to prevent white screen on runtime errors
class ErrorBoundary extends React.Component {
  constructor(props){
    super(props)
    this.state = { error: null }
    }

  static getDerivedStateFromError(error){
    return { error }
  }
  componentDidCatch(error, info){
    // Log for debugging
    // eslint-disable-next-line no-console
    console.error('UI error:', error, info)
  }
  render(){
    if (this.state.error){
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="card p-6 space-y-3">
            <div className="section-title">Something went wrong</div>
            <div className="text-sm text-gray-700">Please refresh the page. If it persists, share the error below.</div>
            <pre className="text-xs whitespace-pre-wrap bg-gray-50 p-3 rounded border overflow-auto" style={{maxHeight:'200px'}}>{String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}</pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RoleSelector({ selected, onSelect }) {
  const roles = [
    { key: 'Admin', desc: 'Fixed credentials' },
    { key: 'Client', desc: 'Sign up & log in' },
    { key: 'Service provider', desc: 'Sign up & log in' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {roles.map(r => (
        <button
          key={r.key}
          onClick={() => onSelect(r.key)}
          className={`card p-4 text-left transition ring-1 ${selected===r.key? 'ring-primary-600 shadow-md' : 'ring-gray-200 hover:ring-primary-300 hover:shadow-sm'}`}
        >
          <div className="font-semibold">{r.key}</div>
          <div className="subtle mt-1">{r.desc}</div>
        </button>
      ))}
    </div>
  )
}

function AdminLogin({ onAuth }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('12345')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e){
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const res = await fetch(`${API_BASE}/api/auth/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()
    setMsg(res.ok ? `Logged in as ${data.username}` : (data.message || 'Error'))
    if (res.ok) onAuth(data)
    setLoading(false)
  }

  // removed inner UserSearchButton; a top-level component is used instead

  

  return (
    <form onSubmit={submit} className="card p-6 space-y-4">
      <div className="section-title">Admin Login</div>
      <div className="grid gap-3">
        <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" />
        <input className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
        {msg && <span className="subtle">{msg}</span>}
      </div>
    </form>
  )
}

function UserAuth({ roleKey, onAuth }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e){
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const path = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login'
    // Map display role labels to API values expected by server ('client' | 'provider')
    const apiRole = roleKey === 'Client' ? 'client' : (roleKey === 'Service provider' ? 'provider' : roleKey)
    const body = mode === 'signup' ? { username, password, role: apiRole } : { username, password }
    console.log('[Auth] submitting', { path, body })
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    console.log('[Auth] response', res.status, data)
    setMsg(res.ok ? `Success (${data.role}): ${data.username}` : (data.message || 'Error'))
    if (res.ok) onAuth(data)
    setLoading(false)
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <button className={`btn ${mode==='login' ? 'btn-primary' : 'btn-ghost'}`} onClick={()=>setMode('login')} disabled={mode==='login'}>Log in</button>
        <button className={`btn ${mode==='signup' ? 'btn-primary' : 'btn-ghost'}`} onClick={()=>setMode('signup')} disabled={mode==='signup'}>Sign up</button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="section-title">{roleKey === 'client' ? 'Client' : 'Service Provider'} {mode === 'login' ? 'Login' : 'Sign up'}</div>
        <div className="grid gap-3">
          <input className="input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" />
          <input className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Submitting...' : 'Submit'}</button>
          {msg && <span className="subtle">{msg}</span>}
        </div>
      </form>
    </div>
  )
}

export default function App(){
  const [selected, setSelected] = useState('Admin')
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')
  const [me, setMe] = useState(null)
  const [sessionUser, setSessionUser] = useState(null)
  const isAuthed = !!token
  const [activeTab, setActiveTab] = useState('feed') // 'feed' | 'projects'
  const [runtimeError, setRuntimeError] = useState('')
  const fetchedProfileRef = React.useRef(false)
  // key to trigger projects feed reloads from outside the panel
  const [projectsReloadKey, setProjectsReloadKey] = useState(0)
  const triggerProjectsReload = () => setProjectsReloadKey((k) => k + 1)
  const [calendarConnected, setCalendarConnected] = useState(false)

  // Board-level (Provider Board) invite modal state
  const [boardInviteOpen, setBoardInviteOpen] = useState(false)
  const [boardInviteProjectId, setBoardInviteProjectId] = useState('')
  const [boardInviteMsg, setBoardInviteMsg] = useState('')
  const [boardInviteLoading, setBoardInviteLoading] = useState(false)
  const [boardInviteSearchQ, setBoardInviteSearchQ] = useState('')
  const [boardInviteSearchLoading, setBoardInviteSearchLoading] = useState(false)
  const [boardInviteResults, setBoardInviteResults] = useState([])
  const [boardInviteSelected, setBoardInviteSelected] = useState(() => new Set())

  function boardOpenInvite(projectId){
    setBoardInviteProjectId(projectId)
    setBoardInviteMsg('')
    setBoardInviteOpen(true)
    setBoardInviteSearchQ('')
    setBoardInviteResults([])
    setBoardInviteSelected(new Set())
  }
  function boardCloseInvite(){
    setBoardInviteOpen(false)
    setBoardInviteProjectId('')
  }
  async function boardSearchProviders(){
    setBoardInviteSearchLoading(true)
    setBoardInviteMsg('')
    try{
      const params = new URLSearchParams()
      if (boardInviteSearchQ.trim()) params.set('q', boardInviteSearchQ.trim())
      const r = await fetch(`${API_BASE}/api/user/search?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok){
        const d = await r.json()
        setBoardInviteResults(Array.isArray(d) ? d.filter(u => u.role==='provider' && u.username!==me?.username) : [])
      } else { setBoardInviteMsg('Search failed') }
    }catch{ setBoardInviteMsg('Search failed') }
    setBoardInviteSearchLoading(false)
  }
  function boardToggleInvite(username){
    setBoardInviteSelected(prev => { const s=new Set(prev); if (s.has(username)) s.delete(username); else s.add(username); return s })
  }
  async function boardSubmitInvite(){
    if (!boardInviteProjectId){ setBoardInviteMsg('No project selected'); return }
    const usernames = Array.from(boardInviteSelected)
    if (usernames.length===0){ setBoardInviteMsg('Select at least one provider'); return }
    setBoardInviteLoading(true); setBoardInviteMsg('')
    try{
      const r = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(boardInviteProjectId)}/collab/invite`, {
        method:'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ usernames })
      })
      const d = await r.json().catch(()=>({}))
      if (r.ok){ setBoardInviteMsg('Invites sent'); setTimeout(()=>boardCloseInvite(), 700) } else { setBoardInviteMsg(d.message||'Failed to invite') }
    }catch{ setBoardInviteMsg('Failed to invite') }
    setBoardInviteLoading(false)
  }

  useEffect(() => {
    function onErr(message, source, lineno, colno, error){
      const msg = String(message || (error && (error.stack || error.message)) || 'Error')
      setRuntimeError(msg)
      // keep running
      return false
    }
    function onRejection(ev){
      const msg = String((ev && (ev.reason && (ev.reason.stack || ev.reason.message))) || 'Promise rejection')
      setRuntimeError(msg)
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => {
    if (token && !me && !fetchedProfileRef.current) {
      fetchedProfileRef.current = true
      // reduce console noise; keep one concise log in dev
      console.log('[Auth] token present, fetching profile')
      fetchMe(token)
    }
  }, [token, me])

  useEffect(() => {
    (async () => {
      try{
        if (!token || !me || !(me.role==='client' || me.role==='provider')){ setCalendarConnected(false); return }
        const r = await fetch(`${API_BASE}/api/calendar/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ const d = await r.json(); setCalendarConnected(!!d.hasTokens) } else { setCalendarConnected(false) }
      }catch{ setCalendarConnected(false) }
    })()
  }, [token, me])

  async function fetchMe(tok){
    try{
      const res = await fetch(`${API_BASE}/api/user/me?ts=${Date.now()}`, {
        headers: { Authorization: `Bearer ${tok}`, 'Cache-Control': 'no-cache' },
        cache: 'no-store',
      })
      if (res.status === 304) {
        console.log('[Auth] /me 304 - keeping existing session')
        return
      }
      if(res.ok){
        const data = await res.json()
        setMe(data)
      } else {
        localStorage.removeItem('token')
        setToken('')
        setMe(null)
      }
    }catch{}
  }

  function handleAuth(data){
    // only persist for client/provider as requested; admin won't show profile controls
    if (data.role === 'client' || data.role === 'provider'){
      localStorage.setItem('token', data.token)
      setToken(data.token)
      console.log('[Auth] logged-in as', data.role, 'fetching profile')
      // Optimistically set minimal profile to avoid blank state
      setMe({ role: data.role, username: data.username })
      setSessionUser({ role: data.role, username: data.username })
      fetchMe(data.token)
    } else if (data.role === 'admin') {
      // set admin session token without persisting
      setToken(data.token)
      setMe({ role: 'admin', username: data.username })
      setSessionUser({ role: 'admin', username: data.username })
    }
  }

  function logout(){
    localStorage.removeItem('token')
    setToken('')
    setMe(null)
  }

  async function updateProfile({ displayName, password }){
    const res = await fetch(`${API_BASE}/api/user/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName, password })
    })
    if (res.ok){
      const data = await res.json()
      setMe(data)
      return { ok: true }
    }
    return { ok: false, message: 'Update failed' }
  }

  async function uploadAvatar(file){
    const fd = new FormData()
    fd.append('avatar', file)
    const res = await fetch(`${API_BASE}/api/user/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    })
    if (res.ok){
      const data = await res.json()
      setMe(data)
      return { ok: true }
    }
    return { ok: false }
  }

  // Provider posts: list and create
  const [myPosts, setMyPosts] = useState([])
  async function fetchMyPosts(){
    const res = await fetch(`${API_BASE}/api/posts/provider/mine`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok){
      const data = await res.json()
      setMyPosts(data)
    }
  }

  async function createPost({ content, file }){
    const fd = new FormData()
    if (content) fd.append('content', content)
    if (file) fd.append('image', file)
    const res = await fetch(`${API_BASE}/api/posts/provider`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    })
    if (res.ok){
      await fetchMyPosts()
      return { ok: true }
    }
    return { ok: false }
  }

  // Admin moderation: list pending and approve
  const [pendingPosts, setPendingPosts] = useState([])
  async function fetchPending(){
    const res = await fetch(`${API_BASE}/api/posts/admin/pending`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok){
      const data = await res.json()
      setPendingPosts(data)
    }
  }

  async function approvePost(id){
    const res = await fetch(`${API_BASE}/api/posts/admin/approve/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok){
      await fetchPending()
      await fetchFeed()
    }
  }

  // Feed of approved posts (personalized for client)
  const [feed, setFeed] = useState([])
  async function fetchFeed(){
    try{
      const isClient = !!(me && me.role === 'client')
      const url = isClient ? `${API_BASE}/api/posts/feed/personalized` : `${API_BASE}/api/posts/feed`
      const opts = isClient ? { headers: { Authorization: `Bearer ${token}` } } : {}
      const res = await fetch(url, opts)
      if (res.ok){
        const data = await res.json()
        setFeed(data)
        const names = Array.from(new Set(data.map(x=>x.authorUsername)))
        if (names.length) await fetchVerifiedMap(names)
      }
    }catch{}
  }

  useEffect(() => { fetchFeed() }, [])
  // refresh public posts feed when tab changes; projects are handled inside ProjectsFeedPanel
  useEffect(() => {
    if (activeTab === 'feed') fetchFeed()
  }, [activeTab])
  useEffect(() => {
    if (me?.role === 'provider' && token) fetchMyPosts()
    if (me?.role === 'admin' && token) fetchPending()
  }, [me, token])

  // Verified badges map { username: boolean }
  const [verifiedMap, setVerifiedMap] = useState({})
  async function fetchVerifiedMap(usernames){
    try{
      const q = encodeURIComponent(usernames.join(','))
      const res = await fetch(`${API_BASE}/api/verification/verified?usernames=${q}`)
      if (res.ok){
        const map = await res.json()
        setVerifiedMap(prev => ({ ...prev, ...map }))
      }
    }catch{}
  }

  function ProfilePanel(){
    const [open, setOpen] = useState(false)
    const [openedAt, setOpenedAt] = useState(0)
    const [displayName, setDisplayName] = useState(me?.displayName || '')
    const [password, setPassword] = useState('')
    const roleLabel = me?.role
    const avatarSrc = me?.avatarUrl ? `${API_BASE}${me.avatarUrl}` : undefined
    const [verifyOpen, setVerifyOpen] = useState(false)

    async function onSave(e){
      e.preventDefault()
      const res = await updateProfile({ displayName, password })
      if (res.ok) {
        setPassword('')
        setOpen(false)
      }
    }

    async function onFile(e){
      const f = e.target.files?.[0]
      if (f) await uploadAvatar(f)
    }

    

    // Allow closing with Escape key; disable backdrop click-to-close
    useEffect(() => {
      function onKey(e){ if (e.key === 'Escape') setOpen(false) }
      if (open) window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [open])

    return (
      <div>
        <button
          className="btn btn-ghost"
          onMouseDown={(e)=>{ e.preventDefault(); e.stopPropagation() }}
          onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setOpen(true); setOpenedAt(Date.now()) }}
        >
          {avatarSrc ? (
            <span className="inline-flex h-8 w-8 rounded-full overflow-hidden ring-1 ring-gray-200">
              <img src={avatarSrc} alt="avatar" className="h-full w-full object-cover" />
            </span>
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white font-semibold">
              {me?.username?.[0]?.toUpperCase() || 'U'}
            </span>
          )}
        </button>

        {open && ReactDOM.createPortal((
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          >
            <div
              className="card w-full max-w-md p-6 space-y-4 bg-white"
              onClick={(e)=>e.stopPropagation()}
              onMouseDown={(e)=>e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="section-title">My Profile</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              <div className="text-sm text-gray-600">Role: <span className="font-medium inline-flex items-center gap-1">{roleLabel}{me?.verified && <span title="Verified" className="text-green-600">✔︎</span>}</span></div>
              <div className="flex items-center gap-3">
                {avatarSrc ? (
                  <span className="inline-flex h-14 w-14 rounded-full overflow-hidden ring-1 ring-gray-200">
                    <img src={avatarSrc} alt="avatar" className="h-full w-full object-cover" />
                  </span>
                ) : (
                  <div className="h-14 w-14 rounded-full bg-primary-100 text-primary-700 grid place-items-center text-lg font-semibold">
                    {me?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <label className="btn btn-primary cursor-pointer">
                  Upload picture
                  <input type="file" accept="image/*" className="hidden" onChange={onFile} />
                </label>
              </div>

              <form onSubmit={onSave} className="space-y-3">
                <div>
                  <label className="subtle">Display name</label>
                  <input className="input mt-1" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name" />
                </div>
                <div>
                  <label className="subtle">New password</label>
                  <input className="input mt-1" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type="password" />
                </div>
                <div className="flex items-center justify-between">
                  <button type="submit" className="btn btn-primary">Save</button>
                  <button type="button" className="btn btn-ghost" onClick={logout}>Log out</button>
                </div>
              </form>

              {(me?.role==='client' || me?.role==='provider') && (
                <div className="pt-2">
                  <button className="btn btn-ghost" onClick={()=>setVerifyOpen(true)}>Request for verification</button>
                </div>
              )}
            </div>
          </div>
        ), document.body)}
        {verifyOpen && (
          <VerificationRequestDrawer onClose={()=>setVerifyOpen(false)} forceMode={me?.role === 'client' ? 'client' : 'provider'} />
        )}
      </div>
    )
  }

  function AcceptedBidsButton(){
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    const [chatProjectId, setChatProjectId] = useState(null)
    const [locOpen, setLocOpen] = useState(false)
    const [locView, setLocView] = useState(null)

    async function load(){
      setLoading(true); setMsg('')
      try{
        const res = await fetch(`${API_BASE}/api/projects/my/accepted-bids`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok){ const d = await res.json(); setItems(d) } else { setMsg('Failed to load') }
      }catch{ setMsg('Failed to load') }
      setLoading(false)
    }

    function openPanel(){ setOpen(true); setItems([]); setMsg(''); load() }

    if (!me || me.role !== 'provider') return null
    return (
      <>
        <button className="btn btn-ghost" onClick={openPanel}>Accepted BID</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-2xl h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">My accepted bids</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              {msg && <div className="text-sm text-gray-600">{msg}</div>}
              {loading ? (
                <div className="subtle">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {items.map(it => (
                    <div key={`${it.projectId}-${it.bid?._id||'bid'}`} className="border rounded p-3 space-y-2">
                      <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
                        <span>Client: <span className="font-medium">{it.authorUsername}</span></span>
                        <span>•</span>
                        <span className="capitalize">{it.category}</span>
                        {it.subcategory && <><span>•</span><span>{it.subcategory}</span></>}
                        {it.tier && <><span>•</span><span className="capitalize">{it.tier}</span></>}
                        {it.projectType && <><span>•</span><span>{it.projectType}</span></>}
                      </div>
                      {it.description && <div>{it.description}</div>}
                      {it.imageUrl && <img src={`${API_BASE}${it.imageUrl}`} alt="project" className="max-h-48 rounded" />}
                      {it.location && (
                        <div>
                          <button className="btn btn-ghost" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button>
                        </div>
                      )}
                      {it.bid && (
                        <div className="text-sm flex items-center justify-between gap-2">
                          <div>
                            <span className="font-medium">Your bid:</span> {it.bid.text}
                          </div>
                          <button className="btn btn-ghost" title="Open chat" onClick={()=>setChatProjectId(it.projectId)}>💬 Message</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {items.length===0 && <div className="subtle">No accepted bids yet.</div>}
                </div>
              )}
              {chatProjectId && <ChatDrawer projectId={chatProjectId} onClose={()=>setChatProjectId(null)} />}
        {locOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
            <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Project location</div>
                <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
              </div>
              <div className="space-y-3">
                <MapPicker readOnly value={locView} height={360} />
                {locView && <div className="text-xs text-gray-700">Lat {Number(locView.lat).toFixed(6)}, Lng {Number(locView.lng).toFixed(6)}</div>}
              </div>
            </div>
          </div>
        )}
              {locOpen && (
                <div className="fixed inset-0 z-50 flex">
                  <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
                  <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <div className="section-title">Project location</div>
                      <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
                    </div>
                    <div className="space-y-3">
                      <MapPicker readOnly value={locView} height={360} />
                      {locView && <div className="text-xs text-gray-700">Lat {Number(locView.lat).toFixed(6)}, Lng {Number(locView.lng).toFixed(6)}</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )
  }
  
  // Chat drawer for accepted bid conversations
  function ChatDrawer({ projectId, onClose }){
    const [open, setOpen] = useState(true)
    const [items, setItems] = useState([])
    const [text, setText] = useState('')
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    const [timer, setTimer] = useState(null)
    const [suspended, setSuspended] = useState(false)
    const [suspendReason, setSuspendReason] = useState('')
    const [helpOpen, setHelpOpen] = useState(false)
    const [helpText, setHelpText] = useState('')
    const [kanbanStatus, setKanbanStatus] = useState(null)
    const [pendingPayment, setPendingPayment] = useState(false)
    const [pendingPaymentSubmitted, setPendingPaymentSubmitted] = useState(false)
    const [finalizing, setFinalizing] = useState(false)
    const [reportOpen, setReportOpen] = useState(false)
    const [reportReason, setReportReason] = useState('')
    const [reportFile, setReportFile] = useState(null)
    const [payFile, setPayFile] = useState(null)

    async function load(){
      setLoading(true); setMsg('')
      try{
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/chat`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok){ const d = await res.json(); setItems(d) } else { setMsg('Failed to load messages') }
        try{
          const st = await fetch(`${API_BASE}/api/projects/${projectId}/chat/status`, { headers: { Authorization: `Bearer ${token}` } })
          if (st.ok){ const s2 = await st.json(); setSuspended(!!s2.suspended); setSuspendReason(s2.reason || ''); setKanbanStatus(s2.kanbanStatus || null); setPendingPayment(!!s2.pendingPayment); setPendingPaymentSubmitted(!!s2.pendingPaymentSubmitted) }
        }catch{}
      }catch{ setMsg('Failed to load messages') }
      setLoading(false)
    }

    async function finalizeAcceptance(){
      setFinalizing(true); setMsg('')
      try{
        const r = await fetch(`${API_BASE}/api/projects/${projectId}/chat/accept-provider`, { method:'POST', headers:{ Authorization:`Bearer ${token}` } })
        if (r.ok){ await load(); setMsg('Provider accepted. Moved to TODO.') }
        else {
          let d = {}
          try{ d = await r.json() }catch{}
          setMsg(d.message || 'Failed to accept provider')
        }
      }catch{ setMsg('Failed to accept provider') }
      setFinalizing(false)
    }
    async function send(){
      if (!text.trim()) return
      setLoading(true); setMsg('')
      try{
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text })
        })
        if (res.ok){ setText(''); await load() } else if (res.status===403){ try{ const d=await res.json(); if (d.suspended){ setSuspended(true); setSuspendReason(d.reason || ''); setMsg(d.message || 'Messaging suspended') } else { setMsg(d.message || 'Forbidden') } } catch { setMsg('Messaging suspended') } } else { setMsg('Failed to send') }
      }catch{ setMsg('Failed to send') }
      setLoading(false)
    }
    useEffect(()=>{ if (projectId) load() }, [projectId])
    // Auto-refresh every 5s while open
    useEffect(()=>{
      if (!projectId) return
      const t = setInterval(load, 5000)
      setTimer(t)
      return ()=>{ clearInterval(t) }
    }, [projectId])
    if (!open) return null
    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/30" onClick={()=>{ setOpen(false); onClose?.() }} />
        <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="section-title flex items-center gap-2">
              <span>Messages</span>
              {kanbanStatus ? (
                <span className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200" title="This provider is fully accepted for this project and is on the board">✔︎ Accepted</span>
              ) : (
                <span className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200" title="Chat enabled. Finalize to move to provider TODO.">Pending finalization</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {me?.role==='client' && !kanbanStatus && (
                <button className="btn btn-primary btn-sm" onClick={finalizeAcceptance} disabled={finalizing}>{finalizing? 'Accepting...' : 'Accept this provider'}</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={()=>setReportOpen(true)}>Report</button>
              <button className="btn btn-ghost" onClick={()=>{ setOpen(false); onClose?.() }}>Close</button>
            </div>
          </div>
          {msg && <div className="text-sm text-gray-700">{msg}</div>}
          {suspended && (
            <div className="mb-3 p-3 rounded border border-yellow-300 bg-yellow-50 text-sm text-yellow-900">
              <div className="font-medium mb-1">Messaging suspended</div>
              <div>{suspendReason || "Policy violation"}</div>
              <div className="mt-2"><button className="btn btn-ghost btn-sm" onClick={()=>setHelpOpen(v=>!v)}>Help</button></div>
            </div>
          )}
          {helpOpen && (
            <div className="mb-3 space-y-2 border rounded p-3">
              <div className="text-sm font-medium">Explain briefly why suspension should be reviewed</div>
              <textarea className="input min-h-[70px]" placeholder="Write reason..." value={helpText} onChange={e=>setHelpText(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <button className="btn btn-ghost" onClick={()=>setHelpOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={async ()=>{ setMsg(''); try{ const r = await fetch(`${API_BASE}/api/projects/${projectId}/chat/help`, { method:'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: helpText }) }); if (r.ok){ setHelpOpen(false); setHelpText(''); setMsg('Help requested to admin') } else { setMsg('Failed to request help') } } catch { setMsg('Failed to request help') } }}>Submit</button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="subtle">Loading...</div>
          ) : (
            <div className="space-y-2">
              {items.map(m => (
                <div key={m._id} className="border rounded p-2 text-sm">
                  <div className="text-xs text-gray-600 mb-1">{m.senderUsername}</div>
                  <div>{m.text}</div>
                </div>
              ))}
              {items.length===0 && <div className="subtle">No messages yet.</div>}
            </div>
          )}
          {me?.role==='client' && !kanbanStatus && pendingPayment && (
            <div className="mt-3 p-3 border rounded space-y-2">
              <div className="text-sm font-medium">Payment proof</div>
              <div className="text-xs text-gray-600">Upload a picture of payment. Admin must accept before project moves to TODO.</div>
              <input type="file" accept="image/*" onChange={e=>setPayFile(e.target.files?.[0]||null)} />
              <div>
                <button className="btn btn-primary btn-sm" disabled={!payFile || pendingPaymentSubmitted} onClick={async ()=>{
                  setMsg('')
                  try{
                    const fd = new FormData(); if (payFile) fd.append('image', payFile)
                    const r = await fetch(`${API_BASE}/api/projects/${projectId}/chat/payment`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: fd })
                    if (r.ok){ setMsg('Payment submitted for admin review'); setPayFile(null); await load() } else { setMsg('Failed to submit payment') }
                  } catch { setMsg('Failed to submit payment') }
                }}>{pendingPaymentSubmitted? 'Submitted' : 'Submit payment'}</button>
              </div>
            </div>
          )}
          <div className="mt-3 space-y-2">
            <textarea className="input min-h-[70px]" placeholder={suspended? "Suspended" : "Write a message..."} value={text} onChange={e=>setText(e.target.value)} disabled={suspended} />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={send} disabled={suspended || loading || !text.trim()}>{loading? 'Sending...' : 'Send'}</button>
              <button className="btn btn-ghost" onClick={()=>{ setOpen(false); onClose?.() }}>Cancel</button>
            </div>
          </div>
          {reportOpen && (
            <div className="fixed inset-0 z-50 flex">
              <div className="flex-1 bg-black/30" onClick={()=>setReportOpen(false)} />
              <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="section-title">Report this user</div>
                  <button className="btn btn-ghost" onClick={()=>setReportOpen(false)}>Close</button>
                </div>
                <div className="space-y-3">
                  <textarea className="input min-h-[80px]" placeholder="Write reason..." value={reportReason} onChange={e=>setReportReason(e.target.value)} />
                  <div>
                    <label className="subtle">Evidence (optional)</label>
                    <input type="file" accept="image/*" onChange={e=>setReportFile(e.target.files?.[0]||null)} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="btn btn-ghost" onClick={()=>setReportOpen(false)}>Cancel</button>
                    <button className="btn btn-primary" disabled={!reportReason.trim()} onClick={async ()=>{
                      setMsg('')
                      try{
                        const fd = new FormData(); fd.append('reason', reportReason.trim()); if (reportFile) fd.append('evidence', reportFile)
                        const r = await fetch(`${API_BASE}/api/projects/${projectId}/chat/report`, { method:'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
                        if (r.ok){ setMsg('Reported to admin'); setReportOpen(false); setReportReason(''); setReportFile(null) } else { setMsg('Failed to report') }
                      } catch { setMsg('Failed to report') }
                    }}>Submit</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
  
  function AdminSuspensionsButton(){
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  const [chatProjectId, setChatProjectId] = React.useState(null)

  async function load(){
    setLoading(true); setMsg('')
    try{
      const res = await fetch(API_BASE + "/api/projects/admin/suspensions", { headers: { Authorization: "Bearer " + token } })
      if (res.ok){ const d = await res.json(); setItems(d) } else { setMsg('Failed to load') }
    }catch{ setMsg('Failed to load') }
    setLoading(false)
  }
  async function removeSuspension(projectId){
    setMsg('')
    const res = await fetch(API_BASE + "/api/projects/admin/suspensions/" + projectId + "/remove", { method: "POST", headers: { Authorization: "Bearer " + token } })
    if (res.ok){ await load(); setMsg('Removed suspension') } else { setMsg('Failed to remove') }
  }
  function openPanel(){ setOpen(true); setItems([]); setMsg(''); load() }
  if (!me || me.role !== "admin") return null
  return (
    <>
      <button className="btn btn-ghost" onClick={openPanel}>Suspension Box</button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
          <div className="w-full max-w-2xl h-full bg-white card p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Active suspensions</div>
              <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
            </div>
            {msg && <div className="text-sm text-gray-700">{msg}</div>}
            {loading ? (<div className="subtle">Loading...</div>) : (
              <div className="space-y-3">
                {items.map(it => (
                  <div key={it.projectId} className="border rounded p-3 space-y-2">
                    <div className="text-sm text-gray-700 flex flex-wrap items-center gap-2">
                      <span className="font-medium">Project: {it.projectId}</span>
                      <span>• Client: {it.clientUsername}</span>
                      <span>• Provider: {it.providerUsername}</span>
                    </div>
                    <div className="text-sm">Reason: {it.reason}</div>
                    {it.helpRequested && <div className="text-sm text-yellow-700">Help requested: {it.helpReason || "Yes"}</div>}
                    {it.reportReason && (
                      <div className="text-sm">Report: {it.reportReason}{it.reportEvidenceUrl && (
                        <div className="mt-1"><img src={`${API_BASE}${it.reportEvidenceUrl}`} alt="evidence" className="max-h-36 rounded border" /></div>
                      )}</div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button className="btn btn-ghost" onClick={()=>setChatProjectId(it.projectId)}>View chat</button>
                      <button className="btn btn-primary" onClick={()=>removeSuspension(it.projectId)}>Remove suspension</button>
                    </div>
                  </div>
                ))}
                {items.length===0 && <div className="subtle">No suspensions.</div>}
              </div>
            )}
            {chatProjectId && <ChatDrawer projectId={chatProjectId} onClose={()=>setChatProjectId(null)} />}
          </div>
        </div>
      )}
    </>
  )
}

function AdminVerificationButton(){
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')

    async function fetchPending(){
      setLoading(true)
      try{
        const res = await fetch(`${API_BASE}/api/verification/admin/pending`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok){ const data = await res.json(); setItems(data) } else { setMsg('Failed to load') }
      }catch{ setMsg('Failed to load') }
      setLoading(false)
    }

    async function approve(id){
      setMsg('')
      const res = await fetch(`${API_BASE}/api/verification/admin/approve/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok){
        await fetchPending()
        // refresh feeds so verified badges update
        await fetchFeed()
        triggerProjectsReload()
        setMsg('Approved')
      } else { setMsg('Approval failed') }
    }

    function openPanel(){ setOpen(true); setItems([]); setMsg(''); fetchPending() }

    return (
      <>
        <button className="btn btn-ghost" onClick={openPanel}>User Verification</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-3xl h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Pending verification requests</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              {msg && <div className="text-sm text-gray-600">{msg}</div>}
              {loading ? (
                <div className="subtle">Loading...</div>
              ) : (
                <div className="space-y-4">
                  {items.map(v => (
                    <div key={v._id} className="border rounded p-4 space-y-3">
                      <div className="text-sm text-gray-700 flex flex-wrap gap-2">
                        <span className="font-medium">{v.username}</span>
                        <span>•</span>
                        <span>{v.role}</span>
                        <span>•</span>
                        <span>{v.category}</span>
                        {v.subtype && <><span>•</span><span>{v.subtype}</span></>}
                      </div>
                      {v.description && <div className="text-sm">{v.description}</div>}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {v.nidUrl && <img src={`${API_BASE}${v.nidUrl}`} alt="nid" className="rounded border" />}
                        {Array.isArray(v.certificateUrls) && v.certificateUrls.map((u,i)=>(<img key={i} src={`${API_BASE}${u}`} alt={`cert-${i}`} className="rounded border" />))}
                        {v.licenseUrl && <img src={`${API_BASE}${v.licenseUrl}`} alt="license" className="rounded border" />}
                        {v.companyLicenseUrl && <img src={`${API_BASE}${v.companyLicenseUrl}`} alt="company-license" className="rounded border" />}
                        {Array.isArray(v.companyRegistrationUrls) && v.companyRegistrationUrls.map((u,i)=>(<img key={i} src={`${API_BASE}${u}`} alt={`reg-${i}`} className="rounded border" />))}
                      </div>
                      <div className="flex justify-end">
                        <button className="btn btn-primary" onClick={()=>approve(v._id)}>Approve</button>
                      </div>
                    </div>
                  ))}
                  {items.length===0 && <div className="subtle">No pending requests.</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  function VerificationRequestDrawer({ onClose, forceMode }){
    const [step, setStep] = useState(0)
    const [mode, setMode] = useState(forceMode || (me?.role === 'client' ? 'client' : 'provider')) // client | provider
    const [providerType, setProviderType] = useState('') // individual | company
    const [individualRole, setIndividualRole] = useState('') // architect | engineer
    const [nid, setNid] = useState(null)
    const [certificates, setCertificates] = useState([])
    const [license, setLicense] = useState(null)
    const [companyLicense, setCompanyLicense] = useState(null)
    const [companyRegistrations, setCompanyRegistrations] = useState([])
    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')

    function reset(){
      setStep(forceMode ? 1 : 0); setMode(forceMode || (me?.role === 'client' ? 'client' : 'provider')); setProviderType(''); setIndividualRole('');
      setNid(null); setCertificates([]); setLicense(null); setCompanyLicense(null); setCompanyRegistrations([]); setDescription(''); setMsg('')
    }

    useEffect(()=>{
      // Auto-skip account type selection when role is known
      if (forceMode) setStep(1)
    }, [forceMode])

    async function submit(){
      setLoading(true); setMsg('')
      const fd = new FormData()
      let category = 'client'
      let subtype = ''
      if (mode === 'provider'){
        if (providerType === 'individual'){ category = 'provider_individual'; subtype = individualRole }
        else if (providerType === 'company'){ category = 'provider_company' }
      }
      fd.append('category', category)
      if (subtype) fd.append('subtype', subtype)
      if (description) fd.append('description', description)
      if (nid) fd.append('nid', nid)
      certificates.forEach(f => fd.append('certificates', f))
      if (license) fd.append('license', license)
      if (companyLicense) fd.append('companyLicense', companyLicense)
      companyRegistrations.forEach(f => fd.append('companyRegistrations', f))
      const res = await fetch(`${API_BASE}/api/verification/request`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
      })
      setLoading(false)
      if (res.ok){ setMsg('Submitted for verification'); setTimeout(()=>{ onClose?.(); reset(); }, 700) }
      else { try{ const d = await res.json(); setMsg(d?.message || 'Failed') } catch { setMsg('Failed') } }
    }

    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/30" onClick={onClose} />
        <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="section-title">Request for verification</div>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>

          {step===0 && !forceMode && (
            <div className="space-y-3">
              <div className="section-title">Select account type</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`card p-4 transition ${mode==='client' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setMode('client')}}
                >Client</button>
                <button
                  type="button"
                  className={`card p-4 transition ${mode==='provider' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setMode('provider')}}
                >Service provider</button>
              </div>
              <div className="flex justify-end"><button className="btn btn-primary" onClick={()=>setStep(1)}>Next</button></div>
            </div>
          )}

          {step===1 && mode==='client' && (
            <div className="space-y-4">
              <div>
                <label className="subtle">Upload National ID card picture</label>
                <input type="file" accept="image/*" className="mt-1" onChange={e=>setNid(e.target.files?.[0]||null)} />
              </div>
              <div>
                <label className="subtle">Description (optional)</label>
                <textarea className="input mt-1 min-h-[100px]" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Notes for admin..." />
              </div>
              {msg && <div className={`text-sm ${msg.includes('Submitted')?'text-green-700':'text-red-600'}`}>{msg}</div>}
              <div className="flex items-center justify-between">
                <button className="btn btn-ghost" onClick={()=>{ if (forceMode) { onClose?.() } else { setStep(0) } }}>Back</button>
                <button className="btn btn-primary" onClick={submit} disabled={loading || !nid}>{loading? 'Submitting...' : 'Submit'}</button>
              </div>
            </div>
          )}

          {step===1 && mode==='provider' && !providerType && (
            <div className="space-y-3">
              <div className="section-title">Select provider type</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`card p-4 transition ${providerType==='individual' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setProviderType('individual'); setStep(2)}}
                >Individual</button>
                <button
                  type="button"
                  className={`card p-4 transition ${providerType==='company' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setProviderType('company'); setStep(2)}}
                >Company</button>
              </div>
              <div className="flex justify-between">
                <button className="btn btn-ghost" onClick={()=>{ if (forceMode) { onClose?.() } else { setStep(0) } }}>Back</button>
                {providerType && <button className="btn btn-primary" onClick={()=>setStep(2)}>Next</button>}
              </div>
            </div>
          )}

          {step===2 && mode==='provider' && providerType==='individual' && !individualRole && (
            <div className="space-y-3">
              <div className="section-title">Are you</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`card p-4 transition ${individualRole==='architect' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setIndividualRole('architect'); setStep(3)}}
                >An Architect</button>
                <button
                  type="button"
                  className={`card p-4 transition ${individualRole==='engineer' ? 'ring-2 ring-primary-600 border-primary-300 bg-primary-50' : 'ring-1 ring-gray-200 hover:ring-primary-300'}`}
                  onClick={(e)=>{e.preventDefault(); setIndividualRole('engineer'); setStep(3)}}
                >An Engineer</button>
              </div>
              <div className="flex justify-between">
                <button className="btn btn-ghost" onClick={()=>{ if (forceMode) { setProviderType(''); setStep(1) } else { setProviderType(''); setStep(1) } }}>Back</button>
                {individualRole && <button className="btn btn-primary" onClick={()=>setStep(3)}>Next</button>}
              </div>
            </div>
          )}

          {((step===2 && mode==='provider' && providerType==='company') || (step===3 && mode==='provider' && providerType==='individual')) && (
            <div className="space-y-4">
              {providerType==='individual' && (
                <>
                  <div>
                    <label className="subtle">Upload National ID card picture</label>
                    <input type="file" accept="image/*" className="mt-1" onChange={e=>setNid(e.target.files?.[0]||null)} />
                  </div>
                  <div>
                    <label className="subtle">Upload institutional certificates</label>
                    <input multiple type="file" accept="image/*" className="mt-1" onChange={e=>setCertificates(Array.from(e.target.files||[]))} />
                  </div>
                  <div>
                    <label className="subtle">Upload work license picture</label>
                    <input type="file" accept="image/*" className="mt-1" onChange={e=>setLicense(e.target.files?.[0]||null)} />
                  </div>
                </>
              )}
              {providerType==='company' && (
                <>
                  <div>
                    <label className="subtle">Upload company license picture</label>
                    <input type="file" accept="image/*" className="mt-1" onChange={e=>setCompanyLicense(e.target.files?.[0]||null)} />
                  </div>
                  <div>
                    <label className="subtle">Upload company registration certificates</label>
                    <input multiple type="file" accept="image/*" className="mt-1" onChange={e=>setCompanyRegistrations(Array.from(e.target.files||[]))} />
                  </div>
                </>
              )}
              <div>
                <label className="subtle">Description (optional)</label>
                <textarea className="input mt-1 min-h-[100px]" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Notes for admin..." />
              </div>
              {msg && <div className={`text-sm ${msg.includes('Submitted')?'text-green-700':'text-red-600'}`}>{msg}</div>}
              <div className="flex items-center justify-between">
                <button className="btn btn-ghost" onClick={()=>{ if (providerType==='company'){ setProviderType(''); setStep(1) } else { setIndividualRole(''); setStep(2) } }}>Back</button>
                <button className="btn btn-primary" onClick={submit} disabled={loading || (providerType==='individual' && (!nid || !license)) || (providerType==='company' && (!companyLicense))}>{loading? 'Submitting...' : 'Submit'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
  
  function ProjectRequestDrawer(){
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState(0)
    const [category, setCategory] = useState('') // 'architecture' | 'engineering'
    const [subcategory, setSubcategory] = useState('') // exterior/interior or complete/partial
    const [tier, setTier] = useState('') // luxuries/regular/normal (architecture only)
    const [projectType, setProjectType] = useState('') // engineering type
    const [image, setImage] = useState(null) // architecture optional image
    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const [biddingDeadline, setBiddingDeadline] = useState('')
    const [calInfo, setCalInfo] = useState({ hasTokens: false })
    const [loc, setLoc] = useState(null) // { lat, lng, address }
    const [locOpen, setLocOpen] = useState(false)

    function reset(){
      setStep(0); setCategory(''); setSubcategory(''); setTier(''); setProjectType(''); setImage(null); setDescription(''); setBiddingDeadline(''); setLoc(null)
    }

    async function confirm(){
      setLoading(true)
      const fd = new FormData()
      fd.append('category', category)
      if (subcategory) fd.append('subcategory', subcategory)
      if (tier) fd.append('tier', tier)
      if (projectType) fd.append('projectType', projectType)
      if (description) fd.append('description', description)
      if (biddingDeadline) fd.append('biddingDeadline', new Date(biddingDeadline).toISOString())
      if (image && category==='architecture') fd.append('image', image)
      if (loc && loc.lat!=null && loc.lng!=null) fd.append('location', JSON.stringify(loc))
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      setLoading(false)
      if (res.ok){
        triggerProjectsReload()
        setOpen(false)
        reset()
        setActiveTab('projects')
      }
    }

    return (
      <div>
        <button className="btn btn-primary" onClick={()=>{ setOpen(true); reset(); }}>Project Request</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">New Project Request</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              <div className="mb-3 text-xs text-gray-600">
                {calendarConnected ? 'Calendar connected ✓ — a Google Calendar event will be created when you set a bidding deadline.' : 'Calendar not connected — you can still set a bidding deadline; connect to auto-create a Calendar event.'}
              </div>

              {step===0 && (
                <div className="space-y-3">
                  <div className="section-title">Choose category</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button className={`card p-4 ${category==='architecture'?'ring-2 ring-primary-600':''}`} onClick={()=>{setCategory('architecture'); setStep(1)}}>Architecture project</button>
                    <button className={`card p-4 ${category==='engineering'?'ring-2 ring-primary-600':''}`} onClick={()=>{setCategory('engineering'); setStep(1)}}>Engineering project</button>
                  </div>
                </div>
              )}

              {step===1 && category==='architecture' && (
                <div className="space-y-3">
                  <div className="section-title">Select type</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button className={`card p-4 ${subcategory==='Exterior design'?'ring-2 ring-primary-600':''}`} onClick={()=>{setSubcategory('Exterior design'); setStep(2)}}>Exterior design</button>
                    <button className={`card p-4 ${subcategory==='Interior design'?'ring-2 ring-primary-600':''}`} onClick={()=>{setSubcategory('Interior design'); setStep(2)}}>Interior design</button>
                  </div>
                </div>
              )}

              {step===2 && category==='architecture' && (
                <div className="space-y-3">
                  <div className="section-title">Select option</div>
                  <div className="grid grid-cols-3 gap-3">
                    {['Luxuries','regular','normal'].map(t => (
                      <button key={t} className={`card p-4 ${tier.toLowerCase()===t.toLowerCase()?'ring-2 ring-primary-600':''}`} onClick={()=>{setTier(t.toLowerCase()); setStep(3)}}>{t}</button>
                    ))}
                  </div>
                </div>
              )}

              {step===3 && category==='architecture' && (
                <div className="space-y-4">
                  <div>
                    <label className="subtle">Upload picture</label>
                    <input type="file" accept="image/*" className="mt-1" onChange={e=>setImage(e.target.files?.[0]||null)} />
                  </div>
                  <div>
                    <label className="subtle">Description</label>
                    <textarea className="input mt-1 min-h-[100px]" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Write about your project..." />
                  </div>
                  <div>
                    <label className="subtle">Bidding deadline</label>
                    <input type="datetime-local" className="input mt-1" value={biddingDeadline} onChange={e=>setBiddingDeadline(e.target.value)} />
                  </div>
                  <div>
                    <label className="subtle">Project location (optional)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <button type="button" className="btn btn-ghost" onClick={()=>setLocOpen(true)}>{loc? 'Edit location' : 'Add location'}</button>
                      {loc && <span className="text-xs text-gray-600">Lat {Number(loc.lat).toFixed(4)}, Lng {Number(loc.lng).toFixed(4)}</span>}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={confirm} disabled={loading}>{loading? 'Posting...' : 'Confirm'}</button>
                </div>
              )}

              {step===1 && category==='engineering' && (
                <div className="space-y-3">
                  <div className="section-title">Select type</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button className={`card p-4 ${subcategory==='Complete house design'?'ring-2 ring-primary-600':''}`} onClick={()=>{setSubcategory('Complete house design'); setStep(2)}}>Complete house design</button>
                    <button className={`card p-4 ${subcategory==='Partial house design'?'ring-2 ring-primary-600':''}`} onClick={()=>{setSubcategory('Partial house design'); setStep(2)}}>Partial house design</button>
                  </div>
                </div>
              )}

              {step===2 && category==='engineering' && (
                <div className="space-y-3">
                  <div className="section-title">Select option</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {['One storied building','Duplex/Triplex','Multi storied building'].map(opt => (
                      <button key={opt} className={`card p-4 ${projectType===opt?'ring-2 ring-primary-600':''}`} onClick={()=>{setProjectType(opt); setStep(3)}}>{opt}</button>
                    ))}
                  </div>
                </div>
              )}

              {step===3 && category==='engineering' && (
                <div className="space-y-4">
                  <div>
                    <label className="subtle">Description</label>
                    <textarea className="input mt-1 min-h-[100px]" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Write about your project..." />
                  </div>
                  <div>
                    <label className="subtle">Bidding deadline</label>
                    <input type="datetime-local" className="input mt-1" value={biddingDeadline} onChange={e=>setBiddingDeadline(e.target.value)} />
                  </div>
                  <div>
                    <label className="subtle">Project location (optional)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <button type="button" className="btn btn-ghost" onClick={()=>setLocOpen(true)}>{loc? 'Edit location' : 'Add location'}</button>
                      {loc && <span className="text-xs text-gray-600">Lat {Number(loc.lat).toFixed(4)}, Lng {Number(loc.lng).toFixed(4)}</span>}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={confirm} disabled={loading}>{loading? 'Posting...' : 'Confirm'}</button>
                </div>
              )}
            </div>
            {locOpen && (
              <div className="fixed inset-0 z-50 flex">
                <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
                <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <div className="section-title">Set project location</div>
                    <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
                  </div>
                  <div className="space-y-3">
                    <MapPicker value={loc} onChange={setLoc} height={360} />
                    {loc && <div className="text-xs text-gray-700">Lat {Number(loc.lat).toFixed(6)}, Lng {Number(loc.lng).toFixed(6)}</div>}
                    <div className="flex gap-2 justify-end">
                      <button className="btn btn-ghost" onClick={()=>setLoc(null)}>Clear</button>
                      <button className="btn btn-primary" onClick={()=>setLocOpen(false)}>Done</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  
  function ProviderPanel(){
    const [content, setContent] = useState('')
    const [file, setFile] = useState(null)
    const [loading, setLoading] = useState(false)
    async function onSubmit(e){
      e.preventDefault()
      setLoading(true)
      await createPost({ content, file })
      setContent('')
      setFile(null)
      setLoading(false)
    }
    return (
      <div className="space-y-4">
        <div className="card p-6 space-y-3">
          <div className="section-title">Create a status</div>
          <form onSubmit={onSubmit} className="space-y-3">
            <textarea className="input min-h-[80px]" placeholder="What's new?" value={content} onChange={e=>setContent(e.target.value)} />
            <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)} />
            <button className="btn btn-primary" disabled={loading}>{loading? 'Posting...' : 'Post (Pending for approval)'}</button>
          </form>
        </div>
        <div className="card p-6">
          <div className="section-title mb-3">My posts</div>
          <div className="space-y-3">
            {myPosts.map(p=> (
              <div key={p._id} className="border rounded p-3 space-y-2">
                <div className="text-sm text-gray-600">Status: <span className={p.status==='approved' ? 'text-green-700' : 'text-yellow-700'}>{p.status}</span></div>
                {p.content && <div>{p.content}</div>}
                {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="post" className="max-h-64 rounded" />}
              </div>
            ))}
            {myPosts.length===0 && <div className="subtle">No posts yet.</div>}
          </div>
        </div>
      </div>
    )
  }

  function AdminPanel(){
    return (
      <div className="card p-6">
        <div className="section-title mb-3">Pending posts</div>
        <div className="space-y-3">
          {pendingPosts.map(p => (
            <div key={p._id} className="border rounded p-3 space-y-2">
              <div className="text-sm text-gray-600">By: {p.authorUsername}</div>
              {p.content && <div>{p.content}</div>}
              {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="post" className="max-h-64 rounded" />}
              <button className="btn btn-primary" onClick={()=>approvePost(p._id)}>Approve</button>
            </div>
          ))}
          {pendingPosts.length===0 && <div className="subtle">No pending posts.</div>}
        </div>
        {me?.role==='admin' && (
          <div className="mt-6 flex gap-2 items-center">
            <AdminSuspensionsButton />
            <AdminReportsButton />
            <AdminPaymentsPanelButton />
          </div>
        )}
      </div>
    )
  }

  function AdminReportsButton(){
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    async function load(){
      setLoading(true); setMsg('')
      try{
        const r = await fetch(`${API_BASE}/api/projects/admin/reports`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ setItems(await r.json()) } else { setMsg('Failed to load') }
      }catch{ setMsg('Failed to load') }
      setLoading(false)
    }
    async function warn(id){
      setMsg('')
      try{
        const r = await fetch(`${API_BASE}/api/projects/admin/reports/${id}/warn`, { method:'POST', headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ setMsg('Warned and notified'); await load() } else { setMsg('Failed to warn') }
      }catch{ setMsg('Failed to warn') }
    }
    if (!me || me.role!=='admin') return null
    return (
      <>
        <button className="btn btn-ghost" onClick={()=>{ setOpen(true); setItems([]); setMsg(''); load() }}>Reports</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-3xl h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Open reports</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              {msg && <div className="text-sm text-gray-700">{msg}</div>}
              {loading ? (<div className="subtle">Loading...</div>) : (
                <div className="space-y-3">
                  {items.map(r => (
                    <div key={r._id} className="border rounded p-3 space-y-2">
                      <div className="text-sm text-gray-700">Project: {r.projectId} • Reporter: {r.reporterUsername} • Reported: {r.reportedUsername}</div>
                      <div className="text-sm">Reason: {r.reason}</div>
                      {r.evidenceUrl && <img src={`${API_BASE}${r.evidenceUrl}`} alt="evidence" className="max-h-48 rounded border" />}
                      <div className="flex justify-end">
                        <button className="btn btn-primary" onClick={()=>warn(r._id)}>Warn</button>
                      </div>
                    </div>
                  ))}
                  {items.length===0 && <div className="subtle">No open reports.</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  // Admin: payments from clients pending approval (top-level)
  function AdminPaymentsPanelButton(){
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    async function load(){
      setLoading(true); setMsg('')
      try{
        const r = await fetch(`${API_BASE}/api/projects/admin/payments`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ setItems(await r.json()) } else { setMsg('Failed to load') }
      }catch{ setMsg('Failed to load') }
      setLoading(false)
    }
    async function accept(id){
      setMsg('')
      try{
        const r = await fetch(`${API_BASE}/api/projects/admin/payments/${id}/accept`, { method:'POST', headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ setMsg('Payment accepted'); await load() } else { setMsg('Failed to accept') }
      }catch{ setMsg('Failed to accept') }
    }
    if (!me || me.role!=='admin') return null
    return (
      <>
        <button className="btn btn-ghost" onClick={()=>{ setOpen(true); setItems([]); setMsg(''); load() }}>Payments</button>
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
            <div className="w-full max-w-3xl h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Pending payments from clients</div>
                <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
              </div>
              {msg && <div className="text-sm text-gray-700">{msg}</div>}
              {loading ? (<div className="subtle">Loading...</div>) : (
                <div className="space-y-3">
                  {items.map(r => (
                    <div key={r._id} className="border rounded p-3 space-y-2">
                      <div className="text-sm text-gray-700">Project: {r.projectId} • Client: {r.clientUsername}</div>
                      {r.imageUrl && <img src={`${API_BASE}${r.imageUrl}`} alt="payment" className="max-h-48 rounded border" />}
                      <div className="flex justify-end">
                        <button className="btn btn-primary" onClick={()=>accept(r._id)}>Accept</button>
                      </div>
                    </div>
                  ))}
                  {items.length===0 && <div className="subtle">No pending payments.</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    )
  }

  function FeedPanel(){
    const [locOpen, setLocOpen] = useState(false)
    const [locView, setLocView] = useState(null)
    return (
      <div className="card p-6">
        <div className="section-title mb-3">Feed</div>
        <div className="space-y-3">
          {feed.map(p => (
            <div key={p._id} className="border rounded p-3 space-y-2">
              <div className="text-sm text-gray-600 flex items-center gap-2">
                <span className="flex items-center gap-1">By: {p.authorUsername}{verifiedMap[p.authorUsername] && <span title="Verified" className="text-green-600">✔︎</span>}</span>
                <span className="text-green-700 font-medium">Approved</span>
              </div>
              {p.content && <div>{p.content}</div>}
              {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="post" className="max-h-64 rounded" />}
              {p.location && (
                <div>
                  <button className="btn btn-ghost" onClick={()=>{ setLocView(p.location); setLocOpen(true) }}>View location</button>
                </div>
              )}
            </div>
          ))}
          {feed.length===0 && <div className="subtle">No posts yet.</div>}
        </div>
        {locOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
            <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Project location</div>
                <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
              </div>
              <div className="space-y-3">
                <MapPicker readOnly value={locView} height={360} />
                {locView && <div className="text-xs text-gray-700">Lat {Number(locView.lat).toFixed(6)}, Lng {Number(locView.lng).toFixed(6)}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  
  function ProjectsFeedPanel({ reloadKey }){
    const [chatProjectId, setChatProjectId] = useState(null)
    // Filters
    const [cat, setCat] = useState('') // architecture | engineering | ''
    // Architecture
    const [archSub, setArchSub] = useState('') // exterior | interior
    const [archTier, setArchTier] = useState('') // regular | luxuries | normal
    // Engineering
    const [engType, setEngType] = useState('') // complete house design | partial house design
    const [engSubtype, setEngSubtype] = useState('') // one storied building | duplex/triplex | multi storied building
    // Local projects list
    const [projects, setProjects] = useState([])
    const [acceptedIds, setAcceptedIds] = useState(new Set())
    const [lastSeen, setLastSeen] = useState({}) // { projectId: isoString }
    const [lastServer, setLastServer] = useState({}) // { projectId: isoString }
    const feedInFlight = React.useRef(false)
    const acceptedInFlight = React.useRef(false)
    const mountedRef = React.useRef(false)
    const requestIdRef = React.useRef(0)
    const [feedMsg, setFeedMsg] = useState('')
    const [feedLoading, setFeedLoading] = useState(false)
    // Local verified map to avoid triggering parent re-renders
    const [projVerifiedMap, setProjVerifiedMap] = useState({})
    // Throttle guards
    const lastParamsRef = React.useRef('')
    const lastFetchedAtRef = React.useRef(0)
    const lastReloadKeyRef = React.useRef(reloadKey)
    const acceptedIdsLastFetchAtRef = React.useRef(0)

    // Kanban boards
    const [provBoard, setProvBoard] = useState({ todo: [], inProcess: [], done: [] })
    const [clientBoard, setClientBoard] = useState({ todo: [], inProcess: [], done: [] })
    const [expectedModal, setExpectedModal] = useState({ open: false, projectId: null, value: '' })
    const [expectedMsg, setExpectedMsg] = useState('')
    const [locOpen, setLocOpen] = useState(false)
    const [locView, setLocView] = useState(null)
    async function loadProvBoard(){
      try{
        const r = await fetch(`${API_BASE}/api/projects/kanban/provider`, { headers: { Authorization: `Bearer ${token}` }})
        if (r.ok){ setProvBoard(await r.json()) }
      }catch{}
    }
    async function loadClientBoard(){
      try{
        const r = await fetch(`${API_BASE}/api/projects/kanban/client`, { headers: { Authorization: `Bearer ${token}` }})
        if (r.ok){ setClientBoard(await r.json()) }
      }catch{}
    }
    useEffect(()=>{ if (me?.role==='provider') loadProvBoard(); if (me?.role==='client') loadClientBoard(); }, [me, token, reloadKey])
    // Periodically refresh provider board when Projects tab is active
    useEffect(()=>{
      if (!(me?.role==='provider')) return
      const id = setInterval(()=>{ loadProvBoard() }, 5000)
      return ()=>clearInterval(id)
    }, [me, token])
    // Refresh on visibility change (when user switches back to tab)
    useEffect(()=>{
      if (!(me?.role==='provider')) return
      function onVis(){ if (document.visibilityState === 'visible') loadProvBoard() }
      document.addEventListener('visibilitychange', onVis)
      window.addEventListener('focus', onVis)
      return ()=>{ document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
    }, [me, token])
    async function provAccept(projectId){ await fetch(`${API_BASE}/api/projects/${projectId}/kanban/accept`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }}); loadProvBoard() }
    function openExpectedModal(projectId){
      // prefill with current datetime-local string
      const now = new Date()
      const pad = (n)=> String(n).padStart(2,'0')
      const local = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
      setExpectedMsg('')
      setExpectedModal({ open: true, projectId, value: local })
    }
    async function saveExpected(){
      const { projectId, value } = expectedModal
      if (!projectId || !value) { setExpectedModal({ open:false, projectId:null, value:'' }); return }
      setExpectedMsg('')
      const iso = new Date(value)
      if (isNaN(iso.getTime())){ setExpectedMsg('Please enter a valid date/time'); return }
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/kanban/expected-deadline`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ expectedDeadline: iso.toISOString() })
      })
      if (res.ok){
        setExpectedModal({ open:false, projectId:null, value:'' })
        loadProvBoard()
      } else {
        let d = {}
        try{ d = await res.json() }catch{}
        setExpectedMsg(d.message || 'Failed to set expected deadline')
      }
    }
    async function provDone(projectId){ await fetch(`${API_BASE}/api/projects/${projectId}/kanban/done`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }}); loadProvBoard() }
    async function provUpload(projectId, files){ const fd=new FormData(); [...files].forEach(f=>fd.append('images', f)); await fetch(`${API_BASE}/api/projects/${projectId}/kanban/done/uploads`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: fd }); loadProvBoard() }

    function sameSet(a, b){
      if (a.size !== b.size) return false
      for (const v of a){ if (!b.has(v)) return false }
      return true
    }

    async function fetchAcceptedIds(){
      if (!me || !token) return
      if (acceptedInFlight.current) return
      const now = Date.now()
      if (now - acceptedIdsLastFetchAtRef.current < 3000) return
      acceptedIdsLastFetchAtRef.current = now
      acceptedInFlight.current = true
      try{
        if (me.role === 'provider'){
          const r = await fetch(`${API_BASE}/api/projects/my/accepted-ids`, { headers: { Authorization: `Bearer ${token}` } })
          if (r.ok){ const ids = await r.json(); const next = new Set(ids.map(String)); if (!sameSet(next, acceptedIds)) setAcceptedIds(next) }
        } else if (me.role === 'client'){
          const r = await fetch(`${API_BASE}/api/projects/my/with-accepted-ids`, { headers: { Authorization: `Bearer ${token}` } })
          if (r.ok){ const ids = await r.json(); const next = new Set(ids.map(String)); if (!sameSet(next, acceptedIds)) setAcceptedIds(next) }
        }
      }catch{}
      acceptedInFlight.current = false
    }

    async function fetchLastServer(ids){
      if (!me || !token || !ids || ids.size===0) { setLastServer({}); return }
      const q = encodeURIComponent(Array.from(ids).join(','))
      try{
        const r = await fetch(`${API_BASE}/api/projects/chat/last?ids=${q}`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok){ const data = await r.json(); setLastServer(data) }
      }catch{}
    }

    async function load(){
      if (feedInFlight.current) return
      // Build params string for throttling
      const params = new URLSearchParams()
      if (cat) params.set('category', cat)
      if (cat === 'architecture'){
        if (archSub) params.set('subcategory', archSub)
        if (archTier) params.set('tier', archTier)
      }
      if (cat === 'engineering'){
        if (engType) params.set('subcategory', engType)
        if (engSubtype) params.set('projectType', engSubtype)
      }
      params.set('limit','50')
      const paramsStr = params.toString()
      const now = Date.now()
      const reloadChanged = reloadKey !== lastReloadKeyRef.current
      if (!reloadChanged && paramsStr === lastParamsRef.current && (now - lastFetchedAtRef.current) < 3000){
        return
      }
      feedInFlight.current = true
      setFeedMsg(''); setFeedLoading(true)
      lastParamsRef.current = paramsStr
      lastFetchedAtRef.current = now
      lastReloadKeyRef.current = reloadKey
      const reqId = ++requestIdRef.current
      try{
        const url = `${API_BASE}/api/projects/feed${paramsStr? ('?'+paramsStr) : ''}`
        const res = await fetch(url)
        if (res.ok && mountedRef.current && reqId === requestIdRef.current){
          const data = await res.json()
          setProjects(data)
          const names = Array.from(new Set(data.map(x=>x.authorUsername)))
          if (names.length){
            try{
              const q = encodeURIComponent(names.join(','))
              const vr = await fetch(`${API_BASE}/api/verification/verified?usernames=${q}`)
              if (vr.ok && mountedRef.current && reqId === requestIdRef.current){ const map = await vr.json(); setProjVerifiedMap(map) }
            }catch{}
          } else {
            setProjVerifiedMap({})
          }
        }
        else { setFeedMsg('Failed to load projects') }
      }catch{ setFeedMsg('Failed to load projects') }
      setFeedLoading(false)
      feedInFlight.current = false
    }

    useEffect(()=>{ mountedRef.current = true; load(); return ()=>{ mountedRef.current = false } }, [])
    useEffect(()=>{ load() }, [reloadKey])
    useEffect(()=>{ fetchAcceptedIds() }, [me, token])
    useEffect(()=>{ fetchLastServer(acceptedIds) }, [acceptedIds])
    function BidBox({ projectId, onSent }){
      const [open, setOpen] = useState(false)
      const [text, setText] = useState('')
      const [loading, setLoading] = useState(false)
      const [msg, setMsg] = useState('')
      async function send(){
        if (!text.trim()) return
        setLoading(true); setMsg('')
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/bids`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text })
        })
        setLoading(false)
        if (res.ok){ setText(''); setOpen(false); setMsg(''); onSent?.() } else { setMsg('Failed to send bid') }
      }
      if (!me || me.role !== 'provider') return null
      return (
        <div className="mt-2">
          {!open ? (
            <button className="btn btn-ghost" onClick={()=>setOpen(true)}>Bid</button>
          ) : (
            <div className="space-y-2">
              <textarea className="input min-h-[80px]" placeholder="Write your bid..." value={text} onChange={e=>setText(e.target.value)} />
              {msg && <div className="text-sm text-red-600">{msg}</div>}
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={loading || !text.trim()} onClick={send}>{loading? 'Sending...' : 'Send'}</button>
                <button className="btn btn-ghost" onClick={()=>{ setOpen(false); setText(''); setMsg('') }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )
    }

    function BidsModal({ project, onOpenChat, onAccepted }){
      const [open, setOpen] = useState(false)
      const [items, setItems] = useState([])
      const [loading, setLoading] = useState(false)
      const [msg, setMsg] = useState('')
      async function load(){
        setLoading(true); setMsg('')
        const res = await fetch(`${API_BASE}/api/projects/${project._id}/bids`, { headers: { Authorization: `Bearer ${token}` } })
        setLoading(false)
        if (res.ok){ const d = await res.json(); setItems(d) } else { setMsg('Failed to load bids') }
      }
      async function accept(bidId){
        setMsg('')
        const res = await fetch(`${API_BASE}/api/projects/${project._id}/bids/${bidId}/accept`, { method:'POST', headers: { Authorization: `Bearer ${token}` } })
        if (res.ok){ await load(); setMsg('Bid accepted'); onAccepted?.() } else { setMsg('Failed to accept') }
      }
      function openPanel(){ setOpen(true); load() }
      if (!me || me.role !== 'client' || me.username !== project.authorUsername) return null
      return (
        <>
          <button type="button" className="btn btn-ghost" onClick={openPanel}>Post BID</button>
          {open && (
            <div className="fixed inset-0 z-50 flex">
              <div className="flex-1 bg-black/30" onClick={()=>setOpen(false)} />
              <div className="w-full max-w-md h-full bg-white card p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="section-title">Bids for your project</div>
                  <button className="btn btn-ghost" onClick={()=>setOpen(false)}>Close</button>
                </div>
                {msg && <div className="text-sm text-gray-700">{msg}</div>}
                {loading ? (<div className="subtle">Loading...</div>) : (
                  <div className="space-y-3">
                    {items.map(b => (
                      <div key={b._id} className="border rounded p-3 space-y-2">
                        <div className="text-sm text-gray-700 flex items-center gap-2">
                          <span className="font-medium">{b.username}</span>
                          {b.accepted && <span className="text-green-600">✔︎ Accepted</span>}
                        </div>
                        <div>{b.text}</div>
                        <div className="flex justify-end gap-2">
                          {!b.accepted && (
                            <button className="btn btn-primary" onClick={()=>accept(b._id)}>Accept</button>
                          )}
                          {b.accepted && (
                            <button className="btn btn-ghost" title="Open chat" onClick={()=>onOpenChat?.(project._id)}>💬 Message</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {items.length===0 && <div className="subtle">No bids yet.</div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )
    }

    return (
      <div className="card p-6">
        <div className="section-title mb-3">Projects</div>
        {me?.role==='provider' && (
          <div className="mb-6 border rounded p-3">
            <div className="font-semibold mb-2">My Board (Provider)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="subtle mb-1">TODO</div>
                <div className="space-y-2">
                  {provBoard.todo.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm space-y-1">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="flex gap-2">
                        <button className="btn btn-primary btn-xs" onClick={()=>provAccept(it.projectId)}>Accept</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>boardOpenInvite(it.projectId)}>Invite providers</button>
                        {it.location && (
                          <button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {provBoard.todo.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
              <div>
                <div className="subtle mb-1">In process</div>
                <div className="space-y-2">
                  {provBoard.inProcess.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm space-y-1">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs">Expected: {it.expectedDeadline ? new Date(it.expectedDeadline).toLocaleString() : '—'}</div>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-xs" onClick={()=>openExpectedModal(it.projectId)}>Set expected</button>
                        <button className="btn btn-primary btn-xs" onClick={()=>provDone(it.projectId)}>Done</button>
                        {it.location && (
                          <button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {provBoard.inProcess.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
              <div>
                <div className="subtle mb-1">Done</div>
                <div className="space-y-2">
                  {provBoard.done.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm space-y-1">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs">Uploads: {(it.uploads||[]).length}</div>
                      {it.location && (
                        <button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button>
                      )}
                      <label className="btn btn-ghost btn-xs inline-flex items-center gap-2">
                        <input type="file" multiple className="hidden" onChange={e=>{ if(e.target.files?.length){ provUpload(it.projectId, e.target.files) } }} />
                        Upload
                      </label>
                    </div>
                  ))}
                  {provBoard.done.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {boardInviteOpen && (
          <Portal>
            <div className="fixed inset-0 z-[100] flex" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
              <div className="flex-1 bg-black/30" onClick={boardCloseInvite} />
              <div className="w-full max-w-xl h-full bg-white card p-6 overflow-y-auto shadow-2xl" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2">
                  <div className="section-title">Invite providers</div>
                  <button className="btn btn-ghost" onClick={boardCloseInvite}>Close</button>
                </div>
                {boardInviteMsg && <div className="text-sm text-gray-700 mb-2">{boardInviteMsg}</div>}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input className="input flex-1" placeholder="Search providers by username or name" value={boardInviteSearchQ} onChange={e=>setBoardInviteSearchQ(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter'){ e.preventDefault(); boardSearchProviders() } }} autoFocus />
                    <button className="btn btn-primary" onClick={boardSearchProviders} disabled={boardInviteSearchLoading}>{boardInviteSearchLoading? 'Searching...' : 'Search'}</button>
                  </div>
                  <div className="space-y-2">
                    {boardInviteResults.map(u => (
                      <div key={u.username} className="border rounded p-2 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium">{u.username}</span> {u.displayName && <span className="subtle">• {u.displayName}</span>}
                          {typeof u.ratingAvg !== 'undefined' && (
                            <span className="subtle ml-2">★ {Number(u.ratingAvg||0).toFixed(1)} ({u.ratingCount||0})</span>
                          )}
                        </div>
                        <button className="btn btn-ghost" onClick={()=>boardToggleInvite(u.username)}>{boardInviteSelected.has(u.username)? 'Remove' : 'Add'}</button>
                      </div>
                    ))}
                    {boardInviteResults.length===0 && !boardInviteSearchLoading && <div className="subtle">No results</div>}
                  </div>
                  {boardInviteSelected.size>0 && (
                    <div className="text-sm">Selected: {Array.from(boardInviteSelected).join(', ')}</div>
                  )}
                  <div className="flex justify-end">
                    <button className="btn btn-primary" disabled={boardInviteLoading || boardInviteSelected.size===0} onClick={boardSubmitInvite}>{boardInviteLoading? 'Inviting...' : 'Send invites'}</button>
                  </div>
                </div>
              </div>
            </div>
          </Portal>
        )}
        {me?.role==='client' && (
          <div className="mb-6 border rounded p-3">
            <div className="font-semibold mb-2">My Projects (Client)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="subtle mb-1">TODO</div>
                <div className="space-y-2">
                  {clientBoard.todo.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs">Accepted: {it.clientAcceptedAt ? new Date(it.clientAcceptedAt).toLocaleString() : '—'}</div>
                      {it.location && <div className="mt-1"><button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button></div>}
                    </div>
                  ))}
                  {clientBoard.todo.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
              <div>
                <div className="subtle mb-1">In process</div>
                <div className="space-y-2">
                  {clientBoard.inProcess.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="text-xs">Expected: {it.expectedDeadline ? new Date(it.expectedDeadline).toLocaleString() : '—'}</div>
                      {it.location && <div className="mt-1"><button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button></div>}
                    </div>
                  ))}
                  {clientBoard.inProcess.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
              <div>
                <div className="subtle mb-1">Done</div>
                <div className="space-y-2">
                  {clientBoard.done.map(it => (
                    <div key={it.projectId} className="border rounded p-2 text-sm">
                      <div className="font-medium truncate">{it.name}</div>
                      <div className="grid grid-cols-3 gap-1 mt-1">
                        {(it.uploads||[]).map((u,idx)=>(<img key={idx} src={`${API_BASE}${u}`} alt="upload" className="h-16 w-full object-cover rounded" />))}
                      </div>
                      {it.location && <div className="mt-1"><button className="btn btn-ghost btn-xs" onClick={()=>{ setLocView(it.location); setLocOpen(true) }}>View location</button></div>}
                    </div>
                  ))}
                  {clientBoard.done.length===0 && <div className="subtle">No items</div>}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="mb-4 border rounded p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-2">
              <span className="subtle">Type</span>
              <select className="input" value={cat} onChange={e=>{ setCat(e.target.value); setArchSub(''); setArchTier(''); setEngType(''); setEngSubtype('') }}>
                <option value="">All</option>
                <option value="architecture">Architecture</option>
                <option value="engineering">Engineering</option>
              </select>
            </label>
            {cat==='architecture' && (
              <>
                <label className="inline-flex items-center gap-2">
                  <span className="subtle">Sub</span>
                  <select className="input" value={archSub} onChange={e=>setArchSub(e.target.value)}>
                    <option value="">Any</option>
                    <option value="Exterior design">Exterior design</option>
                    <option value="Interior design">Interior design</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2">
                  <span className="subtle">Tier</span>
                  <select className="input" value={archTier} onChange={e=>setArchTier(e.target.value)}>
                    <option value="">Any</option>
                    <option value="regular">Regular</option>
                    <option value="luxuries">Luxury</option>
                    <option value="normal">Normal</option>
                  </select>
                </label>
              </>
            )}
            {cat==='engineering' && (
              <>
                <label className="inline-flex items-center gap-2">
                  <span className="subtle">Design</span>
                  <select className="input" value={engType} onChange={e=>setEngType(e.target.value)}>
                    <option value="">Any</option>
                    <option value="complete house design">Complete house design</option>
                    <option value="partial house design">Partial house design</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2">
                  <span className="subtle">Building</span>
                  <select className="input" value={engSubtype} onChange={e=>setEngSubtype(e.target.value)}>
                    <option value="">Any</option>
                    <option value="one storied building">One storied building</option>
                    <option value="duplex/triplex">Duplex/Triplex</option>
                    <option value="multi storied building">Multi storied building</option>
                  </select>
                </label>
              </>
            )}
            <div className="ml-auto">
              <button type="button" className="btn btn-primary" disabled={feedLoading} onClick={load}>{feedLoading? 'Loading...' : 'Apply'}</button>
            </div>
          </div>
        </div>
        {feedMsg && <div className="text-sm text-red-600 mb-2">{feedMsg}</div>}
        <div className="space-y-3">
          {projects.map(p => (
            <div key={p._id} className="border rounded p-3 space-y-2">
              <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
                <span className="font-medium flex items-center gap-1">{p.authorUsername}{projVerifiedMap[p.authorUsername] && <span title="Verified" className="text-green-600">✔︎</span>}</span>
                <span>•</span>
                <span className="capitalize">{p.category}</span>
                {p.subcategory && <><span>•</span><span>{p.subcategory}</span></>}
                {p.tier && <><span>•</span><span className="capitalize">{p.tier}</span></>}
                {p.projectType && <><span>•</span><span>{p.projectType}</span></>}
                <span className="ml-auto" />
                {acceptedIds.has(String(p._id)) && (
                  <button className="btn btn-ghost relative" title="Open chat" onClick={()=>{ setChatProjectId(p._id); setLastSeen(prev=>({ ...prev, [String(p._id)]: new Date().toISOString() })) }}>
                    💬 Message
                    {(() => {
                      const pid = String(p._id)
                      const serverTs = lastServer[pid]
                      const seenTs = lastSeen[pid]
                      if (serverTs && (!seenTs || new Date(serverTs) > new Date(seenTs))) {
                        return <span className="absolute -top-1 -right-1 inline-flex h-2 w-2 rounded-full bg-red-600" />
                      }
                      return null
                    })()}
                  </button>
                )}
              </div>
              {p.biddingDeadline && (
                <div className="text-xs text-gray-600">Bidding deadline: {new Date(p.biddingDeadline).toLocaleString()}</div>
              )}
              <div className="flex items-center gap-2">
                {acceptedIds.has(String(p._id)) && (
                  <span className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">✔︎ Accepted</span>
                )}
                {p.biddingDeadline && Date.parse(p.biddingDeadline) < Date.now() && (
                  <span className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 border">Expired</span>
                )}
              </div>
              {p.description && <div>{p.description}</div>}
              {p.imageUrl && <img src={`${API_BASE}${p.imageUrl}`} alt="project" className="max-h-64 rounded" />}
              {p.location && (
                <div>
                  <button className="btn btn-ghost" onClick={()=>{ setLocView(p.location); setLocOpen(true) }}>View location</button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  {me?.role==='provider' && !(p.biddingDeadline && Date.parse(p.biddingDeadline) < Date.now()) && <BidBox projectId={p._id} />}
                </div>
                <div>
                  <BidsModal project={p} onOpenChat={(pid)=>setChatProjectId(pid)} onAccepted={()=>{ fetchAcceptedIds(); load(); }} />
                </div>
              </div>
            </div>
          ))}
          {projects.length===0 && <div className="subtle">No projects yet.</div>}
        </div>
        {chatProjectId && <ChatDrawer projectId={chatProjectId} onClose={()=>setChatProjectId(null)} />}
        {locOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setLocOpen(false)} />
            <div className="w-full max-w-lg h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Project location</div>
                <button className="btn btn-ghost" onClick={()=>setLocOpen(false)}>Close</button>
              </div>
              <div className="space-y-3">
                <MapPicker readOnly value={locView} height={360} />
                {locView && <div className="text-xs text-gray-700">Lat {Number(locView.lat).toFixed(6)}, Lng {Number(locView.lng).toFixed(6)}</div>}
              </div>
            </div>
          </div>
        )}
        {expectedModal.open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30" onClick={()=>setExpectedModal({ open:false, projectId:null, value:'' })} />
            <div className="w-full max-w-sm h-full bg-white card p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Set expected deadline</div>
                <button className="btn btn-ghost" onClick={()=>setExpectedModal({ open:false, projectId:null, value:'' })}>Close</button>
              </div>
              <div className="space-y-3">
                <input type="datetime-local" className="input w-full" value={expectedModal.value} onChange={e=>setExpectedModal(s=>({ ...s, value: e.target.value }))} />
                {expectedMsg && <div className="text-sm text-red-600">{expectedMsg}</div>}
                <div className="flex gap-2 justify-end">
                  <button className="btn btn-ghost" onClick={()=>setExpectedModal({ open:false, projectId:null, value:'' })}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveExpected} disabled={!expectedModal.value}>Save</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <ErrorBoundary>
    <div className="relative min-h-screen">
      {/* Full-screen animated background */}
      <div className="fixed inset-0 -z-10">
        <LightPillar
          topColor="#5227FF"
          bottomColor="#FF9FFC"
          intensity={1.0}
          rotationSpeed={0.3}
          glowAmount={0.005}
          pillarWidth={3.0}
          pillarHeight={0.4}
          noiseIntensity={0.5}
          pillarRotation={0}
          interactive={false}
          mixBlendMode="normal"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/50 to-white/80" />
      </div>

      <header className="mx-auto max-w-5xl px-4 pt-8 pb-4 flex items-center gap-4">
        <div className="flex items-center gap-3">
          {isAuthed && me && (me.role === 'client' || me.role === 'provider' || me.role === 'admin') && (
            <>
              <button className={`btn ${activeTab==='feed' ? 'btn-primary' : 'btn-ghost'}`} onClick={()=>setActiveTab('feed')}>Feed</button>
              <button className={`btn ${activeTab==='projects' ? 'btn-primary' : 'btn-ghost'}`} onClick={()=>setActiveTab('projects')}>Projects</button>
            </>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">ArcEngg</h1>
          <p className="subtle mt-1">Choose a role to continue</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isAuthed && (
            <span className="text-xs rounded-full px-2 py-1 bg-gray-100 text-gray-700 border">
              Signed in{(me?.username||sessionUser?.username) ? ` as ${me?.username||sessionUser?.username}` : ''}
              {me?.role && ` (${me.role})`}
            </span>
          )}
          {isAuthed && me && me.role === 'admin' && (<><AdminVerificationButton /><AdminSuspensionsButton /></>)}
          {isAuthed && me && me.role === 'admin' && (
            <button className="btn btn-ghost" onClick={logout}>Log out</button>
          )}
          {isAuthed && me && me.role === 'client' && <ProjectRequestDrawer />}
          {isAuthed && me && (me.role === 'client' || me.role === 'provider') && <UserSearchButton me={me} token={token} />}
          {isAuthed && me && me.role === 'provider' && <AcceptedBidsButton />}
          {isAuthed && me && (me.role === 'client' || me.role === 'provider') && (
            <>
              <CalendarConnectButton apiBase={API_BASE} token={token} />
              <ProfilePanel />
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 space-y-6">
        {runtimeError && (
          <div className="card p-3 text-xs text-red-700 bg-red-50 border border-red-200">
            <div className="font-semibold">Runtime error</div>
            <div className="whitespace-pre-wrap break-all">{runtimeError}</div>
          </div>
        )}
        {!isAuthed && <RoleSelector selected={selected} onSelect={setSelected} />}

        {!isAuthed && selected === 'Admin' && (
          <AdminLogin onAuth={handleAuth} />
        )}
        {!isAuthed && selected === 'Client' && (
          <UserAuth roleKey="client" onAuth={handleAuth} />
        )}
        {!isAuthed && selected === 'Service provider' && (
          <UserAuth roleKey="provider" onAuth={handleAuth} />
        )}

        {isAuthed && me && me.role === 'provider' && activeTab !== 'projects' && (
          <ProviderPanel />
        )}
        {isAuthed && me && me.role === 'admin' && activeTab !== 'projects' && (
          <AdminPanel />
        )}

        {isAuthed && !me && (
          <div className="card p-6 subtle">Loading your profile...</div>
        )}

        {isAuthed && me && (
          activeTab==='projects' ? <ProjectsFeedPanel reloadKey={projectsReloadKey} /> : <FeedPanel />
        )}
      </main>
      <AssistantWidget />
    </div>
    </ErrorBoundary>
  )
}

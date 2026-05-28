import { useState } from 'react'

const newId = () => crypto.randomUUID()

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AuthScreen({ settings, onLogin, onSettingsChange }) {
  const profiles = settings.profiles || []
  const [view, setView] = useState(profiles.length > 0 ? 'list' : 'form')
  const [editProfile, setEditProfile] = useState(null)
  const [connectingId, setConnectingId] = useState(null)
  const [connectError, setConnectError] = useState(null)

  const saveProfiles = async (updated) => {
    const next = { ...settings, profiles: updated }
    await onSettingsChange(next)
  }

  const handleConnect = async (profile) => {
    setConnectingId(profile.id)
    setConnectError(null)
    try {
      const tokens = await window.electronAPI.getToken({
        clientId: profile.clientId,
        clientSecret: profile.clientSecret
      })
      onLogin(profile.clientId, profile.clientSecret, profile.orgId || null, profile.companyId || null, tokens)
    } catch (err) {
      setConnectError(err.message)
    } finally {
      setConnectingId(null)
    }
  }

  const handleSaveProfile = async (data) => {
    let updated
    if (data.id) {
      updated = profiles.map(p => p.id === data.id ? data : p)
    } else {
      updated = [...profiles, { ...data, id: newId() }]
    }
    await saveProfiles(updated)
    setEditProfile(null)
    setView('list')
  }

  const handleDelete = async (id) => {
    await saveProfiles(profiles.filter(p => p.id !== id))
    if (profiles.length === 1) setView('form')
  }

  const handleImport = async () => {
    try {
      const raw = await window.electronAPI.openFile()
      if (!raw) return
      const imported = JSON.parse(raw)
      if (!Array.isArray(imported)) { alert('JSON must be an array of credential objects.'); return }
      const incoming = imported.map(p => ({
        id: newId(),
        name: p.name || 'Imported',
        clientId: p.clientId || p.client_id || '',
        clientSecret: p.clientSecret || p.client_secret || '',
        orgId: p.orgId || p.org_id || '',
        companyId: p.companyId || p.company_id || ''
      }))
      // Merge: update by name if exists, otherwise append
      const byName = Object.fromEntries(profiles.map(p => [p.name, p]))
      const merged = [...profiles]
      for (const inc of incoming) {
        const existing = byName[inc.name]
        if (existing) {
          const idx = merged.findIndex(p => p.id === existing.id)
          merged[idx] = { ...inc, id: existing.id }
        } else {
          merged.push(inc)
        }
      }
      await saveProfiles(merged)
      setView('list')
    } catch (e) {
      alert('Failed to import: ' + e.message)
    }
  }

  if (view === 'manual') {
    return (
      <ManualForm
        onLogin={onLogin}
        onBack={() => setView(profiles.length > 0 ? 'list' : 'form')}
      />
    )
  }

  if (view === 'form') {
    return (
      <ProfileForm
        profile={editProfile}
        hasProfiles={profiles.length > 0}
        onSave={handleSaveProfile}
        onCancel={() => {
          setEditProfile(null)
          setView(profiles.length > 0 ? 'list' : 'manual')
        }}
      />
    )
  }

  // list view
  return (
    <div className="auth-screen">
      <div className="auth-card auth-card-wide">
        <div className="auth-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#1473E6"/>
            <path d="M27 12L36 36H30L27.5 29H20.5L18 36H12L21 12H27ZM24 18L21.5 26H26.5L24 18Z" fill="white"/>
          </svg>
        </div>
        <h1>Relay</h1>
        <p className="auth-subtitle">a container utility for Adobe Tags</p>

        <div className="profile-list-header">
          <span className="profile-list-label">Saved Organizations</span>
          <div className="profile-list-actions">
            <button className="btn-ghost btn-sm" onClick={handleImport}>Import JSON</button>
            <button className="btn-primary btn-sm" onClick={() => { setEditProfile(null); setView('form') }}>+ Add</button>
          </div>
        </div>

        <div className="profile-list">
          {profiles.map(profile => (
            <div key={profile.id} className="profile-card">
              <div className="profile-card-info">
                <div className="profile-card-name">{profile.name}</div>
                <div className="profile-card-org">{profile.orgId || <em className="muted">no org ID</em>}</div>
              </div>
              <div className="profile-card-btns">
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => { setEditProfile(profile); setView('form') }}
                >Edit</button>
                <button
                  className="btn-ghost btn-sm btn-danger-ghost"
                  onClick={() => handleDelete(profile.id)}
                >Delete</button>
                <button
                  className="btn-primary btn-sm"
                  disabled={connectingId === profile.id}
                  onClick={() => handleConnect(profile)}
                >
                  {connectingId === profile.id ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {connectError && <div className="auth-error">{connectError}</div>}

        <button className="btn-link" onClick={() => setView('manual')}>
          Connect manually →
        </button>
      </div>
    </div>
  )
}

// ── Profile add / edit form ───────────────────────────────────────────────────

function ProfileForm({ profile, hasProfiles, onSave, onCancel }) {
  const [name, setName]             = useState(profile?.name || '')
  const [clientId, setClientId]     = useState(profile?.clientId || '')
  const [clientSecret, setSecret]   = useState(profile?.clientSecret || '')
  const [orgId, setOrgId]           = useState(profile?.orgId || '')
  const [companyId, setCompanyId]   = useState(profile?.companyId || '')
  const [error, setError]           = useState(null)

  const handleSave = () => {
    if (!name.trim())         { setError('Please enter a profile name'); return }
    if (!clientId.trim())     { setError('Please enter a Client ID'); return }
    if (!clientSecret.trim()) { setError('Please enter a Client Secret'); return }
    if (!orgId.trim())        { setError('Please enter an Organization ID'); return }
    setError(null)
    onSave({
      id: profile?.id || null,
      name: name.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      orgId: orgId.trim(),
      companyId: companyId.trim()
    })
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="form-back-row">
          <button className="btn-link" onClick={onCancel}>← Back</button>
          <h2 className="form-title">{profile ? 'Edit Organization' : 'Add Organization'}</h2>
        </div>

        <div className="field">
          <label htmlFor="pf-name">Profile Name</label>
          <input id="pf-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dentsu Global Partners" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="pf-cid">Client ID</label>
          <input id="pf-cid" type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
        </div>
        <div className="field">
          <label htmlFor="pf-sec">Client Secret</label>
          <input id="pf-sec" type="password" value={clientSecret} onChange={e => setSecret(e.target.value)} placeholder="p8e-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
        </div>
        <div className="field">
          <label htmlFor="pf-org">
            Organization ID
            <span className="field-hint"> — looks like <code>ABC123@AdobeOrg</code></span>
          </label>
          <input id="pf-org" type="text" value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="XXXXXXXXXXXXXXXXXXXXXXXXX@AdobeOrg" />
        </div>
        <div className="field">
          <label htmlFor="pf-co">
            Company ID
            <span className="field-hint"> — optional, looks like <code>CO1a2b3c…</code></span>
          </label>
          <input id="pf-co" type="text" value={companyId} onChange={e => setCompanyId(e.target.value)} placeholder="COxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="form-footer-row">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            {profile ? 'Save Changes' : 'Save Organization'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Manual one-off login (no profile saved) ───────────────────────────────────

function ManualForm({ onLogin, onBack }) {
  const [clientId, setClientId]   = useState('')
  const [clientSecret, setSecret] = useState('')
  const [orgId, setOrgId]         = useState('')
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)

  const handleConnect = async () => {
    if (!clientId.trim())     { setError('Please enter your Client ID'); return }
    if (!clientSecret.trim()) { setError('Please enter your Client Secret'); return }
    if (!orgId.trim())        { setError('Please enter your Organization ID'); return }
    setLoading(true); setError(null)
    try {
      const tokens = await window.electronAPI.getToken({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
      onLogin(clientId.trim(), clientSecret.trim(), orgId.trim() || null, companyId.trim() || null, tokens)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="form-back-row">
          <button className="btn-link" onClick={onBack}>← Saved organizations</button>
          <h2 className="form-title">Manual Login</h2>
        </div>

        <div className="field">
          <label htmlFor="m-cid">Client ID</label>
          <input id="m-cid" type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="m-sec">Client Secret</label>
          <input id="m-sec" type="password" value={clientSecret} onChange={e => setSecret(e.target.value)} placeholder="p8e-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
        </div>
        <div className="field">
          <label htmlFor="m-org">
            Organization ID
            <span className="field-hint"> — looks like <code>ABC123@AdobeOrg</code></span>
          </label>
          <input id="m-org" type="text" value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="XXXXXXXXXXXXXXXXXXXXXXXXX@AdobeOrg" />
        </div>
        <div className="field">
          <label htmlFor="m-co">
            Company ID
            <span className="field-hint"> — optional</span>
          </label>
          <input id="m-co" type="text" value={companyId} onChange={e => setCompanyId(e.target.value)} placeholder="COxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" onKeyDown={e => e.key === 'Enter' && handleConnect()} />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button className="btn-primary btn-full" onClick={handleConnect} disabled={loading}>
          {loading ? 'Connecting…' : 'Connect'}
        </button>

        <details className="setup-help">
          <summary>Where to find these credentials</summary>
          <ol>
            <li>Go to <strong>developer.adobe.com/console</strong></li>
            <li>Open your project → <strong>OAuth Server-to-Server</strong> credential</li>
            <li>Copy <strong>Client ID</strong>, <strong>Client Secret</strong>, and <strong>Organization ID</strong></li>
            <li>Make sure <strong>Experience Platform Launch API</strong> is added to the project</li>
          </ol>
        </details>
      </div>
    </div>
  )
}

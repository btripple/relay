import { useState, useEffect } from 'react'

const STATE_LABELS = {
  development: 'Development',
  submitted:   'Submitted',
  approved:    'Approved',
}

export default function LibraryModal({ client, destPropertyId, ruleIds, deIds, onClose }) {
  const [mode, setMode]               = useState('new')
  const [newName, setNewName]         = useState('')
  const [libraries, setLibraries]     = useState([])
  const [selectedId, setSelectedId]   = useState('')
  const [loadingLibs, setLoadingLibs] = useState(false)
  const [working, setWorking]         = useState(false)
  const [result, setResult]           = useState(null) // { success, libraryName, error }
  const [error, setError]             = useState(null)

  const totalItems = ruleIds.length + deIds.length

  useEffect(() => {
    if (!destPropertyId) {
      setError('No destination property selected')
      return
    }
    setLoadingLibs(true)
    client.getLibraries(destPropertyId)
      .then(libs => {
        setLibraries(libs)
        if (libs.length === 0) setMode('new')
        if (libs.length > 0) setSelectedId(libs[0].id)
      })
      .catch(err => setError(`Failed to load libraries: ${err.message}`))
      .finally(() => setLoadingLibs(false))
  }, [destPropertyId])

  const handleConfirm = async () => {
    setError(null)
    if (!destPropertyId) { setError('No destination property selected'); return }
    if (mode === 'new' && !newName.trim()) { setError('Please enter a library name'); return }
    if (mode === 'existing' && !selectedId) { setError('Please select a library'); return }

    setWorking(true)
    try {
      let libraryId, libraryName
      if (mode === 'new') {
        const lib = await client.createLibrary(destPropertyId, newName.trim())
        libraryId = lib.id
        libraryName = newName.trim()
      } else {
        libraryId = selectedId
        libraryName = libraries.find(l => l.id === selectedId)?.attributes.name || selectedId
      }
      await client.addToLibrary(libraryId, ruleIds, deIds)
      setResult({ success: true, libraryName })
    } catch (err) {
      setResult({ success: false, error: err.message })
    } finally {
      setWorking(false)
    }
  }

  if (result) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal library-modal">
          <div className="modal-header">
            <h2>{result.success ? 'Added to Library' : 'Failed'}</h2>
          </div>
          <div className="library-result">
            {result.success ? (
              <>
                <div className="library-result-icon library-result-ok">✓</div>
                <div>
                  <strong>{totalItems} item{totalItems !== 1 ? 's' : ''}</strong> added to library
                  <div className="library-result-name">"{result.libraryName}"</div>
                  <p className="library-result-hint">You can now build and publish this library from the Adobe Tags UI.</p>
                </div>
              </>
            ) : (
              <>
                <div className="library-result-icon library-result-err">✗</div>
                <div className="auth-error" style={{ margin: 0 }}>{result.error}</div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !working && onClose()}>
      <div className="modal library-modal">
        <div className="modal-header">
          <h2>Add to Library</h2>
          <div className="library-item-count">
            {ruleIds.length > 0 && <span className="tag tag-success">{ruleIds.length} rule{ruleIds.length !== 1 ? 's' : ''}</span>}
            {deIds.length  > 0 && <span className="tag tag-success">{deIds.length} data element{deIds.length !== 1 ? 's' : ''}</span>}
          </div>
        </div>

        <div className="library-modal-body">
          <div className="library-mode-toggle">
            <label className={`library-mode-option ${mode === 'new' ? 'active' : ''}`}>
              <input type="radio" name="lib-mode" value="new" checked={mode === 'new'} onChange={() => setMode('new')} />
              Create new library
            </label>
            <label className={`library-mode-option ${mode === 'existing' ? 'active' : ''} ${libraries.length === 0 ? 'disabled' : ''}`}>
              <input type="radio" name="lib-mode" value="existing" checked={mode === 'existing'} onChange={() => setMode('existing')} disabled={libraries.length === 0} />
              Add to existing library
              {loadingLibs && <span className="library-loading-hint"> (loading…)</span>}
              {!loadingLibs && libraries.length === 0 && <span className="library-loading-hint"> (none available)</span>}
            </label>
          </div>

          {mode === 'new' && (
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="lib-name">Library name</label>
              <input
                id="lib-name"
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Sprint 12 — Homepage updates"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              />
            </div>
          )}

          {mode === 'existing' && libraries.length > 0 && (
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="lib-select">Select library</label>
              <select
                id="lib-select"
                className="lib-select"
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
              >
                {libraries.map(lib => (
                  <option key={lib.id} value={lib.id}>
                    {lib.attributes.name} — {STATE_LABELS[lib.attributes.state] || lib.attributes.state}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={working}>Cancel</button>
          <button className="btn-primary" onClick={handleConfirm} disabled={working}>
            {working ? 'Working…' : mode === 'new' ? 'Create & Add' : 'Add to Library'}
          </button>
        </div>
      </div>
    </div>
  )
}

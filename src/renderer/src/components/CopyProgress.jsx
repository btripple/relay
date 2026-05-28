export default function CopyProgress({ status, log, hasChanges, onAddToLibrary, onClose }) {
  const counts = log.reduce((a, i) => ({ ...a, [i.type]: (a[i.type] || 0) + 1 }), {})

  const icons = { success: '✓', error: '✗', skipped: '–', warning: '⚠' }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && status !== 'running' && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>
            {status === 'running' ? 'Copying…'
              : status === 'done' ? 'Copy complete'
              : 'Copy finished with errors'}
          </h2>
        </div>

        {status !== 'running' && (
          <div className="progress-summary">
            {counts.success > 0 && <span className="tag tag-success">{counts.success} created/updated</span>}
            {counts.skipped > 0 && <span className="tag tag-skipped">{counts.skipped} skipped</span>}
            {counts.error > 0 && <span className="tag tag-error">{counts.error} failed</span>}
            {counts.warning > 0 && <span className="tag tag-warning">{counts.warning} warnings</span>}
          </div>
        )}

        <div className="progress-log">
          {log.map((item, i) => (
            <div key={i} className={`log-item log-${item.type}`}>
              <span className="log-icon">{icons[item.type] || '·'}</span>
              <span>{item.message}</span>
            </div>
          ))}
          {status === 'running' && (
            <div className="log-item log-running">
              <span className="spinner" />
              <span>Working…</span>
            </div>
          )}
        </div>

        {status !== 'running' && (
          <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {status === 'done' && hasChanges && (
                <button className="btn-compare" onClick={onAddToLibrary}>
                  Add to Library…
                </button>
              )}
            </div>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

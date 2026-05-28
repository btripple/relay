export default function ImportModal({ exportData, destProperty, onConfirm, onClose }) {
  const { rules = [], dataElements = [], sourceProperty, exportedAt, extensions = [] } = exportData

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal import-modal">
        <div className="modal-header">
          <h2>Import Container</h2>
        </div>
        <div className="import-preview">
          <div className="import-meta">
            {sourceProperty?.name && (
              <div className="import-meta-row">
                <span className="import-meta-label">Source</span>
                <span className="import-meta-value">{sourceProperty.name}</span>
              </div>
            )}
            {exportedAt && (
              <div className="import-meta-row">
                <span className="import-meta-label">Exported</span>
                <span className="import-meta-value">{new Date(exportedAt).toLocaleString()}</span>
              </div>
            )}
            <div className="import-meta-row">
              <span className="import-meta-label">Destination</span>
              <span className="import-meta-value">{destProperty.attributes.name}</span>
            </div>
          </div>

          <div className="import-counts">
            <div className="import-count-card">
              <span className="import-count-number">{rules.length}</span>
              <span className="import-count-label">Rule{rules.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="import-count-card">
              <span className="import-count-number">{dataElements.length}</span>
              <span className="import-count-label">Data Element{dataElements.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="import-count-card">
              <span className="import-count-number">{extensions.length}</span>
              <span className="import-count-label">Extension{extensions.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <p className="import-hint">
            Extensions must already be installed in the destination property. If a required
            extension is missing, affected rules and data elements will fail to import.
          </p>
        </div>
        <div className="modal-footer import-modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <div className="import-confirm-btns">
            <button className="btn-compare" onClick={() => onConfirm(false)}>Import (skip existing)</button>
            <button className="btn-primary" onClick={() => onConfirm(true)}>Import (overwrite existing)</button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import PropertyList from './PropertyList'

export default function CopyPanel({
  client, companyId, sourcePropertyId,
  destProperty, onDestSelect,
  selectedRuleCount, selectedDECount,
  onCopy, onCompare, comparing,
  favorites, onToggleFavorite,
  onSetRuleNames
}) {
  const [mode, setMode] = useState('skip')
  const [copying, setCopying] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const selectionCount = selectedRuleCount + selectedDECount
  const busy = copying || comparing
  const canCopy = destProperty && selectionCount > 0 && !busy
  const canCompare = destProperty && !busy

  const handleCopy = async () => {
    setConfirming(false)
    setCopying(true)
    try { await onCopy(mode) }
    finally { setCopying(false) }
  }

  const MODE_LABELS = {
    skip:      'skip existing rules',
    overwrite: 'overwrite existing rules',
    merge:     'merge Adobe actions into existing rules',
  }

  return (
    <div className="copy-panel">
      <div className="copy-panel-list">
        <PropertyList
          client={client}
          companyId={companyId}
          selected={destProperty}
          onSelect={onDestSelect}
          exclude={sourcePropertyId ? [sourcePropertyId] : []}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
        />
      </div>

      <div className="copy-controls">
        <div className="selection-summary">
          {selectionCount === 0 ? (
            <span className="muted">No assets selected</span>
          ) : (
            <>
              {selectedRuleCount > 0 && (
                <span>{selectedRuleCount} rule{selectedRuleCount !== 1 ? 's' : ''}</span>
              )}
              {selectedRuleCount > 0 && selectedDECount > 0 && <span className="sep"> + </span>}
              {selectedDECount > 0 && (
                <span>{selectedDECount} data element{selectedDECount !== 1 ? 's' : ''}</span>
              )}
            </>
          )}
        </div>

        <div className="copy-mode-group">
          <span className="copy-mode-label">If rule exists in destination:</span>
          {[
            { value: 'skip',      label: 'Skip' },
            { value: 'overwrite', label: 'Overwrite' },
            { value: 'merge',     label: 'Merge Adobe actions' },
          ].map(opt => (
            <label key={opt.value} className={`copy-mode-option ${mode === opt.value ? 'active' : ''}`}>
              <input
                type="radio"
                name="copy-mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {!destProperty && (
          <p className="copy-hint muted">Select a destination property above</p>
        )}

        <button
          className="btn-compare"
          disabled={!canCompare}
          onClick={onCompare}
        >
          {comparing ? 'Comparing…' : 'Compare properties'}
        </button>

        <button
          className="btn-secondary"
          disabled={!sourcePropertyId}
          onClick={onSetRuleNames}
          title="Inject rule name into link-tracking rules"
        >
          Set Rule Names…
        </button>

        {confirming ? (
          <div className="copy-confirm">
            <div className="copy-confirm-icon">⚠</div>
            <div className="copy-confirm-body">
              <strong>Apply changes immediately?</strong>
              <p>
                {selectedRuleCount > 0 && <>{selectedRuleCount} rule{selectedRuleCount !== 1 ? 's' : ''}</>}
                {selectedRuleCount > 0 && selectedDECount > 0 && ' and '}
                {selectedDECount > 0 && <>{selectedDECount} data element{selectedDECount !== 1 ? 's' : ''}</>}
                {' '}will be copied to <strong>{destProperty?.attributes.name}</strong>.
                Conflicting rules will be set to <strong>{MODE_LABELS[mode]}</strong>.
                This cannot be undone from within Relay.
              </p>
            </div>
            <div className="copy-confirm-actions">
              <button className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn-danger btn-sm" onClick={handleCopy}>Yes, copy now</button>
            </div>
          </div>
        ) : (
          <button
            className="btn-copy"
            disabled={!canCopy}
            onClick={() => setConfirming(true)}
          >
            {copying
              ? 'Copying…'
              : destProperty
                ? `Copy to "${destProperty.attributes.name}"`
                : 'Copy selected assets'}
          </button>
        )}
      </div>
    </div>
  )
}

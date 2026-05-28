import { useState } from 'react'
import PropertyList from './PropertyList'

export default function CopyPanel({
  client, companyId, sourcePropertyId,
  destProperty, onDestSelect,
  selectedRuleCount, selectedDECount,
  onCopy, onCompare, comparing,
  favorites, onToggleFavorite
}) {
  const [overwrite, setOverwrite] = useState(false)
  const [copying, setCopying] = useState(false)

  const selectionCount = selectedRuleCount + selectedDECount
  const busy = copying || comparing
  const canCopy = destProperty && selectionCount > 0 && !busy
  const canCompare = destProperty && !busy

  const handleCopy = async () => {
    setCopying(true)
    try { await onCopy(overwrite) }
    finally { setCopying(false) }
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

        <label className="toggle-label">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={e => setOverwrite(e.target.checked)}
          />
          Overwrite existing assets
        </label>

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
          className="btn-copy"
          disabled={!canCopy}
          onClick={handleCopy}
        >
          {copying
            ? 'Copying…'
            : destProperty
              ? `Copy to "${destProperty.attributes.name}"`
              : 'Copy selected assets'}
        </button>
      </div>
    </div>
  )
}

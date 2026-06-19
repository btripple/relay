import { useState, useEffect } from 'react'

export default function CompareModal({ status, result, error, sourceProperty, destProperty, onClose, onApply }) {
  const [selected, setSelected] = useState(new Set())
  const [confirming, setConfirming] = useState(false)

  // Auto-select all missing items when result arrives
  useEffect(() => {
    if (!result) return
    const ids = new Set()
    result.rules.missingFromDest.forEach(r => ids.add(r.id))
    result.dataElements.missingFromDest.forEach(de => ids.add(de.id))
    setSelected(ids)
  }, [result])

  const toggleItem = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleGroup = (items, checked) => setSelected(prev => {
    const next = new Set(prev)
    items.forEach(i => checked ? next.add(i.id) : next.delete(i.id))
    return next
  })

  const handleApply = () => {
    setConfirming(false)
    const allRules = [...result.rules.missingFromDest, ...result.rules.matched]
    const allDEs   = [...result.dataElements.missingFromDest, ...result.dataElements.matched]
    onApply(
      allRules.filter(r => selected.has(r.id)),
      allDEs.filter(de => selected.has(de.id))
    )
  }

  const confirmCounts = result ? (() => {
    const adding     = result.rules.missingFromDest.filter(r  => selected.has(r.id)).length
                     + result.dataElements.missingFromDest.filter(de => selected.has(de.id)).length
    const overwriting = result.rules.matched.filter(r  => selected.has(r.id)).length
                      + result.dataElements.matched.filter(de => selected.has(de.id)).length
    return { adding, overwriting }
  })() : null

  const totalMissing = result ? result.rules.missingFromDest.length + result.dataElements.missingFromDest.length : 0
  const totalExtra   = result ? result.rules.extraInDest.length    + result.dataElements.extraInDest.length    : 0
  const totalMatched = result ? result.rules.matched.length        + result.dataElements.matched.length        : 0

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && status !== 'loading' && onClose()}>
      <div className="modal modal-compare">
        <div className="modal-header">
          <h2>Compare Properties</h2>
          {sourceProperty && destProperty && (
            <div className="compare-props">
              <span className="compare-prop-name">{sourceProperty.attributes.name}</span>
              <span className="compare-arrow"> → </span>
              <span className="compare-prop-name">{destProperty.attributes.name}</span>
            </div>
          )}
        </div>

        {status === 'loading' && (
          <div className="compare-loading">
            <span className="spinner" />
            <span>Comparing properties…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="compare-loading compare-error">{error}</div>
        )}

        {status === 'done' && result && (
          <>
            <div className="progress-summary">
              {totalMissing > 0 && <span className="tag tag-error">{totalMissing} missing from destination</span>}
              {totalExtra   > 0 && <span className="tag tag-warning">{totalExtra} only in destination</span>}
              {totalMatched > 0 && <span className="tag tag-success">{totalMatched} matched</span>}
              {totalMissing === 0 && totalExtra === 0 && <span className="tag tag-success">Properties match perfectly</span>}
            </div>

            <div className="compare-body">
              <CompareSection
                title="Rules"
                data={result.rules}
                selected={selected}
                onToggle={toggleItem}
                onToggleGroup={toggleGroup}
              />
              <CompareSection
                title="Data Elements"
                data={result.dataElements}
                selected={selected}
                onToggle={toggleItem}
                onToggleGroup={toggleGroup}
              />
            </div>
          </>
        )}

        {status !== 'loading' && (
          <div className="modal-footer compare-footer">
            {confirming && confirmCounts ? (
              <div className="copy-confirm copy-confirm-wide">
                <div className="copy-confirm-icon">⚠</div>
                <div className="copy-confirm-body">
                  <strong>Apply changes immediately?</strong>
                  <p>
                    {confirmCounts.adding > 0 && <>{confirmCounts.adding} item{confirmCounts.adding !== 1 ? 's' : ''} will be <strong>added</strong></>}
                    {confirmCounts.adding > 0 && confirmCounts.overwriting > 0 && ', '}
                    {confirmCounts.overwriting > 0 && <>{confirmCounts.overwriting} item{confirmCounts.overwriting !== 1 ? 's' : ''} will be <strong>overwritten</strong></>}
                    {' '}in <strong>{destProperty?.attributes.name}</strong>.
                    This cannot be undone from within Relay.
                  </p>
                </div>
                <div className="copy-confirm-actions">
                  <button className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
                  <button className="btn-danger btn-sm" onClick={handleApply}>Yes, apply now</button>
                </div>
              </div>
            ) : (
              <>
                <span className="compare-apply-count">
                  {selected.size > 0 ? `${selected.size} item${selected.size !== 1 ? 's' : ''} selected` : ''}
                </span>
                <div className="compare-footer-btns">
                  <button className="btn-ghost" onClick={onClose}>Close</button>
                  {status === 'done' && result && (
                    <button className="btn-primary" disabled={selected.size === 0} onClick={() => setConfirming(true)}>
                      Apply {selected.size > 0 ? `${selected.size} change${selected.size !== 1 ? 's' : ''}` : 'changes'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CompareSection({ title, data, selected, onToggle, onToggleGroup }) {
  const total = data.missingFromDest.length + data.extraInDest.length + data.matched.length
  return (
    <div className="compare-section">
      <div className="compare-section-title">{title}</div>
      {total === 0 && <div className="compare-empty">No {title.toLowerCase()} in either property</div>}
      {data.missingFromDest.length > 0 && (
        <SelectableGroup
          label="Missing from destination"
          sublabel="will be added"
          items={data.missingFromDest}
          type="missing"
          icon="✗"
          selected={selected}
          onToggle={onToggle}
          onToggleGroup={onToggleGroup}
        />
      )}
      {data.extraInDest.length > 0 && (
        <ReadonlyGroup
          label="Only in destination"
          items={data.extraInDest}
          type="extra"
          icon="○"
        />
      )}
      {data.matched.length > 0 && (
        <SelectableGroup
          label="Matched"
          sublabel="select to overwrite"
          items={data.matched}
          type="matched"
          icon="✓"
          selected={selected}
          onToggle={onToggle}
          onToggleGroup={onToggleGroup}
        />
      )}
    </div>
  )
}

function SelectableGroup({ label, sublabel, items, type, icon, selected, onToggle, onToggleGroup }) {
  const allChecked  = items.length > 0 && items.every(i => selected.has(i.id))
  const someChecked = items.some(i => selected.has(i.id))
  return (
    <div className={`compare-group compare-group-${type}`}>
      <div className="compare-group-header">
        <input
          type="checkbox"
          className="compare-checkbox"
          checked={allChecked}
          ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
          onChange={e => onToggleGroup(items, e.target.checked)}
        />
        <span className={`compare-icon compare-icon-${type}`}>{icon}</span>
        <span className="compare-group-label">{label}</span>
        {sublabel && <span className="compare-sublabel">{sublabel}</span>}
        <span className={`tag tag-compare-${type}`}>{items.length}</span>
      </div>
      <ul className="compare-list">
        {items.map(item => (
          <li key={item.id} className="compare-list-item compare-list-selectable" onClick={() => onToggle(item.id)}>
            <input
              type="checkbox"
              className="compare-checkbox"
              checked={selected.has(item.id)}
              onChange={() => onToggle(item.id)}
              onClick={e => e.stopPropagation()}
            />
            <span>{item.attributes.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReadonlyGroup({ label, items, type, icon }) {
  return (
    <div className={`compare-group compare-group-${type}`}>
      <div className="compare-group-header">
        <span className={`compare-icon compare-icon-${type}`}>{icon}</span>
        <span className="compare-group-label">{label}</span>
        <span className={`tag tag-compare-${type}`}>{items.length}</span>
      </div>
      <ul className="compare-list">
        {items.map(item => (
          <li key={item.id} className="compare-list-item">{item.attributes.name}</li>
        ))}
      </ul>
    </div>
  )
}

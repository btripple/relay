import { useState, useMemo, useEffect } from 'react'

export default function ImportModal({ exportData, destProperty, client, onConfirm, onClose }) {
  const { rules = [], dataElements = [], sourceProperty, exportedAt, extensions: srcExts = [] } = exportData

  const [selectedRuleIds, setSelectedRuleIds] = useState(() => new Set(rules.map(r => r.id)))
  const [selectedDEIds,   setSelectedDEIds]   = useState(() => new Set(dataElements.map(de => de.id)))
  const [selectedExtIds,  setSelectedExtIds]  = useState(() => new Set())   // opt-in, nothing selected by default
  const [mode,       setMode]       = useState('skip')
  const [confirming, setConfirming] = useState(false)
  const [ruleFilter, setRuleFilter] = useState('')
  const [deFilter,   setDeFilter]   = useState('')

  // Preflight: fetch destination extensions for dependency checking + settings preview
  const [destExts,     setDestExts]     = useState(null)
  const [preflightErr, setPreflightErr] = useState(null)

  useEffect(() => {
    client.fetchExtensionsWithPackages(destProperty.id)
      .then(exts => setDestExts(exts))
      .catch(err => setPreflightErr(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Extension ID map — source ext ID → destination ext ID
  const extMap = useMemo(() => {
    if (!destExts) return null
    return client.buildExtensionMap(srcExts, destExts)
  }, [destExts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reactive dependency validation
  const validation = useMemo(() => {
    if (!extMap) return null
    const srcPkgMap = {}
    for (const ext of srcExts) { if (ext._packageName) srcPkgMap[ext._packageName] = ext }
    const missingByPkg = {}
    const flag = (pkg, id, isRule) => {
      const srcExt = srcPkgMap[pkg]
      if (!srcExt || extMap[srcExt.id]) return
      if (!missingByPkg[pkg]) missingByPkg[pkg] = { ruleIds: new Set(), deIds: new Set() }
      isRule ? missingByPkg[pkg].ruleIds.add(id) : missingByPkg[pkg].deIds.add(id)
    }
    for (const rule of rules) {
      if (!selectedRuleIds.has(rule.id)) continue
      for (const comp of (rule._components || [])) {
        const pkg = (comp.attributes?.delegate_descriptor_id || '').split('::')[0]
        if (pkg) flag(pkg, rule.id, true)
      }
    }
    for (const de of dataElements) {
      if (!selectedDEIds.has(de.id)) continue
      const pkg = (de.attributes?.delegate_descriptor_id || '').split('::')[0]
      if (pkg) flag(pkg, de.id, false)
    }
    const affectedRuleIds = new Set()
    const affectedDEIds   = new Set()
    for (const { ruleIds, deIds } of Object.values(missingByPkg)) {
      ruleIds.forEach(id => affectedRuleIds.add(id))
      deIds.forEach(id => affectedDEIds.add(id))
    }
    return { missingByPkg, affectedRuleIds, affectedDEIds, hasErrors: affectedRuleIds.size + affectedDEIds.size > 0 }
  }, [extMap, selectedRuleIds, selectedDEIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const affectedIds = useMemo(() => {
    if (!validation) return new Set()
    return new Set([...validation.affectedRuleIds, ...validation.affectedDEIds])
  }, [validation])

  const deselectAffected = () => {
    setSelectedRuleIds(prev => { const next = new Set(prev); validation.affectedRuleIds.forEach(id => next.delete(id)); return next })
    setSelectedDEIds(prev => { const next = new Set(prev); validation.affectedDEIds.forEach(id => next.delete(id)); return next })
  }

  // Filters
  const filteredRules = useMemo(() => {
    if (!ruleFilter) return rules
    const q = ruleFilter.toLowerCase()
    return rules.filter(r => r.attributes.name.toLowerCase().includes(q))
  }, [rules, ruleFilter])

  const filteredDEs = useMemo(() => {
    if (!deFilter) return dataElements
    const q = deFilter.toLowerCase()
    return dataElements.filter(de => de.attributes.name.toLowerCase().includes(q))
  }, [dataElements, deFilter])

  const toggleRule = id => setSelectedRuleIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const toggleDE   = id => setSelectedDEIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const toggleExt  = id => setSelectedExtIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const toggleAllRules = checked => setSelectedRuleIds(checked ? new Set(rules.map(r => r.id)) : new Set())
  const toggleAllDEs   = checked => setSelectedDEIds(checked ? new Set(dataElements.map(de => de.id)) : new Set())
  const toggleAllExts  = (checked, updatableIds) => setSelectedExtIds(checked ? new Set(updatableIds) : new Set())

  const totalSelected   = selectedRuleIds.size + selectedDEIds.size
  const stillChecking   = !destExts && !preflightErr
  const hasBlockingErrors = !!validation?.hasErrors
  const canImport       = (totalSelected > 0 || selectedExtIds.size > 0) && !stillChecking && !hasBlockingErrors

  const handleConfirm = () => onConfirm({ mode, selectedRuleIds, selectedDEIds, selectedExtIds })

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-import-v2">
        <div className="modal-header">
          <h2>Import Container</h2>
        </div>

        <div className="import-v2-body">
          {/* Meta */}
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

          {/* Dependency check status */}
          {stillChecking && (
            <div className="import-preflight-checking">
              <span className="spinner" />
              Checking dependencies…
            </div>
          )}
          {preflightErr && (
            <div className="import-preflight-warn">
              <span className="import-preflight-warn-icon">⚠</span>
              Could not verify dependencies: {preflightErr}. Proceed with caution.
            </div>
          )}
          {validation?.hasErrors && (
            <div className="import-preflight-errors">
              <div className="import-preflight-errors-header">
                <span className="import-preflight-err-icon">✗</span>
                <strong>Dependency issues — import blocked</strong>
              </div>
              <p className="import-preflight-errors-desc">
                The following extensions are required by selected items but are not installed
                in <strong>{destProperty.attributes.name}</strong>. Install them in Adobe Tags
                first, or deselect the affected items below.
              </p>
              <ul className="import-preflight-list">
                {Object.entries(validation.missingByPkg).map(([pkg, { ruleIds, deIds }]) => (
                  <li key={pkg} className="import-preflight-pkg-row">
                    <span className="import-preflight-pkg-name">{pkg}</span>
                    <span className="import-preflight-pkg-count">
                      {ruleIds.size > 0 && `${ruleIds.size} rule${ruleIds.size !== 1 ? 's' : ''}`}
                      {ruleIds.size > 0 && deIds.size > 0 && ', '}
                      {deIds.size > 0 && `${deIds.size} data element${deIds.size !== 1 ? 's' : ''}`}
                      {' '}affected
                    </span>
                  </li>
                ))}
              </ul>
              <button className="btn-ghost btn-sm import-preflight-deselect-btn" onClick={deselectAffected}>
                Deselect {affectedIds.size} affected item{affectedIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {/* Conflict mode */}
          <div className="copy-mode-group">
            <span className="copy-mode-label">If item exists in destination:</span>
            {[{ value: 'skip', label: 'Skip' }, { value: 'overwrite', label: 'Overwrite' }].map(opt => (
              <label key={opt.value} className={`copy-mode-option ${mode === opt.value ? 'active' : ''}`}>
                <input type="radio" name="import-mode" value={opt.value} checked={mode === opt.value} onChange={() => setMode(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>

          {/* Extensions — selectable like rules/DEs */}
          {srcExts.length > 0 && (
            <ExtensionSection
              srcExts={srcExts}
              destExts={destExts}
              extMap={extMap}
              selectedExtIds={selectedExtIds}
              onToggle={toggleExt}
              onToggleAll={toggleAllExts}
            />
          )}

          {/* Data Elements */}
          {dataElements.length > 0 && (
            <ImportSection
              title="Data Elements"
              items={dataElements}
              filtered={filteredDEs}
              selectedIds={selectedDEIds}
              affectedIds={affectedIds}
              filter={deFilter}
              onFilterChange={setDeFilter}
              onToggle={toggleDE}
              onToggleAll={toggleAllDEs}
            />
          )}

          {/* Rules */}
          {rules.length > 0 && (
            <ImportSection
              title="Rules"
              items={rules}
              filtered={filteredRules}
              selectedIds={selectedRuleIds}
              affectedIds={affectedIds}
              filter={ruleFilter}
              onFilterChange={setRuleFilter}
              onToggle={toggleRule}
              onToggleAll={toggleAllRules}
              showEnabled
            />
          )}
        </div>

        <div className="modal-footer compare-footer">
          {confirming ? (
            <div className="copy-confirm copy-confirm-wide">
              <div className="copy-confirm-icon">⚠</div>
              <div className="copy-confirm-body">
                <strong>Apply import immediately?</strong>
                <p>
                  {selectedDEIds.size > 0 && <>{selectedDEIds.size} data element{selectedDEIds.size !== 1 ? 's' : ''}</>}
                  {selectedDEIds.size > 0 && selectedRuleIds.size > 0 && ' and '}
                  {selectedRuleIds.size > 0 && <>{selectedRuleIds.size} rule{selectedRuleIds.size !== 1 ? 's' : ''}</>}
                  {selectedExtIds.size > 0 && ` (+ ${selectedExtIds.size} extension setting${selectedExtIds.size !== 1 ? 's' : ''})`}
                  {' '}will be imported into <strong>{destProperty.attributes.name}</strong>.
                  Existing items will be <strong>{mode === 'overwrite' ? 'overwritten' : 'skipped'}</strong>.
                  This cannot be undone from within Relay.
                </p>
              </div>
              <div className="copy-confirm-actions">
                <button className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
                <button className="btn-danger btn-sm" onClick={handleConfirm}>Yes, import now</button>
              </div>
            </div>
          ) : (
            <>
              <span className="compare-apply-count">
                {hasBlockingErrors
                  ? <span style={{ color: 'var(--danger)' }}>Resolve dependency issues to continue</span>
                  : stillChecking
                    ? <span style={{ color: 'var(--text-muted)' }}>Checking…</span>
                    : totalSelected > 0
                      ? `${totalSelected} item${totalSelected !== 1 ? 's' : ''} selected${selectedExtIds.size > 0 ? ` + ${selectedExtIds.size} ext setting${selectedExtIds.size !== 1 ? 's' : ''}` : ''}`
                      : selectedExtIds.size > 0
                        ? `${selectedExtIds.size} extension setting${selectedExtIds.size !== 1 ? 's' : ''} selected`
                        : 'Nothing selected'}
              </span>
              <div className="compare-footer-btns">
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn-primary" disabled={!canImport} onClick={() => setConfirming(true)}>
                  {totalSelected > 0
                    ? `Import ${totalSelected} item${totalSelected !== 1 ? 's' : ''}`
                    : selectedExtIds.size > 0
                      ? `Update ${selectedExtIds.size} extension setting${selectedExtIds.size !== 1 ? 's' : ''}`
                      : 'Import'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Extensions section ────────────────────────────────────────────────────────

function ExtensionSection({ srcExts, destExts, extMap, selectedExtIds, onToggle, onToggleAll }) {
  const updatableIds = srcExts
    .filter(e => extMap?.[e.id] && e.attributes?.settings)
    .map(e => e.id)

  const allChecked  = updatableIds.length > 0 && updatableIds.every(id => selectedExtIds.has(id))
  const someChecked = updatableIds.some(id => selectedExtIds.has(id))

  return (
    <div className="import-v2-section">
      <div className="import-v2-section-head">
        <label className="import-v2-select-all">
          <input
            type="checkbox"
            className="compare-checkbox"
            checked={allChecked}
            disabled={updatableIds.length === 0}
            ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
            onChange={e => onToggleAll(e.target.checked, updatableIds)}
          />
          <span className="import-v2-section-title">Extensions ({srcExts.length})</span>
        </label>
        <span className="import-v2-selected-badge">
          {selectedExtIds.size > 0
            ? `${selectedExtIds.size} setting${selectedExtIds.size !== 1 ? 's' : ''} selected`
            : destExts ? 'No settings selected' : ''}
        </span>
      </div>
      <div className="import-ext-rows">
        {srcExts.map(ext => {
          const destExtId = extMap?.[ext.id]
          const hasSettings = !!ext.attributes?.settings
          const canSelect   = !!destExtId && hasSettings
          let parsed = null
          if (hasSettings) { try { parsed = JSON.parse(ext.attributes.settings) } catch {} }
          return (
            <ExtRow
              key={ext.id}
              ext={ext}
              destExtId={destExtId}
              hasSettings={hasSettings}
              parsed={parsed}
              canSelect={canSelect}
              selected={selectedExtIds.has(ext.id)}
              loading={!destExts}
              onToggle={() => canSelect && onToggle(ext.id)}
            />
          )
        })}
      </div>
      {updatableIds.length > 0 && (
        <p className="import-hint" style={{ margin: '6px 12px 10px' }}>
          Selecting an extension will overwrite its settings in the destination. Extensions must already be installed.
        </p>
      )}
    </div>
  )
}

function ExtRow({ ext, destExtId, hasSettings, parsed, canSelect, selected, loading, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const pkg = ext._packageName || ext.id || '(unknown)'

  const isAA    = pkg.includes('adobe-analytics') && !pkg.includes('alloy')
  const isAlloy = pkg.includes('alloy') || pkg.includes('adobe-experience-platform-web-sdk')

  const formatted = ext.attributes?.settings
    ? (() => { try { return JSON.stringify(JSON.parse(ext.attributes.settings), null, 2) } catch { return ext.attributes.settings } })()
    : null

  const status = loading ? 'loading' : !destExtId ? 'missing' : !hasSettings ? 'no-settings' : 'available'

  const statusLabel = {
    loading:     'Checking…',
    missing:     'Not installed in destination',
    'no-settings': 'No settings in source',
    available:   'Settings available',
  }[status]

  return (
    <div className={`import-ext-row ${selected ? 'import-ext-row-selected' : ''}`}>
      <div className="import-ext-row-main">
        <input
          type="checkbox"
          className="compare-checkbox"
          checked={selected}
          disabled={!canSelect}
          onChange={onToggle}
          style={{ flexShrink: 0 }}
        />
        <span className={`import-ext-row-dot import-ext-row-dot-${status}`}>
          {status === 'available' ? '●' : status === 'missing' ? '✗' : '–'}
        </span>
        <span className="import-ext-row-name">{pkg}</span>
        <span className="import-ext-row-status">{statusLabel}</span>
        {status === 'available' && (
          <button
            className="import-ext-row-toggle btn-ghost btn-sm"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Hide' : 'Preview'} settings
          </button>
        )}
      </div>

      {expanded && formatted && (
        <div className="import-ext-sr-body">
          {isAA    && parsed && <AASettingsSummary    settings={parsed} />}
          {isAlloy && parsed && <AlloySettingsSummary settings={parsed} />}
          <div className="import-ext-sr-json-header">
            <span className="import-ext-sr-json-label">Full settings JSON</span>
            <button className="btn-ghost btn-sm" onClick={() => { try { navigator.clipboard.writeText(formatted) } catch {} }}>
              Copy
            </button>
          </div>
          <pre className="import-ext-sr-json">{formatted}</pre>
        </div>
      )}
    </div>
  )
}

// ── Adobe Analytics structured summary ───────────────────────────────────────

function AASettingsSummary({ settings }) {
  const lc           = settings.libraryCode || {}
  const accounts     = lc.accounts || {}
  const prodRsids    = accounts.production  || []
  const stagingRsids = accounts.staging     || []
  const devRsids     = accounts.development || []
  const allRsids     = [...new Set([...prodRsids, ...stagingRsids, ...devRsids])]

  const trackingServer       = settings.trackingServer       || null
  const trackingServerSecure = settings.trackingServerSecure || null
  const currencyCode         = settings.currencyCode         || null
  const charSet              = settings.charSet              || null
  const activityMapEnabled   = settings.activityMap?.enabled

  const trackerVars  = Array.isArray(settings.trackerVariables) ? settings.trackerVariables : []
  const globalVars   = Array.isArray(settings.globalVariables)  ? settings.globalVariables  : []
  const customCode   = settings.customSetup?.source || settings.customSetup?.pageCode || null

  const hasAnything = allRsids.length || trackingServer || currencyCode || activityMapEnabled != null
    || trackerVars.length || globalVars.length || customCode
  if (!hasAnything) return null

  return (
    <div className="import-ext-aa-summary">
      {/* Library management */}
      {lc.type && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Library type</span>
          <span className="import-ext-aa-value">{lc.type}</span>
        </div>
      )}
      {prodRsids.length > 0 && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Production RSIDs</span>
          <span className="import-ext-aa-value">{prodRsids.join(', ')}</span>
        </div>
      )}
      {stagingRsids.length > 0 && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Staging RSIDs</span>
          <span className="import-ext-aa-value">{stagingRsids.join(', ')}</span>
        </div>
      )}
      {devRsids.length > 0 && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Dev RSIDs</span>
          <span className="import-ext-aa-value">{devRsids.join(', ')}</span>
        </div>
      )}

      {/* General */}
      {trackingServer && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Tracking server</span>
          <span className="import-ext-aa-value">{trackingServer}</span>
        </div>
      )}
      {trackingServerSecure && trackingServerSecure !== trackingServer && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Tracking server (SSL)</span>
          <span className="import-ext-aa-value">{trackingServerSecure}</span>
        </div>
      )}
      {currencyCode && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Currency code</span>
          <span className="import-ext-aa-value">{currencyCode}</span>
        </div>
      )}
      {charSet && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Character set</span>
          <span className="import-ext-aa-value">{charSet}</span>
        </div>
      )}

      {/* Activity Map */}
      {activityMapEnabled != null && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Activity Map</span>
          <span className="import-ext-aa-value">{activityMapEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      )}

      {/* Variables */}
      {trackerVars.length > 0 && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Tracker variables</span>
          <span className="import-ext-aa-value">
            {trackerVars.length} ({trackerVars.map(v => v.name).slice(0, 8).join(', ')}{trackerVars.length > 8 ? '…' : ''})
          </span>
        </div>
      )}
      {globalVars.length > 0 && (
        <div className="import-ext-aa-row">
          <span className="import-ext-aa-label">Global variables</span>
          <span className="import-ext-aa-value">
            {globalVars.length} ({globalVars.map(v => v.name).slice(0, 8).join(', ')}{globalVars.length > 8 ? '…' : ''})
          </span>
        </div>
      )}

      {/* Custom code */}
      {customCode && (
        <div className="import-ext-aa-row import-ext-aa-row-code">
          <span className="import-ext-aa-label">Custom code</span>
          <pre className="import-ext-aa-code">{customCode.trim().substring(0, 600)}{customCode.length > 600 ? '\n…' : ''}</pre>
        </div>
      )}
    </div>
  )
}

// ── Web SDK structured summary ────────────────────────────────────────────────

function AlloySettingsSummary({ settings }) {
  const fields = [
    settings.edgeConfigId   && ['Datastream ID',   settings.edgeConfigId],
    settings.orgId          && ['IMS Org ID',       settings.orgId],
    settings.defaultConsent && ['Default consent',  settings.defaultConsent],
  ].filter(Boolean)
  if (!fields.length) return null
  return (
    <div className="import-ext-aa-summary">
      {fields.map(([label, value]) => (
        <div key={label} className="import-ext-aa-row">
          <span className="import-ext-aa-label">{label}</span>
          <span className="import-ext-aa-value">{value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Selectable item list (rules / data elements) ──────────────────────────────

function ImportSection({ title, items, filtered, selectedIds, affectedIds, filter, onFilterChange, onToggle, onToggleAll, showEnabled }) {
  const allChecked  = items.length > 0 && items.every(i => selectedIds.has(i.id))
  const someChecked = items.some(i => selectedIds.has(i.id))
  const sectionAffectedCount = items.filter(i => affectedIds.has(i.id) && selectedIds.has(i.id)).length

  return (
    <div className="import-v2-section">
      <div className="import-v2-section-head">
        <label className="import-v2-select-all">
          <input
            type="checkbox"
            className="compare-checkbox"
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
            onChange={e => onToggleAll(e.target.checked)}
          />
          <span className="import-v2-section-title">{title} ({items.length})</span>
        </label>
        {sectionAffectedCount > 0 && (
          <span className="import-section-affected-badge">✗ {sectionAffectedCount} with errors</span>
        )}
        <span className="import-v2-selected-badge">{selectedIds.size} selected</span>
        <input
          className="import-v2-filter"
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={e => onFilterChange(e.target.value)}
        />
      </div>
      <ul className="import-v2-list">
        {filtered.map(item => {
          const isAffected = affectedIds.has(item.id) && selectedIds.has(item.id)
          return (
            <li
              key={item.id}
              className={`compare-list-item compare-list-selectable${selectedIds.has(item.id) ? '' : ' import-v2-unselected'}${isAffected ? ' import-item-affected' : ''}`}
              onClick={() => onToggle(item.id)}
            >
              <input
                type="checkbox"
                className="compare-checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => onToggle(item.id)}
                onClick={e => e.stopPropagation()}
              />
              <span style={{ flex: 1 }}>{item.attributes.name}</span>
              {isAffected && <span className="import-item-err-icon" title="Missing extension dependency">✗</span>}
              {showEnabled && !isAffected && (
                <span className={`import-status-pill ${item.attributes.enabled ? 'import-status-on' : 'import-status-off'}`}>
                  {item.attributes.enabled ? 'On' : 'Off'}
                </span>
              )}
            </li>
          )
        })}
        {filtered.length === 0 && filter && (
          <li className="compare-list-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No items match "{filter}"
          </li>
        )}
      </ul>
    </div>
  )
}

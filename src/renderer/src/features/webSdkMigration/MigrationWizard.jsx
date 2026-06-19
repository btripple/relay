import { useState, useMemo, useRef } from 'react'
import { analyzeAAMigration } from './parseAdobeAnalytics'
import { SCHEMA_OPTIONS, generateMappingRows } from './schemaStrategies'
import { exportMigrationExcel, importMigrationExcel } from './migrationExport'
import { getAiMappingSuggestions, applyAiSuggestions, getAiEventNameSuggestions } from './aiSuggestions'
import { fetchAnalyticsVariableNames } from '../../utils/analyticsNames'

const STEPS = ['Preview', 'Schema', 'Mapping']

export default function MigrationWizard({ rawData, propertyName, initialTenantId = '', aiApiKey = '', analyticsRsid = '', analyticsAuth = null, onClose }) {
  const [step, setStep]               = useState(0)
  const [strategy, setStrategy]       = useState(null)
  const [tenantId, setTenantId]       = useState(initialTenantId || 'tenantId')
  const [mappingRows, setMappingRows] = useState(null)
  const [importError, setImportError] = useState(null)
  const [exporting, setExporting]     = useState(false)
  const [filter, setFilter]           = useState('')
  const [showManualOnly, setShowManualOnly] = useState(false)
  const [aiLoading, setAiLoading]           = useState(false)
  const [aiError, setAiError]               = useState(null)
  const [aiProgress, setAiProgress]         = useState('')
  const [aiEventLoading, setAiEventLoading] = useState(false)
  const [aiEventError, setAiEventError]     = useState(null)
  const [aiEventProgress, setAiEventProgress] = useState('')
  const [analyticsNamesUsed, setAnalyticsNamesUsed] = useState(false)
  const [analyticsNames, setAnalyticsNames] = useState(null)
  // null = not attempted, 'loading', { ok: true, count } or { ok: false, error }
  const [analyticsStatus, setAnalyticsStatus] = useState(null)
  const fileInputRef = useRef(null)

  const analysis = useMemo(() => analyzeAAMigration(rawData), [rawData])

  const activeRows = mappingRows || []

  // Build mapping when user advances past schema selection
  const handleSelectSchema = (id) => {
    setStrategy(id)
    const rows = generateMappingRows(analysis, id, tenantId || 'tenantId')
    setMappingRows(rows)
    setStep(2)

    // Kick off Analytics name fetch in background — updates table as soon as it returns.
    if (analyticsRsid && analyticsAuth && !analyticsNames) {
      setAnalyticsStatus('loading')
      fetchAnalyticsVariableNames(
        analyticsAuth.accessToken,
        analyticsAuth.clientId,
        analyticsAuth.orgId,
        analyticsRsid
      )
        .then(names => {
          if (names) {
            setAnalyticsNames(names)
            setAnalyticsStatus({ ok: true, count: Object.keys(names).length })
            // Seed interactionName on custom event rows from analytics labels
            setMappingRows(prev => prev?.map(r => {
              if (r.variableType === 'event' && /^event\d+$/i.test(r.variable) && r.interactionName === '') {
                const label = names[r.variable.toLowerCase()]
                return label ? { ...r, interactionName: label } : r
              }
              return r
            }) ?? null)
          } else {
            setAnalyticsStatus({ ok: false, error: 'No labelled variable names found in this report suite' })
          }
        })
        .catch(err => {
          setAnalyticsStatus({ ok: false, error: err.message })
        })
    }
  }

  const handleTenantChange = (val) => {
    setTenantId(val)
    // Regenerate rows live if already on mapping step
    if (strategy && mappingRows) {
      setMappingRows(generateMappingRows(analysis, strategy, val || 'tenantId'))
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const opt = SCHEMA_OPTIONS.find(o => o.id === strategy)
      const base64 = exportMigrationExcel(activeRows, analysis.aaRules, opt?.name || '', propertyName)
      const safe = (propertyName || 'property').replace(/[^\w\s-]/g, '').trim()
      await window.electronAPI.saveFile(base64, `${safe}_websdk_migration.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const handleImportClick = () => {
    setImportError(null)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const imported = await importMigrationExcel(file)
      setMappingRows(imported)
      setImportError(null)
    } catch (err) {
      setImportError(err.message)
    }
  }

  const toggleSkip = (idx) => {
    setMappingRows(prev => prev.map((r, i) => i === idx ? { ...r, skip: !r.skip } : r))
  }

  const handleInteractionName = (variable, value) => {
    setMappingRows(prev => prev.map(r => r.variable === variable ? { ...r, interactionName: value } : r))
  }

  const handleAiEventSuggest = async () => {
    setAiEventLoading(true)
    setAiEventError(null)
    setAiEventProgress('')
    try {
      const eventRows = activeRows.filter(r => r.variableType === 'event' && /^event\d+$/i.test(r.variable))
      const suggestions = await getAiEventNameSuggestions(
        eventRows,
        analyticsNames,
        aiApiKey,
        msg => setAiEventProgress(msg)
      )
      if (!Object.keys(suggestions).length) {
        setAiEventError('No suggestions returned — all events may already be labelled or none were eligible.')
      } else {
        setMappingRows(prev => prev.map(r => {
          if (r.variableType !== 'event' || !/^event\d+$/i.test(r.variable)) return r
          const name = suggestions[r.variable.toLowerCase()]
          return name ? { ...r, interactionName: name } : r
        }))
      }
    } catch (err) {
      setAiEventError(err.message)
    } finally {
      setAiEventLoading(false)
      setAiEventProgress('')
    }
  }

  const handleAiSuggest = async () => {
    setAiLoading(true)
    setAiError(null)
    setAiProgress('')
    try {
      // Use already-fetched Analytics names if available; otherwise try to fetch now.
      let names = analyticsNames
      if (!names && analyticsRsid && analyticsAuth) {
        setAiProgress('Fetching Analytics variable names…')
        names = await fetchAnalyticsVariableNames(
          analyticsAuth.accessToken,
          analyticsAuth.clientId,
          analyticsAuth.orgId,
          analyticsRsid
        )
        if (names) setAnalyticsNames(names)
      }
      setAnalyticsNamesUsed(!!names)

      const suggestions = await getAiMappingSuggestions(
        activeRows,
        tenantId || 'tenantId',
        aiApiKey,
        (msg) => setAiProgress(msg),
        names
      )
      if (!Object.keys(suggestions).length) {
        setAiError('No suggestions returned. All variables may already have paths, or none matched.')
      } else {
        setMappingRows(prev => applyAiSuggestions(prev, suggestions))
      }
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
      setAiProgress('')
    }
  }

  const stats = useMemo(() => {
    if (!activeRows.length) return null
    const total          = activeRows.length
    const skipped        = activeRows.filter(r => r.skip).length
    const aiSuggested    = activeRows.filter(r => !r.skip && r._aiSuggested).length
    const manual         = activeRows.filter(r => !r.skip && r.requiresManualMapping && !r.customXdmPath && !r._aiSuggested).length
    const mapped         = total - skipped - manual - aiSuggested
    const eventsTotal    = activeRows.filter(r => !r.skip && r.variableType === 'event' && /^event\d+$/i.test(r.variable)).length
    const eventsLabelled = activeRows.filter(r => !r.skip && r.variableType === 'event' && /^event\d+$/i.test(r.variable) && r.interactionName).length
    return { total, skipped, manual, aiSuggested, mapped, eventsTotal, eventsLabelled }
  }, [activeRows])

  const filteredRows = useMemo(() => {
    let rows = activeRows
    if (showManualOnly) rows = rows.filter(r => r.requiresManualMapping && !r.customXdmPath && !r._aiSuggested && !r.skip)
    if (filter) {
      const q = filter.toLowerCase()
      rows = rows.filter(r =>
        r.variable.toLowerCase().includes(q) ||
        r.variableType.toLowerCase().includes(q) ||
        r.suggestedXdmPath.toLowerCase().includes(q) ||
        r.customXdmPath.toLowerCase().includes(q) ||
        r.rulesUsing.toLowerCase().includes(q)
      )
    }
    return rows
  }, [activeRows, filter, showManualOnly])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-migration">
        {/* Header */}
        <div className="modal-header mig-header">
          <div>
            <div className="mig-title-row">
              <h2>Web SDK Migration</h2>
              <span className="mig-beta-badge">BETA</span>
            </div>
            {propertyName && <div className="audit-prop-subtitle">{propertyName}</div>}
          </div>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>

        {/* Step indicator */}
        <div className="mig-steps">
          {STEPS.map((label, i) => (
            <div key={i} className={`mig-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="mig-step-num">{i < step ? '✓' : i + 1}</div>
              <div className="mig-step-label">{label}</div>
              {i < STEPS.length - 1 && <div className="mig-step-line" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="mig-body">
          {step === 0 && <PreviewStep analysis={analysis} onNext={() => setStep(1)} />}
          {step === 1 && (
            <SchemaStep
              strategy={strategy}
              tenantId={tenantId}
              onTenantChange={handleTenantChange}
              onSelect={handleSelectSchema}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <MappingStep
              rows={filteredRows}
              allRows={activeRows}
              stats={stats}
              filter={filter}
              showManualOnly={showManualOnly}
              onFilterChange={setFilter}
              onShowManualOnly={setShowManualOnly}
              onToggleSkip={toggleSkip}
              exporting={exporting}
              onExport={handleExport}
              onImportClick={handleImportClick}
              importError={importError}
              onBack={() => setStep(1)}
              aiApiKey={aiApiKey}
              aiLoading={aiLoading}
              aiError={aiError}
              aiProgress={aiProgress}
              analyticsNames={analyticsNames}
              analyticsNamesUsed={analyticsNamesUsed}
              analyticsStatus={analyticsStatus}
              strategy={strategy}
              onInteractionNameChange={handleInteractionName}
              onAiSuggest={handleAiSuggest}
              aiEventLoading={aiEventLoading}
              aiEventError={aiEventError}
              aiEventProgress={aiEventProgress}
              onAiEventSuggest={handleAiEventSuggest}
            />
          )}
        </div>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}

// ── Step 1: Preview ───────────────────────────────────────────────────────────

function PreviewStep({ analysis, onNext }) {
  const { hasAAExtension, aaExtensionName, aaRules, variables, warnings } = analysis
  const pageViewRules = aaRules.filter(r => r.beaconType !== 'link')
  const linkRules     = aaRules.filter(r => r.beaconType === 'link')
  const hasAA = aaRules.length > 0 || variables.length > 0

  return (
    <div className="mig-preview">
      {warnings.length > 0 && (
        <div className="mig-warnings">
          {warnings.map((w, i) => <div key={i} className="mig-warning">{w}</div>)}
        </div>
      )}

      <div className="mig-stat-row">
        <StatTile label="AA Rules" value={aaRules.length} />
        <StatTile label="Page View Beacons" value={pageViewRules.length} />
        <StatTile label="Link Tracking Beacons" value={linkRules.length} />
        <StatTile label="Unique Variables" value={variables.length} warn={variables.length === 0} />
      </div>

      {hasAAExtension && (
        <div className="mig-info-row">
          Extension detected: <strong>{aaExtensionName || 'Adobe Analytics'}</strong>
          <span className="mig-badge-ok">Global variables included</span>
        </div>
      )}

      {!hasAA && (
        <div className="mig-empty">
          No Adobe Analytics actions were found in this property. There may be nothing to migrate, or Analytics may be loaded via a different method (e.g. custom code only).
        </div>
      )}

      {aaRules.length > 0 && (
        <div className="mig-rules-preview">
          <div className="mig-section-title">Rules requiring migration ({aaRules.length})</div>
          <div className="mig-rules-list">
            {aaRules.map(r => (
              <div key={r.id} className="mig-rule-row">
                <span className={`status-pill ${r.enabled ? 'enabled' : 'disabled'}`}>
                  {r.enabled ? 'On' : 'Off'}
                </span>
                <span className="mig-rule-name">{r.name}</span>
                <span className="mig-rule-tags">
                  {r.hasSetVars && <span className="mig-tag">Set Vars</span>}
                  {r.hasBeacon  && <span className="mig-tag">{r.beaconType === 'link' ? 'Link Beacon' : 'Page Beacon'}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mig-footer-row">
        {hasAA
          ? <button className="btn-primary" onClick={onNext}>Next: Choose Schema</button>
          : <button className="btn-ghost" onClick={onNext}>Continue Anyway</button>
        }
      </div>
    </div>
  )
}

// ── Step 2: Schema selection ──────────────────────────────────────────────────

function SchemaStep({ strategy, tenantId, onTenantChange, onSelect, onBack }) {
  const [localStrategy, setLocalStrategy] = useState(strategy)

  return (
    <div className="mig-schema">
      <div className="mig-schema-intro">
        Choose how variables will be structured in your Web SDK XDM payload. This determines the field paths in your Send Event action.
      </div>

      <div className="mig-option-cards">
        {SCHEMA_OPTIONS.map(opt => (
          <div
            key={opt.id}
            className={`mig-option-card ${localStrategy === opt.id ? 'selected' : ''}`}
            onClick={() => setLocalStrategy(opt.id)}
          >
            <div className="mig-option-id">{opt.id === 3 ? '★ Recommended' : `Option ${opt.id}`}</div>
            <div className="mig-option-name">{opt.shortName}</div>
            <div className="mig-option-path mono">{opt.name}</div>
            <div className="mig-option-desc">{opt.description}</div>
            <div className="mig-option-pros">
              {opt.pros.map((p, i) => <div key={i} className="mig-pro">+ {p}</div>)}
            </div>
            <div className="mig-option-cons">
              {opt.cons.map((c, i) => <div key={i} className="mig-con">− {c}</div>)}
            </div>
            <div className="mig-option-when">{opt.whenToUse}</div>
          </div>
        ))}
      </div>

      {localStrategy === 3 && (
        <div className="mig-tenant-row">
          <label className="mig-tenant-label">
            XDM Tenant ID
            <span className="mig-tenant-hint"> — the custom namespace prefix for your AEP schema</span>
          </label>
          <div className="mig-tenant-input-row">
            <span className="mig-tenant-prefix">_</span>
            <input
              className="mig-tenant-input"
              type="text"
              value={tenantId === 'tenantId' ? '' : tenantId}
              onChange={e => onTenantChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              placeholder="yourTenantId"
              spellCheck={false}
            />
          </div>
          <div className="mig-tenant-preview">
            Example path: <span className="mono">_{tenantId || 'yourTenantId'}.eVar1</span>
            {tenantId && tenantId !== 'tenantId' && (
              <span className="mig-tenant-saved"> (from organization settings)</span>
            )}
          </div>
        </div>
      )}

      <div className="mig-footer-row">
        <button className="btn-ghost" onClick={onBack}>Back</button>
        <button
          className="btn-primary"
          disabled={!localStrategy}
          onClick={() => onSelect(localStrategy)}
        >
          Next: Preview Mapping
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Mapping table ─────────────────────────────────────────────────────

const IS_CUSTOM_EVENT = /^event\d+$/i

function MappingStep({ rows, allRows, stats, filter, showManualOnly, onFilterChange, onShowManualOnly, onToggleSkip, exporting, onExport, onImportClick, importError, onBack, aiApiKey, aiLoading, aiError, aiProgress, analyticsNames, analyticsNamesUsed, analyticsStatus, strategy, onInteractionNameChange, onAiSuggest, aiEventLoading, aiEventError, aiEventProgress, onAiEventSuggest }) {
  const [activeTab, setActiveTab] = useState('variables')

  const hasImports  = allRows.some(r => r._imported)
  const manualCount = stats?.manual ?? 0

  // Split filtered rows into the two tabs
  const varRows         = rows.filter(r => r.variableType !== 'event')
  const eventRows       = rows.filter(r => r.variableType === 'event')
  const commerceRows    = eventRows.filter(r => !IS_CUSTOM_EVENT.test(r.variable))
  const customEventRows = eventRows.filter(r =>  IS_CUSTOM_EVENT.test(r.variable))

  // Tab counts from full (unfiltered) set
  const allVarCount     = allRows.filter(r => r.variableType !== 'event').length
  const allEventCount   = allRows.filter(r => r.variableType === 'event').length

  return (
    <div className="mig-mapping">
      {/* Toolbar */}
      <div className="mig-mapping-toolbar">
        <input
          className="audit-search-input"
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={e => onFilterChange(e.target.value)}
        />
        {activeTab === 'variables' && (
          <label className="mig-manual-toggle">
            <input type="checkbox" checked={showManualOnly} onChange={e => onShowManualOnly(e.target.checked)} />
            Show manual-only
          </label>
        )}
        {filter && (
          <span className="audit-search-count">
            {activeTab === 'variables' ? varRows.length : eventRows.length} of {activeTab === 'variables' ? allVarCount : allEventCount}
          </span>
        )}
        <div className="mig-toolbar-actions">
          <button className="btn-ghost btn-sm" onClick={onImportClick}>Import Excel</button>
          <button className="btn-export btn-sm" onClick={onExport} disabled={exporting}>
            {exporting ? 'Saving…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {importError && <div className="mig-import-error">{importError}</div>}

      {/* Stats bar */}
      {stats && (
        <div className="mig-stats-bar">
          <span className="mig-stat-ok">{stats.mapped} auto-mapped</span>
          {stats.aiSuggested > 0 && <span className="mig-stat-ai">✦ {stats.aiSuggested} AI-suggested</span>}
          {stats.manual > 0 && <span className="mig-stat-warn">{stats.manual} need manual XDM path</span>}
          {strategy === 3 && stats.eventsTotal > 0 && (
            <span className={stats.eventsLabelled === stats.eventsTotal ? 'mig-stat-ok' : 'mig-stat-warn'}>
              {stats.eventsLabelled}/{stats.eventsTotal} events labelled
            </span>
          )}
          {stats.skipped > 0 && <span className="mig-stat-skip">{stats.skipped} skipped</span>}
          {hasImports && <span className="mig-stat-imported">Imported from Excel</span>}
        </div>
      )}

      {/* Tabs */}
      <div className="mig-tab-bar">
        <button
          className={`mig-tab-btn ${activeTab === 'variables' ? 'active' : ''}`}
          onClick={() => setActiveTab('variables')}
        >
          Variables
          <span className="mig-tab-count">{allVarCount}</span>
        </button>
        <button
          className={`mig-tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Events
          <span className="mig-tab-count">{allEventCount}</span>
          {strategy === 3 && stats?.eventsTotal > 0 && stats.eventsLabelled < stats.eventsTotal && (
            <span className="mig-tab-badge">{stats.eventsTotal - stats.eventsLabelled}</span>
          )}
        </button>
      </div>

      {/* Analytics names status */}
      {analyticsStatus && (
        <div className={`mig-aa-status ${
          analyticsStatus === 'loading' ? 'mig-aa-loading'
          : analyticsStatus.ok ? 'mig-aa-ok'
          : 'mig-aa-error'
        }`}>
          {analyticsStatus === 'loading'
            ? '⏳ Loading Analytics variable names…'
            : analyticsStatus.ok
              ? `✓ Analytics names loaded — ${analyticsStatus.count} labelled variables found in report suite`
              : `⚠ Analytics names unavailable: ${analyticsStatus.error}`
          }
        </div>
      )}

      {/* ── Variables tab ───────────────────────────────────────────────── */}
      {activeTab === 'variables' && (
        <>
          {aiApiKey ? (
            manualCount > 0 && (
              <div className="mig-ai-banner">
                <div className="mig-ai-banner-left">
                  <span className="mig-ai-spark">✦</span>
                  <div>
                    <strong>AI Path Suggestions</strong>
                    <span className="mig-ai-banner-desc">
                      {analyticsNamesUsed
                        ? ' — using Analytics variable names + rule context'
                        : ' — inferred from data element names and rule context'}
                    </span>
                  </div>
                </div>
                <div className="mig-ai-banner-right">
                  {aiError && <span className="mig-ai-error">{aiError}</span>}
                  <button className="btn-primary btn-sm" onClick={onAiSuggest} disabled={aiLoading}>
                    {aiLoading ? (aiProgress || 'Getting suggestions…') : (stats?.aiSuggested > 0 ? '↺ Re-run AI' : 'Get AI Suggestions')}
                  </button>
                </div>
              </div>
            )
          ) : (
            manualCount > 0 && (
              <div className="mig-ai-hint-bar">
                ✦ Add a Gemini API key in organization settings to get AI-powered XDM path suggestions.
              </div>
            )
          )}

          <div className="mig-table-scroll">
            <table className="audit-table mig-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Type</th>
                  <th>Example Value</th>
                  <th>Rules</th>
                  <th>XDM Path</th>
                  <th>Notes</th>
                  <th>Skip</th>
                </tr>
              </thead>
              <tbody>
                {varRows.map((row) => {
                  const effectivePath = row.customXdmPath || row.suggestedXdmPath
                  const isManual = row.requiresManualMapping && !row.customXdmPath && !row._aiSuggested
                  const isAi     = row._aiSuggested && !row.customXdmPath
                  return (
                    <tr key={row.variable} className={`mig-row ${row.skip ? 'mig-row-skip' : isManual ? 'mig-row-manual' : isAi ? 'mig-row-ai' : 'mig-row-ok'}`}>
                      <td className="mig-cell-var">
                        <span className="mig-var-name">{row.variable}</span>
                        {analyticsNames?.[row.variable.toLowerCase()] && (
                          <span className="mig-var-friendly">{analyticsNames[row.variable.toLowerCase()]}</span>
                        )}
                      </td>
                      <td>
                        <span className={`mig-type-chip mig-type-${row.variableType}`}>{row.variableType}</span>
                      </td>
                      <td className="mig-cell-value mono" title={row.exampleValue}>{row.exampleValue}</td>
                      <td className="mig-cell-rules" title={row.rulesUsing}>
                        {row.rulesCount > 0
                          ? <span title={row.rulesUsing}>{row.rulesCount} rule{row.rulesCount !== 1 ? 's' : ''}</span>
                          : <span className="mig-global-badge">Global</span>
                        }
                      </td>
                      <td className={`mig-cell-path mono ${row._imported && row.customXdmPath ? 'mig-path-imported' : ''} ${isAi ? 'mig-path-ai' : ''} ${isManual && !row.skip ? 'mig-path-manual' : ''}`}>
                        {effectivePath || (isManual ? '— needs mapping' : '')}
                        {isAi && (
                          <span
                            className={`mig-ai-badge mig-ai-conf-${row._aiConfidence || 'medium'}`}
                            title={row.notes ? `AI (${row._aiConfidence}): ${row.notes}` : `AI suggestion (${row._aiConfidence} confidence)`}
                          >AI</span>
                        )}
                      </td>
                      <td className="mig-cell-notes">{row.notes}</td>
                      <td className="mig-cell-skip">
                        <input type="checkbox" checked={!!row.skip} onChange={() => onToggleSkip(allRows.indexOf(row))} title={row.skip ? 'Unmark skip' : 'Skip this variable'} />
                      </td>
                    </tr>
                  )
                })}
                {varRows.length === 0 && (
                  <tr><td colSpan={7} className="mig-empty-row">No variables match the current filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Events tab ──────────────────────────────────────────────────── */}
      {activeTab === 'events' && (
        <div className="mig-events-body">
          {/* Custom events */}
          {customEventRows.length > 0 && (
            <div className="mig-event-group">
              <div className="mig-event-group-title">Custom Events</div>

              {strategy === 3 ? (
                // ── Option 3: web.webInteraction.name + CJA Data View ──────────
                <>
                  <div className="mig-event-group-desc">
                    Assign a descriptive <code>object:action</code> name for each event. In your Web SDK <strong>Send Event</strong> action, set <code>web.webInteraction.name</code> to this value. Then create a metric in your <strong>CJA Data View</strong> filtered to that value.
                  </div>

                  {aiApiKey ? (
                    <div className="mig-ai-banner">
                      <div className="mig-ai-banner-left">
                        <span className="mig-ai-spark">✦</span>
                        <div>
                          <strong>AI Event Names</strong>
                          <span className="mig-ai-banner-desc">
                            {analyticsNames
                              ? ' — generates object:action names from Analytics labels + rule context'
                              : ' — generates object:action names from rule context'}
                          </span>
                        </div>
                      </div>
                      <div className="mig-ai-banner-right">
                        {aiEventError && <span className="mig-ai-error">{aiEventError}</span>}
                        <button className="btn-primary btn-sm" onClick={onAiEventSuggest} disabled={aiEventLoading}>
                          {aiEventLoading
                            ? (aiEventProgress || 'Getting names…')
                            : (stats?.eventsLabelled > 0 ? '↺ Re-run AI' : 'Get AI Suggestions')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mig-ai-hint-bar">
                      ✦ Add a Gemini API key in organization settings to auto-generate <code>object:action</code> interaction names.
                    </div>
                  )}

                  <div className="mig-table-scroll">
                    <table className="audit-table mig-table">
                      <thead>
                        <tr>
                          <th>Event</th>
                          <th>Analytics Label</th>
                          <th>web.webInteraction.name value</th>
                          <th>Rules</th>
                          <th>Skip</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customEventRows.map(row => (
                          <tr key={row.variable} className={`mig-row ${row.skip ? 'mig-row-skip' : row.interactionName ? 'mig-row-ok' : 'mig-row-manual'}`}>
                            <td className="mig-cell-var"><span className="mig-var-name">{row.variable}</span></td>
                            <td className="mig-cell-analytics-label">
                              {analyticsNames?.[row.variable.toLowerCase()]
                                ? analyticsNames[row.variable.toLowerCase()]
                                : <span className="mig-unlabelled">not labelled</span>
                              }
                            </td>
                            <td className="mig-cell-interaction">
                              <input
                                className="mig-interaction-input"
                                type="text"
                                value={row.interactionName || ''}
                                onChange={e => onInteractionNameChange(row.variable, e.target.value)}
                                placeholder="e.g. store:search"
                                disabled={row.skip}
                              />
                            </td>
                            <td className="mig-cell-rules" title={row.rulesUsing}>
                              {row.rulesCount > 0
                                ? <span title={row.rulesUsing}>{row.rulesCount} rule{row.rulesCount !== 1 ? 's' : ''}</span>
                                : <span className="mig-global-badge">Global</span>
                              }
                            </td>
                            <td className="mig-cell-skip">
                              <input type="checkbox" checked={!!row.skip} onChange={() => onToggleSkip(allRows.indexOf(row))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                // ── Options 1 & 2: auto-mapped, read-only ──────────────────────
                <>
                  <div className="mig-event-group-desc">
                    {strategy === 1
                      ? 'Events are passed through directly via the data object. The datastream maps them to Analytics server-side — no XDM path work needed.'
                      : 'Events are mapped to the _experience.analytics XDM field group. These paths are auto-generated — no manual input required.'}
                  </div>
                  <div className="mig-table-scroll">
                    <table className="audit-table mig-table">
                      <thead>
                        <tr>
                          <th>Event</th>
                          <th>Analytics Label</th>
                          <th>XDM Path</th>
                          <th>Rules</th>
                          <th>Skip</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customEventRows.map(row => (
                          <tr key={row.variable} className={`mig-row ${row.skip ? 'mig-row-skip' : 'mig-row-ok'}`}>
                            <td className="mig-cell-var"><span className="mig-var-name">{row.variable}</span></td>
                            <td className="mig-cell-analytics-label">
                              {analyticsNames?.[row.variable.toLowerCase()]
                                ? analyticsNames[row.variable.toLowerCase()]
                                : <span className="mig-unlabelled">not labelled</span>
                              }
                            </td>
                            <td className="mig-cell-path mono">{row.suggestedXdmPath}</td>
                            <td className="mig-cell-rules" title={row.rulesUsing}>
                              {row.rulesCount > 0
                                ? <span title={row.rulesUsing}>{row.rulesCount} rule{row.rulesCount !== 1 ? 's' : ''}</span>
                                : <span className="mig-global-badge">Global</span>
                              }
                            </td>
                            <td className="mig-cell-skip">
                              <input type="checkbox" checked={!!row.skip} onChange={() => onToggleSkip(allRows.indexOf(row))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Commerce events: auto-mapped standard XDM */}
          {commerceRows.length > 0 && (
            <div className="mig-event-group">
              <div className="mig-event-group-title">Standard Commerce Events <span className="mig-event-group-badge">auto-mapped</span></div>
              <div className="mig-table-scroll">
                <table className="audit-table mig-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>XDM Path</th>
                      <th>Rules</th>
                      <th>Skip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commerceRows.map(row => (
                      <tr key={row.variable} className={`mig-row ${row.skip ? 'mig-row-skip' : 'mig-row-ok'}`}>
                        <td className="mig-cell-var"><span className="mig-var-name">{row.variable}</span></td>
                        <td className="mig-cell-path mono">{row.suggestedXdmPath}</td>
                        <td className="mig-cell-rules" title={row.rulesUsing}>
                          {row.rulesCount > 0
                            ? <span title={row.rulesUsing}>{row.rulesCount} rule{row.rulesCount !== 1 ? 's' : ''}</span>
                            : <span className="mig-global-badge">Global</span>
                          }
                        </td>
                        <td className="mig-cell-skip">
                          <input type="checkbox" checked={!!row.skip} onChange={() => onToggleSkip(allRows.indexOf(row))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mig-footer-row">
        <button className="btn-ghost" onClick={onBack}>Back</button>
        <div className="mig-export-hint">
          Export to Excel for granular control, then re-import to update this view.
        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatTile({ label, value, warn }) {
  return (
    <div className={`mig-stat-tile ${warn ? 'mig-stat-tile-warn' : ''}`}>
      <div className="mig-stat-value">{value}</div>
      <div className="mig-stat-label">{label}</div>
    </div>
  )
}

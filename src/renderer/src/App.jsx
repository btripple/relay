import { useState, useEffect } from 'react'
import ReactorClient from './api/reactor'
import AuthScreen from './components/AuthScreen'
import PropertyList from './components/PropertyList'
import AssetList from './components/AssetList'
import CopyPanel from './components/CopyPanel'
import CopyProgress from './components/CopyProgress'
import CompareModal from './components/CompareModal'
import AuditModal from './components/AuditModal'
import LibraryModal from './components/LibraryModal'
import ImportModal from './components/ImportModal'
import { buildAuditData } from './utils/auditExport'

export default function App() {
  const [settings, setSettings] = useState(null)
  const [auth, setAuth] = useState(null)

  const [companies, setCompanies] = useState([])
  const [company, setCompany] = useState(null)
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [companiesError, setCompaniesError] = useState(null)

  const [sourceProperty, setSourceProperty] = useState(null)
  const [destProperty, setDestProperty] = useState(null)

  const [rules, setRules] = useState([])
  const [dataElements, setDataElements] = useState([])
  const [assetsLoading, setAssetsLoading] = useState(false)

  const [selectedRules, setSelectedRules] = useState(new Set())
  const [selectedDEs, setSelectedDEs] = useState(new Set())

  const [copyState, setCopyState] = useState(null)
  const [compareState, setCompareState] = useState(null)
  const [auditState, setAuditState] = useState(null)
  const [libraryState, setLibraryState] = useState(null)
  const [exportState, setExportState] = useState(null)
  const [importPreview, setImportPreview] = useState(null)

  // Load saved settings on mount, migrating legacy flat credentials to profiles
  useEffect(() => {
    window.electronAPI.getSettings().then(raw => {
      const s = raw || {}
      if (!s.profiles && s.clientId) {
        const migrated = {
          ...s,
          profiles: [{
            id: crypto.randomUUID(),
            name: 'Default',
            clientId: s.clientId,
            clientSecret: s.clientSecret || '',
            orgId: s.orgId || '',
            companyId: s.companyId || ''
          }]
        }
        window.electronAPI.saveSettings(migrated)
        setSettings(migrated)
      } else {
        setSettings({ ...s, profiles: s.profiles || [] })
      }
    })
  }, [])

  const client = auth
    ? new ReactorClient({
        accessToken: auth.accessToken,
        clientId: auth.clientId,
        orgId: company?.attributes?.org_id || auth.orgId
      })
    : null

  const favorites = (settings && company)
    ? new Set(settings.favorites?.[company.id] || [])
    : new Set()

  const handleToggleFavorite = async (propertyId) => {
    const current = new Set(settings.favorites?.[company.id] || [])
    if (current.has(propertyId)) current.delete(propertyId)
    else current.add(propertyId)
    const newSettings = {
      ...settings,
      favorites: { ...(settings.favorites || {}), [company.id]: [...current] }
    }
    await window.electronAPI.saveSettings(newSettings)
    setSettings(newSettings)
  }

  const handleLogin = async (clientId, clientSecret, orgIdOverride, companyIdOverride, tokens) => {
    let orgId = orgIdOverride || null
    if (!orgId) {
      try {
        const b64 = tokens.access_token.split('.')[1]
        const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')))
        orgId = payload.ims_org_id || null
      } catch {}
    }
    const newSettings = { ...settings, clientId, clientSecret, orgId, companyId: companyIdOverride || null }
    await window.electronAPI.saveSettings(newSettings)
    setSettings(newSettings)
    setAuth({ accessToken: tokens.access_token, clientId, orgId, companyId: companyIdOverride || null })
  }

  // Load companies after login
  useEffect(() => {
    if (!auth) return

    // If a company ID was entered manually, skip the /companies call
    if (auth.companyId) {
      const synthetic = { id: auth.companyId, attributes: { name: auth.companyId, org_id: auth.orgId } }
      setCompanies([synthetic])
      pickCompany(synthetic)
      return
    }

    const c = new ReactorClient({ accessToken: auth.accessToken, clientId: auth.clientId, orgId: auth.orgId })
    setCompaniesLoading(true)
    setCompaniesError(null)
    c.getCompanies()
      .then(comps => {
        setCompanies(comps)
        if (comps.length === 1) pickCompany(comps[0], c)
      })
      .catch(e => setCompaniesError(e.message))
      .finally(() => setCompaniesLoading(false))
  }, [auth])

  const pickCompany = (comp, c) => {
    setCompany(comp)
    setSourceProperty(null)
    setDestProperty(null)
    setRules([])
    setDataElements([])
    if (c) c.orgId = comp.attributes.org_id
  }

  // Load assets when source property changes
  useEffect(() => {
    if (!sourceProperty || !client) return
    setAssetsLoading(true)
    setSelectedRules(new Set())
    setSelectedDEs(new Set())
    Promise.all([
      client.getRules(sourceProperty.id),
      client.getDataElements(sourceProperty.id)
    ])
      .then(([r, de]) => { setRules(r); setDataElements(de) })
      .catch(e => alert('Failed to load assets: ' + e.message))
      .finally(() => setAssetsLoading(false))
  }, [sourceProperty?.id])

  const handleAudit = async () => {
    setAuditState({ status: 'loading', progress: 'Starting…', progressPct: 0 })
    try {
      const raw = await client.auditProperty(sourceProperty.id, (msg, pct) => {
        setAuditState({ status: 'loading', progress: msg, progressPct: pct })
      })
      const auditData = buildAuditData(raw, sourceProperty.attributes.name)
      setAuditState({ status: 'done', auditData })
    } catch (err) {
      setAuditState({ status: 'error', error: err.message })
    }
  }

  const handleExport = async () => {
    setExportState({ status: 'running', progress: 'Starting…', progressPct: 0 })
    try {
      const data = await client.exportProperty(sourceProperty.id, (msg, pct) => {
        setExportState({ status: 'running', progress: msg, progressPct: pct })
      })
      data.sourceProperty = { id: sourceProperty.id, name: sourceProperty.attributes.name }
      const json = JSON.stringify(data, null, 2)
      const safeName = sourceProperty.attributes.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      const result = await window.electronAPI.saveJson(json, `relay_export_${safeName}.json`)
      setExportState(result?.saved ? null : null)
    } catch (err) {
      setExportState({ status: 'error', error: err.message })
    }
  }

  const handleImportFile = async () => {
    const text = await window.electronAPI.openFile()
    if (!text) return
    try {
      const exportData = JSON.parse(text)
      if (!exportData.version || !Array.isArray(exportData.rules) || !Array.isArray(exportData.dataElements)) {
        alert('Invalid export file. Please select a valid Relay export.')
        return
      }
      setImportPreview({ exportData })
    } catch {
      alert('Failed to parse the selected file. Please ensure it is a valid Relay export.')
    }
  }

  const handleImportConfirm = async (overwrite) => {
    const { exportData } = importPreview
    setImportPreview(null)
    setCopyState({ status: 'running', log: [] })
    try {
      const { log, destRuleIds, destDEIds } = await client.importAssets(
        sourceProperty.id,
        exportData,
        { overwrite },
        (log) => setCopyState({ status: 'running', log })
      )
      setCopyState({ status: 'done', log, destRuleIds, destDEIds })
    } catch (err) {
      setCopyState({ status: 'error', log: [{ type: 'error', message: err.message }] })
    }
  }

  const handleCompare = async () => {
    setCompareState({ status: 'loading' })
    try {
      const result = await client.compareAssets(sourceProperty.id, destProperty.id)
      setCompareState({ status: 'done', result })
    } catch (err) {
      setCompareState({ status: 'error', error: err.message })
    }
  }

  const handleApplyCompare = async (rulesToCopy, desToCopy) => {
    setCompareState(null)
    setCopyState({ status: 'running', log: [] })
    try {
      const { log, destRuleIds, destDEIds } = await client.copyAssets(
        sourceProperty.id,
        destProperty.id,
        rulesToCopy,
        desToCopy,
        { overwrite: true },
        (log) => setCopyState({ status: 'running', log })
      )
      setCopyState({ status: 'done', log, destRuleIds, destDEIds })
    } catch (err) {
      setCopyState({ status: 'error', log: [{ type: 'error', message: err.message }] })
    }
  }

  const handleCopy = async (overwrite) => {
    const rulesToCopy = rules.filter(r => selectedRules.has(r.id))
    const desToCopy = dataElements.filter(de => selectedDEs.has(de.id))
    setCopyState({ status: 'running', log: [] })
    try {
      const { log, destRuleIds, destDEIds } = await client.copyAssets(
        sourceProperty.id,
        destProperty.id,
        rulesToCopy,
        desToCopy,
        { overwrite },
        (log) => setCopyState({ status: 'running', log })
      )
      setCopyState({ status: 'done', log, destRuleIds, destDEIds })
    } catch (err) {
      setCopyState({ status: 'error', log: [{ type: 'error', message: err.message }] })
    }
  }

  if (!settings) return <div className="splash">Loading…</div>

  if (!auth) {
    return (
      <AuthScreen
        settings={settings}
        onLogin={handleLogin}
        onSettingsChange={async (s) => {
          await window.electronAPI.saveSettings(s)
          setSettings(s)
        }}
      />
    )
  }

  if (companiesLoading) return <div className="splash">Loading organizations…</div>
  if (companiesError) return (
    <div className="splash error">
      <p className="splash-error-title">Unable to connect</p>
      <p className="splash-error-body">
        There was a problem authenticating with the Adobe Reactor API. Please verify that your
        Adobe Developer Console project has the correct API credentials and that the
        Launch/Tags product is added with the right permissions.
      </p>
      <p className="splash-error-detail">{companiesError}</p>
      <button className="btn-primary" onClick={() => setAuth(null)}>Back to sign in</button>
    </div>
  )

  if (!company) {
    return (
      <div className="company-picker">
        <header className="app-header">
          <div className="app-brand">
            <span className="app-brand-name">Relay</span>
            <span className="app-brand-sub">a container utility for Adobe Tags</span>
          </div>
          <button className="btn-ghost" onClick={() => setAuth(null)}>Sign out</button>
        </header>
        <div className="company-list">
          <h2>Select an organization</h2>
          {companies.map(c => (
            <button key={c.id} className="company-card" onClick={() => pickCompany(c)}>
              {c.attributes.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-name">Relay</span>
          <span className="app-brand-sub">a container utility for Adobe Tags</span>
        </div>
        <div className="header-right">
          {companies.length > 1 && (
            <select
              value={company.id}
              onChange={e => pickCompany(companies.find(c => c.id === e.target.value))}
              className="org-select"
            >
              {companies.map(c => <option key={c.id} value={c.id}>{c.attributes.name}</option>)}
            </select>
          )}
          {companies.length === 1 && <span className="org-name">{company.attributes.name}</span>}
          <button className="btn-ghost" onClick={() => setAuth(null)}>Sign out</button>
        </div>
      </header>

      <div className="panels">
        <div className="panel panel-source">
          <div className="panel-header">
            <span className="panel-label">Source</span>
            {sourceProperty && <span className="panel-title">{sourceProperty.attributes.name}</span>}
            {sourceProperty && (
              <button className="btn-audit" onClick={handleAudit} title="Audit this property">
                Audit
              </button>
            )}
            {sourceProperty && (
              <button
                className="btn-export"
                onClick={handleExport}
                disabled={!!exportState}
                title="Export this property to a file"
              >
                {exportState?.status === 'running' ? 'Exporting…' : 'Export'}
              </button>
            )}
            {sourceProperty && (
              <button
                className="btn-export"
                onClick={handleImportFile}
                title="Import a previously exported container into this property"
              >
                Import
              </button>
            )}
          </div>
          <PropertyList
            client={client}
            companyId={company.id}
            selected={sourceProperty}
            onSelect={p => {
              setSourceProperty(p)
              if (destProperty?.id === p.id) setDestProperty(null)
            }}
            exclude={destProperty ? [destProperty.id] : []}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        </div>

        <div className="panel panel-assets">
          {sourceProperty ? (
            <AssetList
              rules={rules}
              dataElements={dataElements}
              loading={assetsLoading}
              selectedRules={selectedRules}
              selectedDEs={selectedDEs}
              onRulesChange={setSelectedRules}
              onDEsChange={setSelectedDEs}
            />
          ) : (
            <div className="panel-empty">
              <p>Select a source property to browse its rules and data elements</p>
            </div>
          )}
        </div>

        <div className="panel panel-dest">
          <div className="panel-header">
            <span className="panel-label">Destination</span>
            {destProperty && <span className="panel-title">{destProperty.attributes.name}</span>}
          </div>
          {sourceProperty ? (
            <CopyPanel
              client={client}
              companyId={company.id}
              sourcePropertyId={sourceProperty.id}
              destProperty={destProperty}
              onDestSelect={setDestProperty}
              selectedRuleCount={selectedRules.size}
              selectedDECount={selectedDEs.size}
              onCopy={handleCopy}
              onCompare={handleCompare}
              comparing={compareState?.status === 'loading'}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
            />
          ) : (
            <div className="panel-empty">
              <p>Select a source property first</p>
            </div>
          )}
        </div>
      </div>

      {copyState && (
        <CopyProgress
          status={copyState.status}
          log={copyState.log}
          hasChanges={(copyState.destRuleIds?.length || 0) + (copyState.destDEIds?.length || 0) > 0}
          onAddToLibrary={() => setLibraryState({
            ruleIds: copyState.destRuleIds || [],
            deIds: copyState.destDEIds || [],
            propertyId: destProperty?.id || sourceProperty?.id
          })}
          onClose={() => setCopyState(null)}
        />
      )}

      {libraryState && (
        <LibraryModal
          client={client}
          destPropertyId={libraryState.propertyId}
          ruleIds={libraryState.ruleIds}
          deIds={libraryState.deIds}
          onClose={() => setLibraryState(null)}
        />
      )}

      {compareState && (
        <CompareModal
          status={compareState.status}
          result={compareState.result}
          error={compareState.error}
          sourceProperty={sourceProperty}
          destProperty={destProperty}
          onClose={() => setCompareState(null)}
          onApply={handleApplyCompare}
        />
      )}

      {auditState && (
        <AuditModal
          status={auditState.status}
          progress={auditState.progress}
          progressPct={auditState.progressPct}
          auditData={auditState.auditData}
          propertyName={sourceProperty?.attributes.name}
          error={auditState.error}
          onClose={() => setAuditState(null)}
        />
      )}

      {importPreview && (
        <ImportModal
          exportData={importPreview.exportData}
          destProperty={sourceProperty}
          onConfirm={handleImportConfirm}
          onClose={() => setImportPreview(null)}
        />
      )}

      {exportState?.status === 'running' && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header"><h2>Exporting property…</h2></div>
            <div style={{ padding: '24px 24px 8px' }}>
              <div className="audit-progress-bar">
                <div className="audit-progress-fill" style={{ width: `${exportState.progressPct}%` }} />
              </div>
              <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>{exportState.progress}</p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" disabled>Please wait…</button>
            </div>
          </div>
        </div>
      )}
      {exportState?.status === 'error' && (
        <div className="modal-overlay" onClick={() => setExportState(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header"><h2>Export failed</h2></div>
            <div style={{ padding: '24px' }}>
              <div className="auth-error">{exportState.error}</div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setExportState(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

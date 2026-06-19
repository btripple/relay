import { useState } from 'react'
import { exportAuditToExcel } from '../utils/auditExport'

export default function AuditModal({ status, progress, progressPct, auditData, warnings, propertyName, error, onClose, onCancel }) {
  const [tab, setTab] = useState('discovery')
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const base64 = exportAuditToExcel(auditData)
      const safeName = propertyName.replace(/[^\w\s-]/g, '').trim()
      await window.electronAPI.saveFile(base64, `${safeName}_audit.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && status !== 'loading' && onClose()}>
      <div className="modal modal-audit">
        <div className="modal-header audit-header">
          <div>
            <h2>Property Audit</h2>
            {propertyName && <div className="audit-prop-subtitle">{propertyName}</div>}
          </div>
          {status === 'done' && (
            <button className="btn-primary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Saving…' : 'Export to Excel'}
            </button>
          )}
        </div>

        {status === 'loading' && (
          <div className="audit-loading">
            <div className="audit-progress-bar">
              <div className="audit-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="audit-progress-label">{progress}</div>
            <button className="btn-ghost audit-cancel-btn" onClick={onCancel}>Cancel</button>
          </div>
        )}

        {status === 'error' && (
          <div className="compare-loading compare-error">{error}</div>
        )}

        {status === 'done' && warnings?.length > 0 && (
          <div className="audit-warnings">
            {warnings.map((w, i) => <div key={i} className="audit-warning-item">⚠ {w}</div>)}
          </div>
        )}

        {status === 'done' && auditData && (
          <>
            <div className="audit-tabs">
              <button className={`tab ${tab === 'discovery' ? 'active' : ''}`} onClick={() => setTab('discovery')}>
                Property Discovery
              </button>
              <button className={`tab ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>
                Rules Inventory
                <span className="badge">{auditData.stats.ruleCount}</span>
              </button>
              <button className={`tab ${tab === 'des' ? 'active' : ''}`} onClick={() => setTab('des')}>
                Data Elements
                {auditData.stats.orphanedCount > 0 && (
                  <span className="badge badge-warn">{auditData.stats.orphanedCount} orphaned</span>
                )}
              </button>
              <button className={`tab ${tab === 'names' ? 'active' : ''}`} onClick={() => setTab('names')}>
                Name Audit
              </button>
            </div>

            <div className="audit-body">
              {tab === 'discovery' && <DiscoveryTab auditData={auditData} />}
              {tab === 'rules'     && <SheetTab rows={auditData.rulesInventory} frozenCols={0} searchable />}
              {tab === 'des'       && <DEsTab rows={auditData.orphanedDEs} />}
              {tab === 'names'     && (
                auditData.nameAudit.length <= 1
                  ? <div className="audit-no-orphans">All rule names are unique — no conflicts or duplicates detected.</div>
                  : <SheetTab rows={auditData.nameAudit} frozenCols={1} />
              )}
            </div>
          </>
        )}

        {(status === 'done' || status === 'error') && (
          <div className="modal-footer">
            <button className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Discovery tab ─────────────────────────────────────────────────────────────

function DiscoveryTab({ auditData }) {
  const { stats, discovery } = auditData

  // Extract extensions rows from the raw discovery rows (after EXTENSIONS INSTALLED header + headers row)
  const extStart = discovery.findIndex(r => r[0] === 'EXTENSIONS INSTALLED') + 2
  const extRows = []
  for (let i = extStart; i < discovery.length; i++) {
    if (discovery[i].length === 0) break
    extRows.push(discovery[i])
  }

  return (
    <div className="audit-discovery">
      <div className="audit-stat-cards">
        <StatCard label="Extensions" value={stats.extensionCount} />
        <StatCard label="Rules" value={stats.ruleCount} />
        <StatCard label="Data Elements" value={stats.deCount} />
        {stats.orphanedCount > 0 && <StatCard label="Orphaned DEs" value={stats.orphanedCount} warn />}
      </div>

      {stats.vendors.length > 0 && (
        <div className="audit-section">
          <div className="audit-section-title">Tag Vendors Detected</div>
          <div className="audit-vendor-list">
            {stats.vendors.map(v => <span key={v} className="audit-vendor-chip">{v}</span>)}
          </div>
        </div>
      )}

      <div className="audit-section">
        <div className="audit-section-title">Extensions Installed</div>
        <table className="audit-table">
          <thead>
            <tr><th>Display Name</th><th>Package ID</th><th>Version</th></tr>
          </thead>
          <tbody>
            {extRows.map((row, i) => (
              <tr key={i}><td>{row[0]}</td><td className="mono">{row[1]}</td><td>{row[2]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="audit-section">
        <div className="audit-section-title">Rules by Trigger Type</div>
        <table className="audit-table">
          <thead><tr><th>Trigger Type</th><th>Count</th></tr></thead>
          <tbody>
            {(() => {
              const start = discovery.findIndex(r => r[0] === 'RULES BY TRIGGER TYPE') + 2
              return discovery.slice(start).map((row, i) => (
                <tr key={i}><td>{row[0]}</td><td>{row[1]}</td></tr>
              ))
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, warn }) {
  return (
    <div className={`audit-stat-card ${warn ? 'audit-stat-warn' : ''}`}>
      <div className="audit-stat-value">{value}</div>
      <div className="audit-stat-label">{label}</div>
    </div>
  )
}

// ── Generic sheet tab (renders aoa rows as a scrollable table) ────────────────

function SheetTab({ rows, frozenCols = 1, searchable = false }) {
  const [query, setQuery] = useState('')
  if (!rows || rows.length === 0) return <div className="panel-state">No data</div>
  const [headers, ...data] = rows
  const q = query.toLowerCase()
  const filtered = searchable && q
    ? data.filter(row => row.some(cell => String(cell ?? '').toLowerCase().includes(q)))
    : data
  return (
    <div className="audit-sheet-wrap">
      {searchable && (
        <div className="audit-search-bar">
          <input
            className="audit-search-input"
            type="text"
            placeholder="Filter…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {q && (
            <span className="audit-search-count">{filtered.length} of {data.length}</span>
          )}
        </div>
      )}
      <div className="audit-sheet-scroll">
        <table className="audit-table audit-table-sheet">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={i < frozenCols ? 'col-sticky' : ''}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, ri) => (
              <tr key={ri}>
                {headers.map((_, ci) => (
                  <td key={ci} className={ci < frozenCols ? 'col-sticky' : ''}>
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {searchable && q && filtered.length === 0 && (
          <div className="panel-state">No matches for "{query}"</div>
        )}
      </div>
    </div>
  )
}

// ── Orphaned DEs tab ──────────────────────────────────────────────────────────

function DEsTab({ rows }) {
  const [query, setQuery] = useState('')
  const [headers, ...data] = rows
  const q = query.toLowerCase()
  const match = row => !q || row[0].toLowerCase().includes(q) || (row[1] || '').toLowerCase().includes(q)

  const orphaned = data.filter(r => r[2] === 'ORPHANED' && match(r))
  const inUse    = data.filter(r => r[2] !== 'ORPHANED' && match(r))
  const total    = data.length

  return (
    <div className="audit-des">
      <div className="audit-search-bar">
        <input
          className="audit-search-input"
          type="text"
          placeholder="Filter data elements…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {q && (
          <span className="audit-search-count">{orphaned.length + inUse.length} of {total}</span>
        )}
      </div>

      {!q && orphaned.length === 0 && (
        <div className="audit-no-orphans">All data elements are referenced — none can be safely deleted.</div>
      )}

      {orphaned.length > 0 && (
        <div className="audit-section">
          <div className="audit-section-title audit-section-warn">
            Orphaned ({orphaned.length}) — safe to delete
          </div>
          <table className="audit-table">
            <thead><tr><th>Data Element Name</th><th>Extension Package</th></tr></thead>
            <tbody>
              {orphaned.map((row, i) => (
                <tr key={i} className="row-orphaned">
                  <td>{row[0]}</td><td className="mono">{row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inUse.length > 0 && (
        <div className="audit-section">
          <div className="audit-section-title">In Use ({inUse.length})</div>
          <table className="audit-table">
            <thead><tr><th>Data Element Name</th><th>Extension Package</th></tr></thead>
            <tbody>
              {inUse.map((row, i) => (
                <tr key={i}><td>{row[0]}</td><td className="mono">{row[1]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {q && orphaned.length === 0 && inUse.length === 0 && (
        <div className="panel-state">No matches for "{query}"</div>
      )}
    </div>
  )
}

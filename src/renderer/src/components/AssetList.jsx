import { useState, useRef, useEffect } from 'react'

function IndeterminateCheckbox({ checked, indeterminate, onChange }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return <input type="checkbox" ref={ref} checked={checked} onChange={onChange} />
}

export default function AssetList({
  rules, dataElements, loading,
  selectedRules, selectedDEs,
  onRulesChange, onDEsChange
}) {
  const [tab, setTab] = useState('rules')
  const [search, setSearch] = useState('')

  const filteredRules = rules.filter(r =>
    r.attributes.name.toLowerCase().includes(search.toLowerCase())
  )
  const filteredDEs = dataElements.filter(de =>
    de.attributes.name.toLowerCase().includes(search.toLowerCase())
  )

  const toggleItem = (id, set, setter) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  const allRulesChecked = filteredRules.length > 0 && filteredRules.every(r => selectedRules.has(r.id))
  const someRulesChecked = filteredRules.some(r => selectedRules.has(r.id)) && !allRulesChecked
  const toggleAllRules = e => onRulesChange(e.target.checked ? new Set(filteredRules.map(r => r.id)) : new Set())

  const allDEsChecked = filteredDEs.length > 0 && filteredDEs.every(de => selectedDEs.has(de.id))
  const someDEsChecked = filteredDEs.some(de => selectedDEs.has(de.id)) && !allDEsChecked
  const toggleAllDEs = e => onDEsChange(e.target.checked ? new Set(filteredDEs.map(de => de.id)) : new Set())

  if (loading) return <div className="panel-state">Loading assets…</div>

  return (
    <div className="asset-list">
      <div className="asset-toolbar">
        <div className="tabs">
          <button
            className={`tab ${tab === 'rules' ? 'active' : ''}`}
            onClick={() => setTab('rules')}
          >
            Rules
            <span className="badge">{selectedRules.size}/{rules.length}</span>
          </button>
          <button
            className={`tab ${tab === 'des' ? 'active' : ''}`}
            onClick={() => setTab('des')}
          >
            Data Elements
            <span className="badge">{selectedDEs.size}/{dataElements.length}</span>
          </button>
        </div>
        <input
          type="search"
          className="asset-search"
          placeholder="Filter…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {tab === 'rules' && (
        <div className="asset-items">
          {filteredRules.length > 0 && (
            <label className="asset-item select-all">
              <IndeterminateCheckbox
                checked={allRulesChecked}
                indeterminate={someRulesChecked}
                onChange={toggleAllRules}
              />
              <span className="item-name muted">Select all ({filteredRules.length})</span>
            </label>
          )}
          {filteredRules.map(rule => (
            <label key={rule.id} className="asset-item">
              <input
                type="checkbox"
                checked={selectedRules.has(rule.id)}
                onChange={() => toggleItem(rule.id, selectedRules, onRulesChange)}
              />
              <span className="item-name">{rule.attributes.name}</span>
              <span
                className={`status-pill ${rule.attributes.enabled ? 'enabled' : 'disabled'}`}
              >
                {rule.attributes.enabled ? 'on' : 'off'}
              </span>
            </label>
          ))}
          {filteredRules.length === 0 && <p className="list-empty">No rules found</p>}
        </div>
      )}

      {tab === 'des' && (
        <div className="asset-items">
          {filteredDEs.length > 0 && (
            <label className="asset-item select-all">
              <IndeterminateCheckbox
                checked={allDEsChecked}
                indeterminate={someDEsChecked}
                onChange={toggleAllDEs}
              />
              <span className="item-name muted">Select all ({filteredDEs.length})</span>
            </label>
          )}
          {filteredDEs.map(de => (
            <label key={de.id} className="asset-item">
              <input
                type="checkbox"
                checked={selectedDEs.has(de.id)}
                onChange={() => toggleItem(de.id, selectedDEs, onDEsChange)}
              />
              <span className="item-name">{de.attributes.name}</span>
              <span className="de-ext">
                {de.attributes.delegate_descriptor_id?.split('::')?.[0] || ''}
              </span>
            </label>
          ))}
          {filteredDEs.length === 0 && <p className="list-empty">No data elements found</p>}
        </div>
      )}
    </div>
  )
}

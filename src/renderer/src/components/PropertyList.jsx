import { useState, useEffect } from 'react'

export default function PropertyList({ client, companyId, selected, onSelect, exclude = [] }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    client.getProperties(companyId)
      .then(setProperties)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [companyId])

  const filtered = properties
    .filter(p => !exclude.includes(p.id))
    .filter(p => p.attributes.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.attributes.name.localeCompare(b.attributes.name))

  if (loading) return <div className="list-state">Loading properties…</div>
  if (error) return <div className="list-state error">Error: {error}</div>

  return (
    <div className="property-list">
      <div className="list-search">
        <input
          type="search"
          placeholder="Search properties…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <ul className="list-items">
        {filtered.map(p => (
          <li
            key={p.id}
            className={`list-item ${selected?.id === p.id ? 'selected' : ''}`}
            onClick={() => onSelect(p)}
          >
            <span className="item-name">{p.attributes.name}</span>
            <span className="item-meta">{p.attributes.platform || 'web'}</span>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="list-empty">
            {search ? 'No properties match' : 'No properties available'}
          </li>
        )}
      </ul>
    </div>
  )
}

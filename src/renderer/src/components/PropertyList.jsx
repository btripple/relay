import { useState, useEffect } from 'react'

export default function PropertyList({ client, companyId, selected, onSelect, exclude = [], favorites = new Set(), onToggleFavorite }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)

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
    .filter(p => !favoritesOnly || favorites.has(p.id))
    .filter(p => p.attributes.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aFav = favorites.has(a.id)
      const bFav = favorites.has(b.id)
      if (aFav && !bFav) return -1
      if (!aFav && bFav) return 1
      return a.attributes.name.localeCompare(b.attributes.name)
    })

  const emptyMessage = () => {
    if (favoritesOnly && favorites.size === 0) return 'No favorites yet — click ☆ on a property to add one'
    if (search || favoritesOnly) return 'No properties match'
    return 'No properties available'
  }

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
        <button
          className={`btn-fav-filter ${favoritesOnly ? 'active' : ''}`}
          onClick={() => setFavoritesOnly(f => !f)}
          title={favoritesOnly ? 'Show all properties' : 'Show favorites only'}
        >
          ★
        </button>
      </div>
      <ul className="list-items">
        {filtered.map(p => (
          <li
            key={p.id}
            className={`list-item ${selected?.id === p.id ? 'selected' : ''}`}
            onClick={() => onSelect(p)}
          >
            <button
              className={`btn-star ${favorites.has(p.id) ? 'active' : ''}`}
              onClick={e => { e.stopPropagation(); onToggleFavorite?.(p.id) }}
              title={favorites.has(p.id) ? 'Remove from favorites' : 'Add to favorites'}
            >
              {favorites.has(p.id) ? '★' : '☆'}
            </button>
            <span className="item-name">{p.attributes.name}</span>
            <span className="item-meta">{p.attributes.platform || 'web'}</span>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="list-empty">{emptyMessage()}</li>
        )}
      </ul>
    </div>
  )
}

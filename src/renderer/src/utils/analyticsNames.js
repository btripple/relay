// Fetches configured variable names from the Adobe Analytics Admin API (v2.0).
// Returns a lowercase-keyed map { "evar4": "Campaign Source", "prop7": "Page Name", ... }
// or null if not configured. Throws on actual API failures so callers can surface the error.

const AA_BASE = 'https://analytics.adobe.io'

async function aaGet(url, token, clientId, globalCompanyId) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': clientId,
      ...(globalCompanyId ? { 'x-proxy-global-company-id': globalCompanyId } : {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const hint = body.slice(0, 200).trim()
    const path = url.replace(AA_BASE, '').split('?')[0]
    throw new Error(`HTTP ${res.status} from ${path}${hint ? ' — ' + hint : ''}`)
  }
  return await res.json()
}

async function resolveGlobalCompanyId(token, clientId, orgId) {
  let data
  try {
    data = await aaGet(`${AA_BASE}/discovery/me`, token, clientId, null)
  } catch (err) {
    throw new Error(`Analytics discovery failed: ${err.message}`)
  }
  if (!data?.imsOrgs) throw new Error('Unexpected response from Analytics discovery API')

  for (const org of data.imsOrgs) {
    if (!orgId || org.imsOrgId === orgId) {
      const co = org.companies?.[0]
      if (co?.globalCompanyId) return co.globalCompanyId
    }
  }
  throw new Error(
    `No Analytics company found for org "${orgId || 'any'}". Check that Adobe Analytics is provisioned on this credential.`
  )
}

// Analytics 2.0 API returns ids like "variables/evar4", "variables/prop7", "metrics/event1".
// Strip the prefix to get the short key used in the mapping table.
function shortKey(id) {
  return (id || '').replace(/^(variables|metrics)\//, '').toLowerCase()
}

function extractDimensions(data) {
  const items = Array.isArray(data) ? data : (data?.dimensions || data?.elements || [])
  const map = {}
  for (const item of items) {
    const key  = shortKey(item.id)
    const name = (item.name || item.title || '').trim()
    // Only eVars and props with a meaningful admin label
    if (/^(evar|prop)\d+$/.test(key) && name && name.toLowerCase() !== key) {
      map[key] = name
    }
  }
  return map
}

function extractMetrics(data) {
  const items = Array.isArray(data) ? data : (data?.metrics || data?.elements || [])
  const map = {}
  for (const item of items) {
    const key  = shortKey(item.id)
    const name = (item.name || item.title || '').trim()
    // Only custom events with a meaningful admin label
    if (/^event\d+$/.test(key) && name && name.toLowerCase() !== key) {
      map[key] = name
    }
  }
  return map
}

export async function fetchAnalyticsVariableNames(token, clientId, orgId, rsid) {
  if (!token || !clientId || !rsid) return null

  const globalCompanyId = await resolveGlobalCompanyId(token, clientId, orgId)
  const base    = `${AA_BASE}/api/${globalCompanyId}`
  const rsidEnc = encodeURIComponent(rsid)

  const [dimData, metricData] = await Promise.all([
    aaGet(`${base}/dimensions?rsid=${rsidEnc}&locale=en_US`, token, clientId, globalCompanyId),
    aaGet(`${base}/metrics?rsid=${rsidEnc}&locale=en_US`,   token, clientId, globalCompanyId),
  ])

  const names = {
    ...extractDimensions(dimData),
    ...extractMetrics(metricData),
  }

  return Object.keys(names).length > 0 ? names : null
}

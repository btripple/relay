// Extracts Adobe Analytics variables from Launch rule components, extensions,
// and custom JavaScript code. Returns a deduplicated variable list with
// source attribution for use in the Web SDK migration mapping workflow.

// ── Structured Set Variables action ──────────────────────────────────────────

function parseTrackerProperties(tp, source, ruleId, ruleName) {
  const out = []
  const push = (variable, variableType, value) =>
    out.push({ variable, variableType, value: (value || '').trim(), source, ruleId, ruleName })

  for (const ev of (tp.eVars     || [])) if (ev.name) push(ev.name, 'eVar', ev.value)
  for (const p  of (tp.props     || [])) if (p.name)  push(p.name,  'prop', p.value)
  for (const e  of (tp.events    || [])) if (e.name)  push(e.name,  'event', '')
  for (const h  of (tp.hier      || [])) if (h.name)  push(h.name,  'hier', h.value)
  for (const l  of (tp.listProps || tp.lists || [])) if (l.name) push(l.name, 'list', l.value)
  for (const cd of (tp.contextData || [])) if (cd.name) push(`contextData.${cd.name}`, 'contextData', cd.value)

  const STD = ['pageName', 'channel', 'server', 'campaign', 'purchaseID', 'transactionID', 'pageType', 'zip', 'state']
  for (const name of STD) if (tp[name]?.value) push(name, 'standard', tp[name].value)
  if (tp.products?.value) push('products', 'products', tp.products.value)

  return out
}

// ── Custom JavaScript code scanning ──────────────────────────────────────────

function parseCustomCode(code, source, ruleId, ruleName) {
  const out = []
  if (!code || typeof code !== 'string') return out
  const push = (variable, variableType, value) =>
    out.push({ variable, variableType, value: (value || '').trim(), source, ruleId, ruleName })

  // Events: s.events = 'event1,event2' or s.events += 'event3'
  // Also handles numeric event values: event12:5
  for (const m of code.matchAll(/(?:window\.)?s\.events?\s*[+]?=\s*["']?([^"';\n]+)["']?/g)) {
    for (const token of m[1].split(',')) {
      const name = token.trim().split(':')[0].trim()
      if (name) push(name, 'event', '')
    }
  }

  // eVars: s.eVar1 = ... or s["eVar1"] = ...
  for (const m of code.matchAll(/(?:window\.)?s\.eVar(\d{1,3})\s*=\s*([^;\n]+)/g))
    push(`eVar${m[1]}`, 'eVar', m[2])
  for (const m of code.matchAll(/(?:window\.)?s\[["'](eVar\d+)["']\]\s*=\s*([^;\n]+)/g))
    push(m[1], 'eVar', m[2])

  // Props
  for (const m of code.matchAll(/(?:window\.)?s\.prop(\d{1,3})\s*=\s*([^;\n]+)/g))
    push(`prop${m[1]}`, 'prop', m[2])
  for (const m of code.matchAll(/(?:window\.)?s\[["'](prop\d+)["']\]\s*=\s*([^;\n]+)/g))
    push(m[1], 'prop', m[2])

  // hier / list
  for (const m of code.matchAll(/(?:window\.)?s\.hier(\d)\s*=\s*([^;\n]+)/g))
    push(`hier${m[1]}`, 'hier', m[2])
  for (const m of code.matchAll(/(?:window\.)?s\.list(\d)\s*=\s*([^;\n]+)/g))
    push(`list${m[1]}`, 'list', m[2])

  // contextData
  for (const m of code.matchAll(/(?:window\.)?s\.contextData\s*\[["']([^"']+)["']\]\s*=\s*([^;\n]+)/g))
    push(`contextData.${m[1]}`, 'contextData', m[2])

  // Standard variables (pageName, channel, etc.)
  const STD = ['pageName', 'channel', 'campaign', 'server', 'purchaseID', 'transactionID', 'pageType', 'zip', 'state']
  for (const name of STD) {
    for (const m of code.matchAll(new RegExp(`(?:window\\.)?s\\.${name}\\s*=\\s*([^;\\n]+)`, 'g')))
      push(name, 'standard', m[1])
  }

  // products
  for (const m of code.matchAll(/(?:window\.)?s\.products?\s*=\s*([^;\n]+)/g))
    push('products', 'products', m[1])

  return out
}

// Extracts the custom code string from a rule component settings object
function extractCode(settingsStr) {
  if (!settingsStr) return null
  let s
  try { s = JSON.parse(settingsStr) } catch { return null }
  return s.source || s.script || s.customCode?.source || s.customCode?.script || null
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzeAAMigration({ rules, ruleComponents, extensions }) {
  const allRecords = []
  const aaRules = []

  // 1. Extension-level global variables (AA extension config)
  const aaExt = extensions.find(e => {
    const pkg = (e._packageName || '').toLowerCase()
    return pkg === 'adobe-analytics' || pkg === 'adobe-analytics-extension'
  })

  if (aaExt) {
    try {
      const s = JSON.parse(aaExt.attributes.settings || '{}')
      if (s.trackerProperties) {
        allRecords.push(...parseTrackerProperties(
          s.trackerProperties, 'extension-global', null, 'Extension Global Variables'
        ))
      }
    } catch {}
  }

  // 2. Rule actions
  for (const rule of rules) {
    const comps   = ruleComponents[rule.id] || []
    const actions = comps.filter(c => (c.attributes.delegate_descriptor_id || '').includes('::actions::'))

    let hasSetVars  = false
    let hasBeacon   = false
    let beaconType  = null

    for (const action of actions) {
      const ddi = action.attributes.delegate_descriptor_id || ''
      let settings
      try { settings = JSON.parse(action.attributes.settings || '{}') } catch { continue }

      if (ddi === 'adobe-analytics::actions::set-variables') {
        hasSetVars = true
        if (settings.trackerProperties) {
          allRecords.push(...parseTrackerProperties(
            settings.trackerProperties, 'set-variables', rule.id, rule.attributes.name
          ))
        }
        // Custom code block inside Set Variables action
        const code = settings.customCode?.source || settings.customCode?.script
        if (code) allRecords.push(...parseCustomCode(code, 'set-variables-code', rule.id, rule.attributes.name))

      } else if (ddi === 'adobe-analytics::actions::send-beacon') {
        hasBeacon  = true
        beaconType = settings.type || 'page'

      } else {
        // Any other action in any rule — scan its custom code for s. assignments.
        // This catches variables set outside the structured Set Variables action.
        const code = extractCode(action.attributes.settings)
        if (code) allRecords.push(...parseCustomCode(code, 'custom-code', rule.id, rule.attributes.name))
      }
    }

    if (hasSetVars || hasBeacon) {
      aaRules.push({
        id:         rule.id,
        name:       rule.attributes.name,
        enabled:    rule.attributes.enabled,
        hasSetVars,
        hasBeacon,
        beaconType,
      })
    }
  }

  // 3. Deduplicate variables (case-insensitive key, preserve first-seen casing)
  const varMap = new Map()
  for (const rec of allRecords) {
    const key = rec.variable.toLowerCase()
    if (!varMap.has(key)) {
      varMap.set(key, {
        variable:     rec.variable,
        variableType: rec.variableType,
        exampleValue: rec.value,
        allValues:    rec.value ? [rec.value] : [],
        rulesUsing:   rec.ruleName ? [rec.ruleName] : [],
        sources:      new Set([rec.source]),
      })
    } else {
      const v = varMap.get(key)
      if (rec.value && !v.allValues.includes(rec.value)) v.allValues.push(rec.value)
      if (rec.ruleName && !v.rulesUsing.includes(rec.ruleName)) v.rulesUsing.push(rec.ruleName)
      v.sources.add(rec.source)
    }
  }

  // 4. Sort: standard → eVar → prop → event → products → hier → list → contextData
  const TYPE_ORDER = { standard: 0, eVar: 1, prop: 2, event: 3, products: 4, hier: 5, list: 6, contextData: 7 }
  const variables = [...varMap.values()]
    .map(v => ({ ...v, sources: [...v.sources] }))
    .sort((a, b) => {
      const d = (TYPE_ORDER[a.variableType] ?? 8) - (TYPE_ORDER[b.variableType] ?? 8)
      if (d !== 0) return d
      return a.variable.localeCompare(b.variable, undefined, { numeric: true, sensitivity: 'base' })
    })

  // 5. Surface important warnings
  const warnings = []
  if (!aaExt) {
    warnings.push('No Adobe Analytics extension found. Variables detected from rule actions only.')
  }
  if (variables.some(v => v.variableType === 'products')) {
    warnings.push('"products" variable detected — its semicolon-delimited format requires manual mapping to productListItems[].')
  }
  const codeVars = variables.filter(v => v.sources.some(s => s.includes('custom-code')))
  if (codeVars.length) {
    warnings.push(`${codeVars.length} variable(s) detected in custom JavaScript — example values may be code expressions, not literal strings.`)
  }

  return { hasAAExtension: !!aaExt, aaExtensionName: aaExt?.attributes?.name || null, aaRules, variables, warnings }
}

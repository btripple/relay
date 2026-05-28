import * as XLSX from 'xlsx'

// ── Vendor detection ─────────────────────────────────────────────────────────

const VENDOR_MAP = [
  ['adobe-analytics',           'Adobe Analytics'],
  ['adobe-alloy',               'Adobe Experience Platform Web SDK'],
  ['adobe-target',              'Adobe Target'],
  ['adobe-media-analytics-3x',  'Adobe Media Analytics 3.x'],
  ['adobe-media-analytics',     'Adobe Media Analytics'],
  ['adobe-audience-manager',    'Adobe Audience Manager'],
  ['adobe-ecid',                'Experience Cloud ID Service'],
  ['adobe-campaign-classic',    'Adobe Campaign Classic'],
  ['adobe-campaign-standard',   'Adobe Campaign Standard'],
  ['google-universal-analytics','Google Universal Analytics'],
  ['google-analytics-v2',       'Google Analytics 4'],
  ['google-analytics',          'Google Analytics'],
  ['google-gtag',               'Google Tag (GA4/Ads)'],
  ['google-ads-remarketing',    'Google Ads Remarketing'],
  ['google-adwords',            'Google Ads'],
  ['facebook-pixel',            'Meta Pixel (Facebook)'],
  ['meta-pixel',                'Meta Pixel'],
  ['linkedin-insight-tag',      'LinkedIn Insight Tag'],
  ['twitter-universal-website-tag', 'X (Twitter) Pixel'],
  ['pinterest-tag',             'Pinterest Tag'],
  ['tiktok-pixel',              'TikTok Pixel'],
  ['snapchat-pixel',            'Snapchat Pixel'],
  ['hotjar',                    'Hotjar'],
  ['segment-io',                'Segment'],
  ['segment',                   'Segment'],
  ['heap',                      'Heap Analytics'],
  ['fullstory',                 'FullStory'],
  ['mparticle-web',             'mParticle'],
  ['amplitude',                 'Amplitude'],
  ['mixpanel',                  'Mixpanel'],
]

function detectVendors(extensions) {
  const found = new Set()
  for (const ext of extensions) {
    const pkg = (ext._packageName || '').toLowerCase()
    for (const [key, label] of VENDOR_MAP) {
      if (pkg === key || pkg.startsWith(key)) { found.add(label); break }
    }
  }
  return [...found].sort()
}

// ── Trigger / component helpers ───────────────────────────────────────────────

const TRIGGER_COLS = [
  { id: 'core::events::direct-call',   label: 'Direct Call' },
  { id: 'core::events::click',         label: 'Click' },
  { id: 'core::events::custom-event',  label: 'Custom Event' },
  { id: 'core::events::window-loaded', label: 'Window Loaded' },
  { id: 'core::events::dom-ready',     label: 'DOM Ready' },
  { id: 'core::events::library-loaded',label: 'Library Loaded' },
  { id: 'core::events::page-bottom',   label: 'Page Bottom' },
  { id: 'core::events::history-change',label: 'History Change (SPA)' },
  { id: 'adobe-client-data-layer::events::data-pushed', label: 'Adobe Data Layer' },
]

const TRIGGER_LABELS = {
  'core::events::direct-call':    'Direct Call',
  'core::events::click':          'Click',
  'core::events::custom-event':   'Custom Event',
  'core::events::window-loaded':  'Window Loaded',
  'core::events::dom-ready':      'DOM Ready',
  'core::events::library-loaded': 'Library Loaded',
  'core::events::page-bottom':    'Page Bottom',
  'core::events::history-change': 'History Change (SPA)',
  'adobe-client-data-layer::events::data-pushed': 'Adobe Data Layer',
  'core::events::hover':          'Hover',
  'core::events::focus':          'Focus',
  'core::events::blur':           'Blur',
  'core::events::change':         'Change',
  'core::events::submit':         'Form Submit',
  'core::events::keypress':       'Key Press',
  'core::events::element-exists': 'Element Exists',
  'core::events::enters-viewport':'Enters Viewport',
  'core::events::media-time-played': 'Media Time Played',
  'core::events::data-element-change': 'Data Element Change',
  'core::events::scroll':         'Scroll',
}

const URL_CONDITIONS = [
  'core::conditions::path-and-querystring',
  'core::conditions::uri',
  'core::conditions::hostname',
  'core::conditions::query-string-parameter',
  'core::conditions::subdomain',
  'core::conditions::url-without-query-string',
]

function compKind(ddi) { return (ddi || '').split('::')[1] }  // 'events' | 'conditions' | 'actions'

function triggerLabel(ddi) {
  return TRIGGER_LABELS[ddi] || (ddi || '').split('::').pop().replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function dePkg(de) {
  return de._packageName || (de.attributes.delegate_descriptor_id || '').split('::')[0] || ''
}

// ── Sheet 1: Property Discovery ───────────────────────────────────────────────

function buildDiscovery({ extensions, rules, dataElements, ruleComponents, propertyName }) {
  const rows = []
  const kv = (k, v) => rows.push([k, v ?? ''])
  const h  = (t) => rows.push([t])
  const blank = () => rows.push([])

  kv('Property', propertyName)
  kv('Audit Date', new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }))
  blank()

  // Summary stats
  h('SUMMARY')
  kv('Total Extensions', extensions.length)
  kv('Total Data Elements', dataElements.length)
  kv('Total Rules', rules.length)
  blank()

  // Tag vendors
  const vendors = detectVendors(extensions)
  h('TAG VENDORS DETECTED')
  rows.push(['Vendor'])
  if (vendors.length === 0) rows.push(['(none detected)'])
  else vendors.forEach(v => rows.push([v]))
  blank()

  // Extensions installed
  h('EXTENSIONS INSTALLED')
  rows.push(['Display Name', 'Package ID', 'Version'])
  for (const ext of extensions) {
    rows.push([
      ext.attributes.name || ext._packageName || ext.id,
      ext._packageName || '',
      ext.attributes.version || ''
    ])
  }
  blank()

  // Rules by trigger type
  const triggerCounts = {}
  for (const rule of rules) {
    const comps = ruleComponents[rule.id] || []
    const events = comps.filter(c => compKind(c.attributes.delegate_descriptor_id) === 'events')
    if (events.length === 0) {
      triggerCounts['(no trigger)'] = (triggerCounts['(no trigger)'] || 0) + 1
    } else {
      for (const e of events) {
        const lbl = triggerLabel(e.attributes.delegate_descriptor_id)
        triggerCounts[lbl] = (triggerCounts[lbl] || 0) + 1
      }
    }
  }
  h('RULES BY TRIGGER TYPE')
  rows.push(['Trigger Type', 'Rule Count'])
  Object.entries(triggerCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => rows.push([type, count]))

  return rows
}

// ── Sheet 2: Rules Inventory ──────────────────────────────────────────────────

function buildRulesInventory({ rules, ruleComponents }) {
  const headers = [
    'Rule Name', 'Enabled',
    ...TRIGGER_COLS.map(t => t.label),
    'Other Triggers',
    'All Trigger Types',
    '# Actions', '# Conditions',
    'Has URL Condition',
    'Has Adobe Analytics Action',
    'Has AEP Web SDK Action',
  ]

  const knownTriggerIds = new Set(TRIGGER_COLS.map(t => t.id))

  const dataRows = rules.map(rule => {
    const comps   = ruleComponents[rule.id] || []
    const events  = comps.filter(c => compKind(c.attributes.delegate_descriptor_id) === 'events')
    const conds   = comps.filter(c => compKind(c.attributes.delegate_descriptor_id) === 'conditions')
    const actions = comps.filter(c => compKind(c.attributes.delegate_descriptor_id) === 'actions')
    const eventIds = new Set(events.map(e => e.attributes.delegate_descriptor_id))

    const otherTriggers = events
      .filter(e => !knownTriggerIds.has(e.attributes.delegate_descriptor_id))
      .map(e => triggerLabel(e.attributes.delegate_descriptor_id))

    return [
      rule.attributes.name,
      rule.attributes.enabled ? 'Yes' : 'No',
      ...TRIGGER_COLS.map(t => eventIds.has(t.id) ? 'Y' : ''),
      otherTriggers.join(', '),
      events.map(e => triggerLabel(e.attributes.delegate_descriptor_id)).join(', '),
      actions.length,
      conds.length,
      conds.some(c => URL_CONDITIONS.includes(c.attributes.delegate_descriptor_id)) ? 'Y' : '',
      actions.some(a => (a.attributes.delegate_descriptor_id || '').startsWith('adobe-analytics::')) ? 'Y' : '',
      actions.some(a => (a.attributes.delegate_descriptor_id || '').startsWith('adobe-alloy::'))      ? 'Y' : '',
    ]
  })

  return [headers, ...dataRows]
}

// ── Sheet 3: Orphaned Data Elements ──────────────────────────────────────────

function buildOrphanedDEs({ dataElements, ruleComponents }) {
  const allSettings = []
  for (const comps of Object.values(ruleComponents)) {
    for (const c of comps) {
      if (c.attributes.settings) allSettings.push(c.attributes.settings)
    }
  }
  for (const de of dataElements) {
    if (de.attributes.settings) allSettings.push(de.attributes.settings)
  }
  const bigStr = allSettings.join('\n')

  const classified = dataElements.map(de => {
    const name = de.attributes.name
    const referenced =
      bigStr.includes(`%${name}%`) ||
      bigStr.includes(`getVar('${name}')`) ||
      bigStr.includes(`getVar("${name}")`) ||
      bigStr.includes(`getVar(\`${name}\`)`)
    return { de, name, pkg: dePkg(de), referenced }
  })

  const orphaned = classified.filter(x => !x.referenced).sort((a, b) => a.name.localeCompare(b.name))
  const inUse    = classified.filter(x =>  x.referenced).sort((a, b) => a.name.localeCompare(b.name))

  const headers = ['Data Element Name', 'Extension Package', 'Status', 'Notes']
  const rows = [headers]
  for (const { name, pkg } of orphaned) {
    rows.push([name, pkg, 'ORPHANED', 'No references found in rules or other data elements'])
  }
  for (const { name, pkg } of inUse) {
    rows.push([name, pkg, 'In Use', ''])
  }
  return { rows, orphanedCount: orphaned.length }
}

// ── Sheet 4: Rule Name Audit ──────────────────────────────────────────────────

function buildNameAudit({ rules }) {
  const normalize = name => name
    .toLowerCase()
    .replace(/\s*[-–|]\s*(copy|duplicate|test|backup|\d+|v\d+\.?\d*)$/i, '')
    .replace(/\s+\d+$/, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const groups = {}
  for (const rule of rules) {
    const key = normalize(rule.attributes.name)
    ;(groups[key] = groups[key] || []).push(rule)
  }

  const ruleGroup = {}
  const ruleNotes = {}
  let groupNum = 1

  for (const groupRules of Object.values(groups)) {
    if (groupRules.length > 1) {
      const label = `Group ${groupNum++}`
      for (const r of groupRules) ruleGroup[r.id] = label
    }
  }
  for (const rule of rules) {
    const notes = []
    if (/\(copy\)|-\s*copy/i.test(rule.attributes.name)) notes.push('Contains "copy" marker')
    if (ruleGroup[rule.id]) notes.push('Possible duplicate')
    if (notes.length) ruleNotes[rule.id] = notes.join('; ')
  }

  const headers = ['Rule Name', 'Enabled', 'Normalized Name', 'Similarity Group', 'Notes']
  const dataRows = [...rules]
    .sort((a, b) => a.attributes.name.localeCompare(b.attributes.name))
    .map(rule => [
      rule.attributes.name,
      rule.attributes.enabled ? 'Yes' : 'No',
      normalize(rule.attributes.name),
      ruleGroup[rule.id] || '',
      ruleNotes[rule.id] || '',
    ])

  return [headers, ...dataRows]
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildAuditData(auditRaw, propertyName) {
  const discovery      = buildDiscovery({ ...auditRaw, propertyName })
  const rulesInventory = buildRulesInventory(auditRaw)
  const { rows: orphanedDEs, orphanedCount } = buildOrphanedDEs(auditRaw)
  const nameAudit      = buildNameAudit(auditRaw)

  return {
    discovery,
    rulesInventory,
    orphanedDEs,
    nameAudit,
    stats: {
      extensionCount: auditRaw.extensions.length,
      ruleCount: auditRaw.rules.length,
      deCount: auditRaw.dataElements.length,
      vendors: detectVendors(auditRaw.extensions),
      orphanedCount,
    }
  }
}

export function exportAuditToExcel(auditData, propertyName) {
  const wb = XLSX.utils.book_new()

  const addSheet = (rows, name) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    // Auto-fit column widths
    ws['!cols'] = rows.reduce((cols, row) => {
      row.forEach((cell, i) => {
        const len = String(cell ?? '').length
        if (!cols[i] || cols[i].wch < len) cols[i] = { wch: Math.min(len + 2, 60) }
      })
      return cols
    }, [])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  addSheet(auditData.discovery,      'Property Discovery')
  addSheet(auditData.rulesInventory, 'Rules Inventory')
  addSheet(auditData.orphanedDEs,    'Orphaned Data Elements')
  addSheet(auditData.nameAudit,      'Rule Name Audit')

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
}

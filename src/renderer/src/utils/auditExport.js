import * as XLSX from 'xlsx-js-style'

// ── Vendor detection ─────────────────────────────────────────────────────────

const VENDOR_MAP = [
  // ── Adobe ────────────────────────────────────────────────────────────────────
  ['adobe-analytics',                    'Adobe Analytics'],
  ['adobe-alloy',                        'Adobe Experience Platform Web SDK'],
  ['adobe-target',                       'Adobe Target'],
  ['adobe-media-analytics-3x',           'Adobe Media Analytics 3.x'],
  ['adobe-media-analytics',             'Adobe Media Analytics'],
  ['adobe-audience-manager',             'Adobe Audience Manager'],
  ['adobe-ecid',                         'Experience Cloud ID Service'],
  ['adobe-campaign-classic',             'Adobe Campaign Classic'],
  ['adobe-campaign-standard',            'Adobe Campaign Standard'],
  ['adobe-client-data-layer',            'Adobe Client Data Layer'],

  // ── Google Analytics ─────────────────────────────────────────────────────────
  ['google-analytics-v2',                'Google Analytics 4'],
  ['google-universal-analytics',         'Google Universal Analytics'],
  ['google-analytics',                   'Google Analytics'],

  // ── Google Ads / Conversion ──────────────────────────────────────────────────
  // More specific prefixes first so startsWith doesn't short-circuit
  ['google-ads-remarketing',             'Google Ads Remarketing'],
  ['google-ads-conversion',              'Google Ads Conversion Tracking'],
  ['google-ads',                         'Google Ads'],
  ['google-adwords-remarketing',         'Google Ads Remarketing'],
  ['google-adwords-conversion',          'Google Ads Conversion Tracking'],
  ['google-adwords',                     'Google Ads'],

  // ── Google Tag / Floodlight / Campaign Manager ───────────────────────────────
  ['google-gtag',                        'Google Analytics 4'],
  ['google-tag',                         'Google Tag'],
  ['google-campaign-manager',            'Google Campaign Manager 360 (Floodlight)'],
  ['google-floodlight',                  'Google Floodlight'],
  ['floodlight',                         'Google Floodlight'],
  ['dcm-floodlight',                     'Google Campaign Manager 360 (Floodlight)'],
  ['dcm',                                'Google Campaign Manager 360'],
  ['google-dcm',                         'Google Campaign Manager 360 (Floodlight)'],

  // ── Google Marketing Platform ─────────────────────────────────────────────────
  ['google-display-video',               'Google Display & Video 360'],
  ['google-search-ads',                  'Google Search Ads 360'],
  ['google-sa360',                       'Google Search Ads 360'],
  ['google-dv360',                       'Google Display & Video 360'],
  ['google-optimize',                    'Google Optimize'],
  ['google-tag-manager',                 'Google Tag Manager'],

  // ── Meta / Facebook ───────────────────────────────────────────────────────────
  ['meta-conversions-api',               'Meta Conversions API'],
  ['facebook-conversions-api',           'Meta Conversions API'],
  ['meta-pixel',                         'Meta Pixel'],
  ['facebook-pixel',                     'Meta Pixel'],
  ['meta',                               'Meta'],

  // ── Microsoft ─────────────────────────────────────────────────────────────────
  ['microsoft-advertising',              'Microsoft Advertising'],
  ['microsoft-clarity',                  'Microsoft Clarity'],
  ['bing-ads',                           'Microsoft Advertising (Bing Ads)'],
  ['bing',                               'Microsoft Advertising'],

  // ── Social & Commerce Pixels ─────────────────────────────────────────────────
  ['linkedin-insight-tag',               'LinkedIn Insight Tag'],
  ['linkedin',                           'LinkedIn'],
  ['twitter-universal-website-tag',      'X (Twitter) Pixel'],
  ['twitter',                            'X (Twitter)'],
  ['pinterest-tag',                      'Pinterest Tag'],
  ['pinterest',                          'Pinterest'],
  ['tiktok-pixel',                       'TikTok Pixel'],
  ['tiktok',                             'TikTok'],
  ['snapchat-pixel',                     'Snapchat Pixel'],
  ['snapchat',                           'Snapchat'],
  ['reddit-pixel',                       'Reddit Pixel'],
  ['reddit',                             'Reddit'],
  ['amazon-publisher-services',          'Amazon Publisher Services'],
  ['amazon-ads',                         'Amazon Ads'],
  ['amazon',                             'Amazon'],

  // ── DSP / Programmatic ───────────────────────────────────────────────────────
  ['the-trade-desk',                     'The Trade Desk'],
  ['trade-desk',                         'The Trade Desk'],
  ['tradedesk',                          'The Trade Desk'],
  ['criteo-onetag',                      'Criteo OneTag'],
  ['criteo',                             'Criteo'],
  ['mediamath',                          'MediaMath'],
  ['appnexus',                           'Xandr (AppNexus)'],
  ['xandr',                              'Xandr'],
  ['ttd',                                'The Trade Desk'],

  // ── Analytics & Optimization ─────────────────────────────────────────────────
  ['hotjar',                             'Hotjar'],
  ['heap',                               'Heap Analytics'],
  ['fullstory',                          'FullStory'],
  ['amplitude',                          'Amplitude'],
  ['mixpanel',                           'Mixpanel'],
  ['segment-io',                         'Segment'],
  ['segment',                            'Segment'],
  ['mparticle-web',                      'mParticle'],
  ['mparticle',                          'mParticle'],
  ['rudderstack',                        'RudderStack'],
  ['vwo',                                'VWO (Visual Website Optimizer)'],
  ['optimizely',                         'Optimizely'],
  ['qualtrics',                          'Qualtrics'],
  ['comscore',                           'comScore'],
  ['quantcast',                          'Quantcast'],
  ['nielsen',                            'Nielsen'],
  ['contentsquare',                      'Contentsquare'],
  ['mouseflow',                          'Mouseflow'],
  ['clarity',                            'Microsoft Clarity'],
  ['crazyegg',                           'Crazy Egg'],
  ['crazy-egg',                          'Crazy Egg'],
  ['logrocket',                          'LogRocket'],
  ['pendo',                              'Pendo'],
  ['intercom',                           'Intercom'],

  // ── CRM / Marketing Automation ───────────────────────────────────────────────
  ['salesforce-interaction-studio',      'Salesforce Interaction Studio'],
  ['interaction-studio',                 'Salesforce Interaction Studio'],
  ['salesforce-marketing-cloud',         'Salesforce Marketing Cloud'],
  ['pardot',                             'Salesforce Pardot'],
  ['hubspot',                            'HubSpot'],
  ['marketo',                            'Marketo'],
  ['eloqua',                             'Oracle Eloqua'],
  ['braze',                              'Braze'],
  ['klaviyo',                            'Klaviyo'],
  ['mailchimp',                          'Mailchimp'],
  ['dotdigital',                         'Dotdigital'],
]

// Patterns scanned against all code strings (rule component source, raw settings JSON,
// extension settings, data element settings).
// Each entry: [regex, vendor label]
const CODE_VENDOR_PATTERNS = [

  // ── Google Analytics ─────────────────────────────────────────────────────────
  [/google-analytics\.com\/(analytics|ga)\.js/i,   'Google Analytics (UA)'],
  [/GoogleAnalyticsObject/,                          'Google Analytics (UA)'],

  // ── Google Tag Manager ────────────────────────────────────────────────────────
  [/googletagmanager\.com\/gtm\.js/i,               'Google Tag Manager'],
  [/googletagmanager\.com\/ns\.html/i,              'Google Tag Manager'],

  // ── Google Analytics 4 (gtag.js / G- measurement IDs) ───────────────────────
  // gtag.js is GA4's library; G-XXXXXXXXX is the GA4 measurement ID format
  [/googletagmanager\.com\/gtag\/js/i,              'Google Analytics 4'],
  [/\bG-[A-Z0-9]{5,15}\b/,                         'Google Analytics 4'],
  [/\bgtag\s*\(/,                                   'Google Analytics 4'],

  // ── Google Ads conversion tracking ───────────────────────────────────────────
  // AW-XXXXXXXXX is the Google Ads conversion ID format (appears in send_to values)
  [/\bAW-\d{6,12}\b/,                               'Google Ads'],
  [/googleadservices\.com/i,                        'Google Ads'],
  [/googlesyndication\.com/i,                       'Google Ads'],
  [/google_conversion_id/i,                         'Google Ads'],
  [/google_remarketing_only/i,                      'Google Ads'],

  // ── Google Campaign Manager 360 / Floodlight ──────────────────────────────────
  // DC-XXXXXXX is the Campaign Manager advertiser ID format (appears in send_to values)
  [/\bDC-\d{5,12}\b/,                               'Google Campaign Manager 360 (Floodlight)'],
  [/doubleclick\.net/i,                             'Google Campaign Manager 360 (Floodlight)'],
  [/ad\.doubleclick\.net/i,                         'Google Campaign Manager 360 (Floodlight)'],
  [/fls\.doubleclick\.net/i,                        'Google Campaign Manager 360 (Floodlight)'],
  [/campaign-manager\b/i,                           'Google Campaign Manager 360 (Floodlight)'],
  [/\/ddm\/activity/i,                              'Google Campaign Manager 360 (Floodlight)'],

  // ── Meta / Facebook ───────────────────────────────────────────────────────────
  [/connect\.facebook\.net/i,                       'Meta Pixel'],
  [/facebook\.com\/tr[\/?]/i,                       'Meta Pixel'],
  [/\bfbq\s*\(/,                                    'Meta Pixel'],
  [/_fbq\b/,                                        'Meta Pixel'],
  [/facebook\.com\/plugins/i,                       'Meta Pixel'],

  // ── LinkedIn ──────────────────────────────────────────────────────────────────
  [/snap\.licdn\.com/i,                             'LinkedIn Insight Tag'],
  [/px\.ads\.linkedin\.com/i,                       'LinkedIn Insight Tag'],
  [/_linkedin_partner_id/,                          'LinkedIn Insight Tag'],
  [/linkedin\.com\/px/i,                            'LinkedIn Insight Tag'],

  // ── X / Twitter ───────────────────────────────────────────────────────────────
  [/static\.ads-twitter\.com/i,                     'X (Twitter) Pixel'],
  [/t\.co\/i\/adsct/i,                              'X (Twitter) Pixel'],
  [/\btwq\s*\(/,                                    'X (Twitter) Pixel'],

  // ── TikTok ────────────────────────────────────────────────────────────────────
  [/analytics\.tiktok\.com/i,                       'TikTok Pixel'],
  [/\bttq\s*\./,                                    'TikTok Pixel'],

  // ── Snapchat ──────────────────────────────────────────────────────────────────
  [/sc-static\.net/i,                               'Snapchat Pixel'],
  [/\bsnaptr\s*\(/,                                 'Snapchat Pixel'],

  // ── Pinterest ─────────────────────────────────────────────────────────────────
  [/ct\.pinterest\.com/i,                           'Pinterest Tag'],
  [/s\.pinimg\.com/i,                               'Pinterest Tag'],
  [/\bpintrk\s*\(/,                                 'Pinterest Tag'],

  // ── Reddit ────────────────────────────────────────────────────────────────────
  [/rdt\.li/i,                                      'Reddit Pixel'],
  [/\brdt\s*\(/,                                    'Reddit Pixel'],

  // ── Microsoft Advertising / Bing UET ─────────────────────────────────────────
  [/bat\.bing\.com/i,                               'Microsoft Advertising (Bing Ads)'],
  [/\buetq?\s*\(/,                                  'Microsoft Advertising (Bing Ads)'],
  [/microsoft\.com\/uetq/i,                         'Microsoft Advertising (Bing Ads)'],

  // ── Microsoft Clarity ─────────────────────────────────────────────────────────
  [/clarity\.ms/i,                                  'Microsoft Clarity'],

  // ── The Trade Desk ────────────────────────────────────────────────────────────
  [/insight\.adsrvr\.org/i,                         'The Trade Desk'],
  [/js\.adsrvr\.org/i,                              'The Trade Desk'],
  [/pixel\.adsrvr\.org/i,                           'The Trade Desk'],

  // ── AdRoll ────────────────────────────────────────────────────────────────────
  [/s\.adroll\.com/i,                               'AdRoll'],
  [/d\.adroll\.com/i,                               'AdRoll'],
  [/pixel\.adroll\.com/i,                           'AdRoll'],
  [/adroll\.com/i,                                  'AdRoll'],
  [/\b__adroll\b/,                                  'AdRoll'],
  [/\badroll_adv_id\b/,                             'AdRoll'],

  // ── Criteo ────────────────────────────────────────────────────────────────────
  [/static\.criteo\.net/i,                          'Criteo'],
  [/sslwidget\.criteo\.com/i,                       'Criteo'],
  [/dis\.criteo\.com/i,                             'Criteo'],
  [/\bCriteo\b/,                                    'Criteo'],

  // ── Amazon Ads ────────────────────────────────────────────────────────────────
  [/amazon-adsystem\.com/i,                         'Amazon Ads'],
  [/aax\.amazon-adsystem\.com/i,                    'Amazon Ads'],

  // ── Xandr / AppNexus ──────────────────────────────────────────────────────────
  [/secure\.adnxs\.com/i,                           'Xandr (AppNexus)'],
  [/acdn\.adnxs\.com/i,                             'Xandr (AppNexus)'],
  [/ib\.adnxs\.com/i,                               'Xandr (AppNexus)'],

  // ── MediaMath ─────────────────────────────────────────────────────────────────
  [/pixel\.mathtag\.com/i,                          'MediaMath'],
  [/ad\.mathtag\.com/i,                             'MediaMath'],

  // ── Yahoo / Verizon Media DSP ─────────────────────────────────────────────────
  [/sp\.analytics\.yahoo\.com/i,                    'Yahoo Advertising'],
  [/pixel\.advertising\.com/i,                      'Yahoo Advertising'],
  [/s\.yimg\.com\/uni\/p/i,                         'Yahoo Advertising'],

  // ── Commission Junction / CJ Affiliate ───────────────────────────────────────
  [/anrdoezrs\.net/i,                               'CJ Affiliate'],
  [/dpbolvw\.net/i,                                 'CJ Affiliate'],
  [/emjcd\.com/i,                                   'CJ Affiliate'],
  [/qksrv\.net/i,                                   'CJ Affiliate'],
  [/cj\.com\/1\/display/i,                          'CJ Affiliate'],

  // ── Impact (formerly Impact Radius) ──────────────────────────────────────────
  [/uii\.impactradius-event\.com/i,                 'Impact'],
  [/impactradius\.com/i,                            'Impact'],
  [/impact\.com\/u\//i,                             'Impact'],

  // ── Rakuten Advertising ───────────────────────────────────────────────────────
  [/tag\.rmp\.rakuten\.com/i,                       'Rakuten Advertising'],
  [/pixel\.rakutenmarketing\.com/i,                 'Rakuten Advertising'],
  [/r\.r10s\.jp/i,                                  'Rakuten Advertising'],

  // ── DoubleVerify ──────────────────────────────────────────────────────────────
  [/cdn\.doubleverify\.com/i,                       'DoubleVerify'],
  [/pub\.doubleverify\.com/i,                       'DoubleVerify'],

  // ── Integral Ad Science (IAS) ─────────────────────────────────────────────────
  [/pixel\.adsafeprotected\.com/i,                  'Integral Ad Science (IAS)'],
  [/cdn\.adsafeprotected\.com/i,                    'Integral Ad Science (IAS)'],

  // ── Sizmek / Amazon DSP ───────────────────────────────────────────────────────
  [/tags\.sizmek\.com/i,                            'Sizmek / Amazon DSP'],
  [/secure-ds\.serving-sys\.com/i,                  'Sizmek / Amazon DSP'],

  // ── comScore ──────────────────────────────────────────────────────────────────
  [/scorecardresearch\.com/i,                       'comScore'],
  [/comscore\.com/i,                                'comScore'],
  [/sb\.scorecardresearch\.com/i,                   'comScore'],

  // ── Nielsen ───────────────────────────────────────────────────────────────────
  [/imrworldwide\.com/i,                            'Nielsen'],

  // ── Quantcast ─────────────────────────────────────────────────────────────────
  [/quantserve\.com/i,                              'Quantcast'],
  [/quantcount\.com/i,                              'Quantcast'],

  // ── Hotjar ────────────────────────────────────────────────────────────────────
  [/hotjar\.com/i,                                  'Hotjar'],

  // ── Heap ──────────────────────────────────────────────────────────────────────
  [/cdn\.heapanalytics\.com/i,                      'Heap Analytics'],
  [/heapanalytics\.com/i,                           'Heap Analytics'],

  // ── FullStory ─────────────────────────────────────────────────────────────────
  [/fullstory\.com/i,                               'FullStory'],

  // ── Segment ───────────────────────────────────────────────────────────────────
  [/cdn\.segment\.(com|io)/i,                       'Segment'],
  [/api\.segment\.(com|io)/i,                       'Segment'],

  // ── Amplitude ─────────────────────────────────────────────────────────────────
  [/cdn\.amplitude\.com/i,                          'Amplitude'],
  [/api\.amplitude\.com/i,                          'Amplitude'],

  // ── Mixpanel ──────────────────────────────────────────────────────────────────
  [/cdn\.mxpnl\.com/i,                              'Mixpanel'],
  [/api\.mixpanel\.com/i,                           'Mixpanel'],

  // ── Contentsquare / Clicktale ─────────────────────────────────────────────────
  [/t\.contentsquare\.net/i,                        'Contentsquare'],
  [/m\.clicktale\.net/i,                            'Contentsquare'],
  [/contentsquare\.net/i,                           'Contentsquare'],

  // ── Mouseflow ─────────────────────────────────────────────────────────────────
  [/cdn\.mouseflow\.com/i,                          'Mouseflow'],
  [/mouseflow\.com/i,                               'Mouseflow'],

  // ── VWO ───────────────────────────────────────────────────────────────────────
  [/dev\.visualwebsiteoptimizer\.com/i,             'VWO (Visual Website Optimizer)'],
  [/visualwebsiteoptimizer\.com/i,                  'VWO (Visual Website Optimizer)'],

  // ── Optimizely ────────────────────────────────────────────────────────────────
  [/cdn\.optimizely\.com/i,                         'Optimizely'],
  [/logx\.optimizely\.com/i,                        'Optimizely'],

  // ── Pendo ─────────────────────────────────────────────────────────────────────
  [/cdn\.pendo\.io/i,                               'Pendo'],
  [/app\.pendo\.io/i,                               'Pendo'],
  [/data\.pendo\.io/i,                              'Pendo'],

  // ── Intercom ──────────────────────────────────────────────────────────────────
  [/widget\.intercom\.io/i,                         'Intercom'],
  [/js\.intercomcdn\.com/i,                         'Intercom'],

  // ── HubSpot ───────────────────────────────────────────────────────────────────
  [/js\.hs-scripts\.com/i,                          'HubSpot'],
  [/js\.hubspot\.com/i,                             'HubSpot'],
  [/forms\.hubspot\.com/i,                          'HubSpot'],

  // ── Marketo ───────────────────────────────────────────────────────────────────
  [/munchkin\.marketo\.net/i,                       'Marketo'],
  [/\bMunchkin\b/,                                  'Marketo'],

  // ── Braze ─────────────────────────────────────────────────────────────────────
  [/js\.appboycdn\.com/i,                           'Braze'],
  [/braze\.com/i,                                   'Braze'],

  // ── Klaviyo ───────────────────────────────────────────────────────────────────
  [/static\.klaviyo\.com/i,                         'Klaviyo'],
  [/a\.klaviyo\.com/i,                              'Klaviyo'],

  // ── Salesforce Marketing Cloud / Interaction Studio ───────────────────────────
  [/cdn\.evgnet\.com/i,                             'Salesforce Interaction Studio'],
  [/libs\.krxd\.net/i,                              'Salesforce (Krux DMP)'],
  [/mc\.exacttarget\.com/i,                         'Salesforce Marketing Cloud'],

  // ── Invoca (call intelligence) ────────────────────────────────────────────────
  [/invoca\.net/i,                                  'Invoca'],
  [/pnapi\.invoca\.net/i,                           'Invoca'],

  // ── CallRail ──────────────────────────────────────────────────────────────────
  [/cdn\.callrail\.com/i,                           'CallRail'],
  [/callrail\.com/i,                                'CallRail'],

  // ── Kochava (mobile/measurement) ──────────────────────────────────────────────
  [/control\.kochava\.com/i,                        'Kochava'],

  // ── AppsFlyer ─────────────────────────────────────────────────────────────────
  [/t\.appsflyer\.com/i,                            'AppsFlyer'],
  [/appsflyer\.com/i,                               'AppsFlyer'],
]

function collectCodeSources({ ruleComponents, extensions, dataElements }) {
  const sources = []
  const add = (settingsStr) => {
    if (!settingsStr) return
    sources.push(settingsStr)  // raw JSON — catches URLs in any field
    try {
      const p = JSON.parse(settingsStr)
      // Common field names across Launch extensions and custom code
      for (const k of ['source', 'code', 'script', 'html', 'content', 'customCode',
                       'scriptUrl', 'src', 'url', 'endpoint']) {
        if (typeof p[k] === 'string') sources.push(p[k])
      }
    } catch {}
  }

  for (const comps of Object.values(ruleComponents || {})) {
    for (const c of comps) add(c.attributes.settings)
  }
  for (const ext of (extensions || [])) add(ext.attributes.settings)
  for (const de of (dataElements || []))  add(de.attributes.settings)

  return sources.join('\n')
}

function detectVendors(extensions, ruleComponents, dataElements) {
  const found = new Set()

  // Extension-based detection
  for (const ext of extensions) {
    const pkg = (ext._packageName || '').toLowerCase()
    for (const [key, label] of VENDOR_MAP) {
      if (pkg === key || pkg.startsWith(key)) { found.add(label); break }
    }
  }

  // Code-based detection — rule components, extension settings, data element settings
  if (ruleComponents) {
    const bigCode = collectCodeSources({ ruleComponents, extensions, dataElements: dataElements || [] })
    for (const [pattern, label] of CODE_VENDOR_PATTERNS) {
      if (pattern.test(bigCode)) found.add(label)
    }
  }

  return [...found].sort()
}

// ── Trigger / component helpers ───────────────────────────────────────────────

// Each entry has:
//   id       – DDI prefix (matches exact or starts-with + '::')
//   label    – column header
//   keywords – optional array of lowercase substrings; if any appear anywhere in the
//              DDI the trigger is considered a match. Used to catch data-layer events
//              whose package name differs across implementations.
const TRIGGER_COLS = [
  { id: 'core::events::direct-call',        label: 'Direct Call' },
  // Adjacent to Direct Call so rules with both are easy to spot.
  // keywords catch 'adobe-client-data-layer::events::*', 'datalayer-push', etc.
  { id: 'adobe-client-data-layer::events',  label: 'Adobe Data Layer',
    keywords: ['data-layer', 'datalayer'] },
  { id: 'core::events::library-loaded',     label: 'Library Loaded' },
  { id: 'core::events::dom-ready',          label: 'DOM Ready' },
  { id: 'core::events::window-loaded',      label: 'Window Loaded' },
  { id: 'core::events::page-bottom',        label: 'Page Bottom' },
  { id: 'core::events::click',              label: 'Click' },
  { id: 'core::events::custom-event',       label: 'Custom Event' },
  { id: 'core::events::history-change',     label: 'History Change (SPA)' },
]

// Returns true if a DDI matches a TRIGGER_COL.
// Checks (in order): prefix/exact match, then keyword substring match.
function ddiMatchesCol(ddi, col) {
  if (!ddi) return false
  const lower = ddi.toLowerCase()
  if (lower === col.id || lower.startsWith(col.id + '::')) return true
  if (col.keywords) return col.keywords.some(k => lower.includes(k))
  return false
}

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
  const vendors = detectVendors(extensions, ruleComponents, dataElements)
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

  // Rules by trigger type — each rule counted once per distinct trigger type it uses
  const triggerCounts = {}
  for (const rule of rules) {
    const comps = ruleComponents[rule.id] || []
    const events = comps.filter(c => compKind(c.attributes.delegate_descriptor_id) === 'events')
    if (events.length === 0) {
      triggerCounts['(no trigger)'] = (triggerCounts['(no trigger)'] || 0) + 1
    } else {
      const seen = new Set()
      for (const e of events) {
        const lbl = triggerLabel(e.attributes.delegate_descriptor_id)
        if (!seen.has(lbl)) { seen.add(lbl); triggerCounts[lbl] = (triggerCounts[lbl] || 0) + 1 }
      }
    }
  }
  h('RULES BY TRIGGER TYPE')
  rows.push(['Trigger Type', 'Rules Using'])
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

  const dataRows = rules.map(rule => {
    const comps   = ruleComponents[rule.id] || []
    const events  = comps.filter(c => compKind(c.attributes.delegate_descriptor_id) === 'events')
    const conds   = comps.filter(c => compKind(c.attributes.delegate_descriptor_id) === 'conditions')
    const actions = comps.filter(c => compKind(c.attributes.delegate_descriptor_id) === 'actions')

    // Match each event against every TRIGGER_COL (prefix + keyword).
    const colHit = t => events.some(e => ddiMatchesCol(e.attributes.delegate_descriptor_id, t))

    // "Other" = any event that doesn't match any TRIGGER_COL at all
    const otherTriggers = events
      .filter(e => !TRIGGER_COLS.some(t => ddiMatchesCol(e.attributes.delegate_descriptor_id, t)))
      .map(e => triggerLabel(e.attributes.delegate_descriptor_id))

    return [
      rule.attributes.name,
      rule.attributes.enabled ? 'Yes' : 'No',
      ...TRIGGER_COLS.map(t => colHit(t) ? 'Y' : ''),
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

function extractSettingsText(settingsStr, rawOut, codeOut) {
  if (!settingsStr) return
  rawOut.push(settingsStr)
  try {
    const parsed = JSON.parse(settingsStr)
    // custom code components store source here; some extensions use 'code' or 'script'
    if (parsed.source) codeOut.push(parsed.source)
    if (parsed.code)   codeOut.push(parsed.code)
    if (parsed.script) codeOut.push(parsed.script)
  } catch {}
}

function buildOrphanedDEs({ dataElements, ruleComponents, extensions }) {
  const rawSettings = []  // raw JSON strings — good for %name% token search
  const codeSources = []  // parsed source strings — accurate getVar() search

  for (const comps of Object.values(ruleComponents)) {
    for (const c of comps) extractSettingsText(c.attributes.settings, rawSettings, codeSources)
  }
  for (const ext of (extensions || [])) {
    extractSettingsText(ext.attributes.settings, rawSettings, codeSources)
  }
  for (const de of dataElements) {
    extractSettingsText(de.attributes.settings, rawSettings, codeSources)
  }

  const bigRaw  = rawSettings.join('\n')
  const bigCode = codeSources.join('\n')

  const classified = dataElements.map(de => {
    const name = de.attributes.name
    const referenced =
      bigRaw.includes(`%${name}%`) ||
      bigCode.includes(`%${name}%`) ||
      bigCode.includes(`getVar('${name}')`) ||
      bigCode.includes(`getVar("${name}")`) ||
      bigCode.includes(`getVar(\`${name}\`)`) ||
      // fallback: raw JSON search for single-quote form (unambiguous in JSON)
      bigRaw.includes(`getVar('${name}')`)
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

  const headers = ['Rule Name', 'Enabled', 'Normalized Key', 'Similarity Group', 'Notes']
  const dataRows = [...rules]
    .filter(rule => ruleGroup[rule.id] || ruleNotes[rule.id])
    .sort((a, b) => {
      const ga = ruleGroup[a.id] || ''
      const gb = ruleGroup[b.id] || ''
      if (ga !== gb) return ga.localeCompare(gb)
      return a.attributes.name.localeCompare(b.attributes.name)
    })
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
      vendors: detectVendors(auditRaw.extensions, auditRaw.ruleComponents, auditRaw.dataElements),
      orphanedCount,
    }
  }
}

// ── Style palette ─────────────────────────────────────────────────────────────

const FONT = { name: 'Calibri', sz: 10 }

const ST = {
  colHeader: {
    font: { ...FONT, bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: '1473E6' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: { bottom: { style: 'medium', color: { rgb: '0D66D0' } } },
  },
  section: {
    font: { ...FONT, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '2D3748' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  tableHeader: {
    font: { ...FONT, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '4A5568' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  kvLabel: {
    font: { ...FONT, bold: true },
    fill: { fgColor: { rgb: 'EBF4FF' }, patternType: 'solid' },
    border: { right: { style: 'thin', color: { rgb: 'BEE3F8' } } },
  },
  kvValue: {
    font: { ...FONT },
    fill: { fgColor: { rgb: 'F7FAFF' }, patternType: 'solid' },
  },
  rowEven: { font: { ...FONT }, fill: { fgColor: { rgb: 'F7FAFC' }, patternType: 'solid' } },
  rowOdd:  { font: { ...FONT }, fill: { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' } },
  yMark: {
    font: { ...FONT, bold: true, color: { rgb: '276749' } },
    fill: { fgColor: { rgb: 'C6F6D5' }, patternType: 'solid' },
    alignment: { horizontal: 'center' },
  },
  disabled: {
    font: { ...FONT, color: { rgb: 'A0AEC0' }, italic: true },
    fill: { fgColor: { rgb: 'F7FAFC' }, patternType: 'solid' },
  },
  center: (base) => ({ ...base, alignment: { horizontal: 'center' } }),
  orphanedRow: {
    font: { ...FONT, color: { rgb: 'C53030' } },
    fill: { fgColor: { rgb: 'FFF5F5' }, patternType: 'solid' },
  },
  orphanedBadge: {
    font: { ...FONT, bold: true, color: { rgb: 'C53030' } },
    fill: { fgColor: { rgb: 'FED7D7' }, patternType: 'solid' },
    alignment: { horizontal: 'center' },
  },
  inUseRow: {
    font: { ...FONT, color: { rgb: '276749' } },
    fill: { fgColor: { rgb: 'F0FFF4' }, patternType: 'solid' },
  },
  inUseBadge: {
    font: { ...FONT, bold: true, color: { rgb: '276749' } },
    fill: { fgColor: { rgb: 'C6F6D5' }, patternType: 'solid' },
    alignment: { horizontal: 'center' },
  },
  flaggedRow: {
    font: { ...FONT, color: { rgb: '744210' } },
    fill: { fgColor: { rgb: 'FFFBEB' }, patternType: 'solid' },
  },
  flaggedBadge: {
    font: { ...FONT, bold: true, color: { rgb: '744210' } },
    fill: { fgColor: { rgb: 'FEEBC8' }, patternType: 'solid' },
    alignment: { horizontal: 'center' },
  },
}

function mkCell(v, s = {}) {
  return { v: v ?? '', t: typeof v === 'number' ? 'n' : 's', s }
}

function buildWs(styledRows, { freezeRow = 0 } = {}) {
  const ws = {}
  let maxR = 0, maxC = 0
  styledRows.forEach((row, R) => {
    if (R > maxR) maxR = R
    row.forEach((cell, C) => {
      if (C > maxC) maxC = C
      ws[XLSX.utils.encode_cell({ r: R, c: C })] = cell
    })
  })
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
  ws['!cols'] = styledRows.reduce((cols, row) => {
    row.forEach((cell, i) => {
      const len = String(cell.v ?? '').length
      if (!cols[i] || cols[i].wch < len) cols[i] = { wch: Math.min(len + 2, 60) }
    })
    return cols
  }, [])
  if (freezeRow > 0) ws['!freeze'] = { xSplit: 0, ySplit: freezeRow }
  return ws
}

function discoverySheet(rows) {
  const TABLE_HEADERS = new Set(['Vendor', 'Display Name', 'Trigger Type'])
  const styledRows = rows.map(row => {
    if (!row.length) return [mkCell('')]
    const first = String(row[0] ?? '')
    if (row.length === 1 && first.length > 1 && first === first.toUpperCase())
      return [mkCell(first, ST.section)]
    if (TABLE_HEADERS.has(first))
      return row.map(v => mkCell(v, ST.tableHeader))
    if (row.length === 2)
      return [mkCell(row[0], ST.kvLabel), mkCell(row[1], ST.kvValue)]
    return row.map(v => mkCell(v, ST.rowOdd))
  })
  return buildWs(styledRows)
}

function rulesSheet(rows) {
  const styledRows = rows.map((row, R) => {
    if (R === 0) return row.map(v => mkCell(v, ST.colHeader))
    const base = R % 2 === 0 ? ST.rowEven : ST.rowOdd
    return row.map((v, C) => {
      if (v === 'Y')   return mkCell(v, ST.yMark)
      if (C === 1 && v === 'No') return mkCell(v, ST.disabled)
      if (typeof v === 'number') return mkCell(v, ST.center(base))
      return mkCell(v, base)
    })
  })
  return buildWs(styledRows, { freezeRow: 1 })
}

function orphanedSheet(rows) {
  const styledRows = rows.map((row, R) => {
    if (R === 0) return row.map(v => mkCell(v, ST.colHeader))
    const status = String(row[2] ?? '')
    if (status === 'ORPHANED') {
      return row.map((v, C) => mkCell(v, C === 2 ? ST.orphanedBadge : ST.orphanedRow))
    }
    if (status === 'In Use') {
      return row.map((v, C) => mkCell(v, C === 2 ? ST.inUseBadge : ST.inUseRow))
    }
    return row.map(v => mkCell(v, ST.rowOdd))
  })
  return buildWs(styledRows, { freezeRow: 1 })
}

function nameAuditSheet(rows) {
  const styledRows = rows.map((row, R) => {
    if (R === 0) return row.map(v => mkCell(v, ST.colHeader))
    const hasGroup = String(row[3] ?? '').trim() !== ''
    const hasNotes = String(row[4] ?? '').trim() !== ''
    const flagged  = hasGroup || hasNotes
    const base = flagged ? ST.flaggedRow : (R % 2 === 0 ? ST.rowEven : ST.rowOdd)
    return row.map((v, C) => {
      if (flagged && C === 3 && hasGroup) return mkCell(v, ST.flaggedBadge)
      if (C === 1 && v === 'No') return mkCell(v, flagged ? ST.flaggedRow : ST.disabled)
      return mkCell(v, base)
    })
  })
  return buildWs(styledRows, { freezeRow: 1 })
}

export function exportAuditToExcel(auditData) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, discoverySheet(auditData.discovery),      'Property Discovery')
  XLSX.utils.book_append_sheet(wb, rulesSheet(auditData.rulesInventory),      'Rules Inventory')
  XLSX.utils.book_append_sheet(wb, orphanedSheet(auditData.orphanedDEs),      'Orphaned Data Elements')
  XLSX.utils.book_append_sheet(wb, nameAuditSheet(auditData.nameAudit),       'Rule Name Audit')
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
}

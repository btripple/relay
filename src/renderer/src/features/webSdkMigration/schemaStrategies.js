// XDM path resolution for the three Web SDK migration schema strategies.
// Strategy 1: data.__adobe.analytics passthrough (fastest, no schema work)
// Strategy 2: _experience.analytics field group (Adobe XDM, AA-shaped)
// Strategy 3: CJA best practice (semantic XDM + custom tenant namespace)

export const SCHEMA_OPTIONS = [
  {
    id: 1,
    name: 'data.__adobe.analytics',
    shortName: 'XDM Data Object',
    description: 'All Analytics variables map directly to data.__adobe.analytics. The datastream maps them server-side. No schema design needed.',
    pros: [
      'Zero schema work required',
      'Fastest migration path',
      'Full Analytics backwards compatibility',
    ],
    cons: [
      'Not semantic XDM',
      'Does not leverage CJA-native features',
      'Locks variable naming to AA conventions',
    ],
    whenToUse: 'Best when migrating quickly without disrupting existing Analytics reporting structure.',
  },
  {
    id: 2,
    name: '_experience.analytics',
    shortName: 'Analytics Field Group',
    description: 'Uses the Adobe Analytics ExperienceEvent XDM field group. eVars, props, and events map to structured paths under _experience.analytics.',
    pros: [
      'True XDM structure',
      'Adobe-maintained field group',
      'Compatible with both Analytics and CJA',
    ],
    cons: [
      'Still AA-centric naming (eVar1, prop5…)',
      'Field group must be added to your schema',
      'Variable names remain opaque',
    ],
    whenToUse: 'Best when you want XDM structure while keeping Analytics field group as the backbone.',
  },
  {
    id: 3,
    name: 'CJA Best Practice',
    shortName: 'CJA Schema',
    description: 'Semantic XDM for known web/commerce variables, plus a custom tenant namespace for business-specific dimensions. Adobe-provided schemas + custom field group.',
    pros: [
      'Semantic, future-proof XDM',
      'Optimised for Customer Journey Analytics',
      'Clean data model with descriptive field names',
    ],
    cons: [
      'Requires semantic analysis of each eVar/prop',
      'Most implementation work',
      'Custom namespace fields require human mapping',
    ],
    whenToUse: 'Best for a greenfield CJA implementation or when you want a clean, long-term data model.',
    needsTenantId: true,
  },
]

// ── Known mappings ────────────────────────────────────────────────────────────

const STANDARD_VARIABLE_XDM = {
  pageName:       'web.webPageDetails.name',
  pageURL:        'web.webPageDetails.URL',
  channel:        'web.webPageDetails.siteSection',
  server:         'web.webPageDetails.server',
  referrer:       'web.webReferrer.URL',
  campaign:       'marketing.trackingCode',
  purchaseID:     'commerce.order.purchaseID',
  transactionID:  'commerce.order.purchaseID',
  zip:            'placeContext.geo.postalCode',
  state:          'placeContext.geo.stateProvince',
  pageType:       'web.webPageDetails.isErrorPage',
}

// These standard AA events have direct XDM commerce equivalents
const STANDARD_EVENT_XDM = {
  purchase:    'commerce.purchases.value',
  prodview:    'commerce.productViews.value',
  scadd:       'commerce.productListAdds.value',
  scremove:    'commerce.productListRemovals.value',
  scopen:      'commerce.productListOpens.value',
  sccheckout:  'commerce.checkouts.value',
  scview:      'commerce.productListViews.value',
}

// Returns the _experience.analytics field group path for numbered custom events
function analyticsEventPath(num) {
  if (num <= 100)  return `_experience.analytics.event1to100.event${num}.value`
  if (num <= 200)  return `_experience.analytics.event101to200.event${num}.value`
  if (num <= 300)  return `_experience.analytics.event201to300.event${num}.value`
  if (num <= 400)  return `_experience.analytics.event301to400.event${num}.value`
  if (num <= 500)  return `_experience.analytics.event401to500.event${num}.value`
  return               `_experience.analytics.event501to1000.event${num}.value`
}

// ── Path resolution ───────────────────────────────────────────────────────────

function resolveXdmPath(variable, variableType, strategyId, tenantId) {
  const vLower = variable.toLowerCase()

  // ── Strategy 1: passthrough ───────────────────────────────────────────────
  if (strategyId === 1) {
    return { path: `data.__adobe.analytics.${variable}` }
  }

  // ── products: always manual ───────────────────────────────────────────────
  if (variableType === 'products') {
    return {
      path: 'productListItems[]',
      requiresManualMapping: true,
      notes: 'Complex semicolon-delimited format — must be manually mapped to productListItems[]',
    }
  }

  // ── Standard variables: same path in strategies 2 and 3 ──────────────────
  if (variableType === 'standard' && STANDARD_VARIABLE_XDM[variable]) {
    return { path: STANDARD_VARIABLE_XDM[variable] }
  }

  // ── Events ────────────────────────────────────────────────────────────────
  if (variableType === 'event') {
    const stdPath = STANDARD_EVENT_XDM[vLower]
    if (stdPath) return { path: stdPath }

    const m = variable.match(/^event(\d+)$/i)
    if (m) {
      if (strategyId === 2) return { path: analyticsEventPath(parseInt(m[1])) }
      // Strategy 3: set web.webInteraction.name to a descriptive value; configure as CJA Data View metric
      return {
        path: 'web.webInteraction.name',
        requiresManualMapping: false,
        notes: 'Set web.webInteraction.name to the interaction name; create a metric in your CJA Data View filtered to that value',
      }
    }
    return { path: '', requiresManualMapping: true, notes: 'Unknown event type — map manually' }
  }

  // ── Strategy 2: _experience.analytics field group ─────────────────────────
  if (strategyId === 2) {
    if (variableType === 'eVar')        return { path: `_experience.analytics.customDimensions.eVars.${variable}` }
    if (variableType === 'prop')        return { path: `_experience.analytics.customDimensions.props.${variable}` }
    if (variableType === 'hier')        return { path: `_experience.analytics.customDimensions.hierarchies.${variable}.nodeValue` }
    if (variableType === 'list')        return { path: `_experience.analytics.customDimensions.lists.${variable}.value` }
    if (variableType === 'contextData') {
      const key = variable.replace('contextData.', '')
      return { path: `_experience.analytics.customDimensions.customMetadata.${key}` }
    }
    return { path: '', requiresManualMapping: true, notes: 'No known mapping — specify manually' }
  }

  // ── Strategy 3: CJA semantic + tenant namespace ───────────────────────────
  if (strategyId === 3) {
    if (variableType === 'eVar') {
      return {
        path: `_${tenantId}.${variable}`,
        requiresManualMapping: true,
        notes: 'Rename to describe the business dimension (e.g. _tenant.productCategory)',
      }
    }
    if (variableType === 'prop') {
      return {
        path: `_${tenantId}.${variable}`,
        requiresManualMapping: true,
        notes: 'Rename to describe the business dimension (e.g. _tenant.pageSection)',
      }
    }
    if (variableType === 'hier') {
      return {
        path: `_${tenantId}.${variable}`,
        requiresManualMapping: true,
        notes: 'Map to a nested array or custom hierarchy field in your tenant namespace',
      }
    }
    if (variableType === 'list') {
      return {
        path: `_${tenantId}.${variable}`,
        requiresManualMapping: true,
        notes: 'Map to a string array field in your tenant namespace',
      }
    }
    if (variableType === 'contextData') {
      const key = variable.replace('contextData.', '')
      return {
        path: `_${tenantId}.${key}`,
        notes: 'Mapped to tenant namespace using the contextData key name',
      }
    }
    return { path: '', requiresManualMapping: true, notes: 'Map manually' }
  }

  return { path: '', requiresManualMapping: true }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateMappingRows(analysis, strategyId, tenantId = 'tenantId') {
  return analysis.variables.map(v => {
    const xdm           = resolveXdmPath(v.variable, v.variableType, strategyId, tenantId)
    const isCustomEvent = v.variableType === 'event' && /^event\d+$/i.test(v.variable)
    return {
      variable:              v.variable,
      variableType:          v.variableType,
      exampleValue:          v.exampleValue || '',
      rulesCount:            v.rulesUsing.length,
      rulesUsing:            v.rulesUsing.join(', '),
      sources:               v.sources.join(', '),
      suggestedXdmPath:      xdm.path || '',
      customXdmPath:         '',
      webSdkValue:           v.exampleValue || '',
      notes:                 xdm.notes || '',
      skip:                  false,
      requiresManualMapping: xdm.requiresManualMapping || false,
      ...(isCustomEvent ? { interactionName: '' } : {}),
    }
  })
}

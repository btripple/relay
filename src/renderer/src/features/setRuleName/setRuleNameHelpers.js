// Helper functions for "Set Rule Name" feature
// Identifies link-tracking rules and manages rule name code injection

export function isLinkTrackingRule(rule, ruleComponents) {
  if (!ruleComponents || !Array.isArray(ruleComponents)) {
    console.log(`[SetRuleName] EXCLUDED "${rule.attributes.name}": No rule components`)
    return false
  }

  // Must have a Send Beacon action with type="link" AND linkName/linkType specified
  const beaconActions = ruleComponents.filter(
    c => c.attributes.delegate_descriptor_id === 'adobe-analytics::actions::send-beacon'
  )

  if (!beaconActions.length) {
    console.log(`[SetRuleName] EXCLUDED "${rule.attributes.name}": No Send Beacon action`)
    return false
  }

  // Check if ANY beacon action is a LINK beacon (type="link") with linkName/linkType specified
  const hasLinkBeacon = beaconActions.some(action => {
    try {
      const settings = JSON.parse(action.attributes.settings || '{}')
      const isLink = settings.type === 'link'
      const hasLinkName = !!settings.linkName
      const hasLinkType = !!settings.linkType

      if (isLink && hasLinkName && hasLinkType) {
        return true
      }
      return false
    } catch (e) {
      console.warn(`[SetRuleName] Could not parse beacon settings for "${rule.attributes.name}":`, e.message)
      return false
    }
  })

  if (hasLinkBeacon) {
    console.log(`[SetRuleName] INCLUDED "${rule.attributes.name}": Has s.tl() call`)
  } else {
    console.log(`[SetRuleName] EXCLUDED "${rule.attributes.name}": Missing s.tl() link beacon`)
  }

  return hasLinkBeacon
}

export function hasSetVariablesAction(ruleComponents) {
  if (!ruleComponents || !Array.isArray(ruleComponents)) return false
  return ruleComponents.some(
    c => c.attributes.delegate_descriptor_id === 'adobe-analytics::actions::set-variables'
  )
}

export function findBeaconAction(ruleComponents) {
  if (!ruleComponents || !Array.isArray(ruleComponents)) return null
  const beaconActions = ruleComponents.filter(
    c => c.attributes.delegate_descriptor_id === 'adobe-analytics::actions::send-beacon'
  )
  return beaconActions.find(action => {
    try {
      const settings = JSON.parse(action.attributes.settings || '{}')
      return settings.type === 'link' && settings.linkName && settings.linkType
    } catch {
      return false
    }
  }) || null
}

export function extractSetVariablesAction(ruleComponents) {
  if (!ruleComponents || !Array.isArray(ruleComponents)) return null
  return ruleComponents.find(
    c => c.attributes.delegate_descriptor_id === 'adobe-analytics::actions::set-variables'
  ) || null
}

export function parseVariablesFromSetVariables(settingsJson) {
  const variables = []

  if (!settingsJson) return variables

  try {
    const settings = typeof settingsJson === 'string' ? JSON.parse(settingsJson) : settingsJson

    // Debug: log the settings structure to understand what we're working with
    if (Object.keys(settings).length > 0) {
      const keys = Object.keys(settings)
      if (!keys.includes('trackerProperties')) {
        console.warn('[SetRuleName] Settings structure missing trackerProperties. Keys:', keys)
        // Log first few keys to understand structure
        for (let i = 0; i < Math.min(3, keys.length); i++) {
          const key = keys[i]
          const value = settings[key]
          if (typeof value === 'object') {
            console.log(`[SetRuleName] settings.${key} keys:`, Object.keys(value))
          }
        }
      }
    }

    const tp = settings.trackerProperties

    if (!tp) return variables

    if (Array.isArray(tp.eVars)) {
      for (const ev of tp.eVars) {
        if (ev.name) {
          const match = ev.name.match(/^eVar(\d+)$/)
          if (match) {
            variables.push({
              type: 'eVar',
              number: parseInt(match[1], 10),
              name: ev.name
            })
          }
        }
      }
    }

    if (Array.isArray(tp.props)) {
      for (const p of tp.props) {
        if (p.name) {
          const match = p.name.match(/^prop(\d+)$/)
          if (match) {
            variables.push({
              type: 'prop',
              number: parseInt(match[1], 10),
              name: p.name
            })
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse variables from Set Variables action:', err)
    return variables
  }

  variables.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'eVar' ? -1 : 1
    return a.number - b.number
  })

  return variables
}

export function detectExistingRuleNameCode(customCodeStr, targetVariable = null) {
  if (!customCodeStr) return { exists: false, variable: null }

  // If target variable is specified, check specifically for that variable
  if (targetVariable) {
    const patterns = [
      new RegExp(`s\\.${targetVariable}\\s*=\\s*event\\.\\$rule\\.name`, 'g'),
      new RegExp(`s\\["${targetVariable}"\\]\\s*=\\s*event\\.\\$rule\\.name`, 'g'),
      new RegExp(`s\\['${targetVariable}'\\]\\s*=\\s*event\\.\\$rule\\.name`, 'g')
    ]

    for (const pattern of patterns) {
      if (pattern.test(customCodeStr)) {
        return {
          exists: true,
          variable: targetVariable
        }
      }
    }

    return { exists: false, variable: null }
  }

  // If no target specified, check for any rule name assignment
  const patterns = [
    /s\.eVar(\d+)\s*=\s*event\.\$rule\.name/g,
    /s\["eVar(\d+)"\]\s*=\s*event\.\$rule\.name/g,
    /s\['eVar(\d+)'\]\s*=\s*event\.\$rule\.name/g,
    /s\.prop(\d+)\s*=\s*event\.\$rule\.name/g,
    /s\["prop(\d+)"\]\s*=\s*event\.\$rule\.name/g,
    /s\['prop(\d+)'\]\s*=\s*event\.\$rule\.name/g
  ]

  for (const pattern of patterns) {
    const match = customCodeStr.match(pattern)
    if (match) {
      const variableType = pattern.source.includes('eVar') ? 'eVar' : 'prop'
      return {
        exists: true,
        variable: `${variableType}${match[1]}`
      }
    }
  }

  return { exists: false, variable: null }
}

export function generateCodeInjection(variable, existingCode) {
  // Check if this specific variable already has the rule name assignment
  const existing = detectExistingRuleNameCode(existingCode, variable)

  if (existing.exists) {
    return {
      injected: false,
      reason: 'already-exists',
      variable: existing.variable,
      code: null
    }
  }

  const injection = `s.${variable} = event.$rule.name;`
  const newCode = existingCode
    ? `${existingCode}\n${injection}`
    : injection

  return {
    injected: true,
    reason: 'injected',
    variable,
    code: newCode
  }
}

export function getAvailableVariables(rules, ruleComponents) {
  const variableMap = new Map()

  // Add all possible eVars (1-250)
  for (let i = 1; i <= 250; i++) {
    const name = `eVar${i}`
    variableMap.set(name, { type: 'eVar', number: i, name })
  }

  // Add all possible props (1-75)
  for (let i = 1; i <= 75; i++) {
    const name = `prop${i}`
    variableMap.set(name, { type: 'prop', number: i, name })
  }

  return Array.from(variableMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'eVar' ? -1 : 1
    return a.number - b.number
  })
}

export function extractCustomCode(settingsJson) {
  if (!settingsJson) return null

  try {
    const settings = typeof settingsJson === 'string' ? JSON.parse(settingsJson) : settingsJson
    return settings.customCode?.source || settings.customCode?.script || null
  } catch {
    return null
  }
}

export function injectCodeIntoSetVariablesSettings(originalSettingsJson, variable) {
  try {
    const settings = typeof originalSettingsJson === 'string'
      ? JSON.parse(originalSettingsJson)
      : originalSettingsJson

    const customCode = extractCustomCode(settings)
    const injectionResult = generateCodeInjection(variable, customCode)

    if (!injectionResult.injected) {
      return {
        success: false,
        reason: injectionResult.reason,
        settings: null,
        message: `This variable already contains rule name code: ${injectionResult.variable}`
      }
    }

    const newSettings = {
      ...settings,
      customCode: {
        source: injectionResult.code,
        script: injectionResult.code
      }
    }

    return {
      success: true,
      reason: 'injected',
      settings: newSettings,
      message: `Code injected successfully: s.${variable} = event.$rule.name;`
    }
  } catch (err) {
    return {
      success: false,
      reason: 'error',
      settings: null,
      message: `Failed to inject code: ${err.message}`
    }
  }
}

export function createNewSetVariablesAction() {
  // Create a minimal Set Variables action with no variables
  const settings = {
    trackerProperties: {
      eVars: [],
      props: []
    }
  }

  return {
    name: 'Set Variables',
    delegate_descriptor_id: 'adobe-analytics::actions::set-variables',
    settings: JSON.stringify(settings),
    order: null // Will be set by caller based on position before Send Beacon
  }
}

export function createCustomCodeAction(variable) {
  const injectionResult = generateCodeInjection(variable, null)

  const settings = {
    source: injectionResult.code
  }

  return {
    name: 'Set Rule Name',
    delegate_descriptor_id: 'core::actions::custom-code',
    settings: JSON.stringify(settings),
    order: null // Will be set by caller
  }
}

export function findCustomCodeAction(ruleComponents) {
  if (!ruleComponents || !Array.isArray(ruleComponents)) return null
  return ruleComponents.find(
    c => c.attributes.delegate_descriptor_id === 'core::actions::custom-code'
  ) || null
}

export function getNextComponentOrder(ruleComponents) {
  if (!ruleComponents || !Array.isArray(ruleComponents)) return 1
  const maxOrder = Math.max(
    0,
    ...ruleComponents
      .filter(c => typeof c.attributes.order === 'number')
      .map(c => c.attributes.order)
  )
  return maxOrder + 1
}

export function findSetVariablesIndex(ruleComponents) {
  if (!ruleComponents || !Array.isArray(ruleComponents)) return -1
  return ruleComponents.findIndex(
    c => c.attributes.delegate_descriptor_id === 'adobe-analytics::actions::set-variables'
  )
}

export function findBeaconIndex(ruleComponents) {
  if (!ruleComponents || !Array.isArray(ruleComponents)) return -1
  const beaconIdx = ruleComponents.findIndex(
    c => c.attributes.delegate_descriptor_id === 'adobe-analytics::actions::send-beacon'
  )
  if (beaconIdx === -1) return -1

  // Return the index of the link beacon specifically
  for (let i = beaconIdx; i < ruleComponents.length; i++) {
    const c = ruleComponents[i]
    if (c.attributes.delegate_descriptor_id === 'adobe-analytics::actions::send-beacon') {
      try {
        const settings = JSON.parse(c.attributes.settings || '{}')
        if (settings.type === 'link' && settings.linkName && settings.linkType) {
          return i
        }
      } catch {}
    }
  }
  return -1
}

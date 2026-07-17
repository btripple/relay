import { useState, useEffect } from 'react'
import {
  isLinkTrackingRule,
  extractSetVariablesAction,
  getAvailableVariables,
  detectExistingRuleNameCode,
  findBeaconIndex,
  createNewSetVariablesAction
} from './setRuleNameHelpers'

export default function SetRuleNameModal({ client, rules, sourcePropertyId, onLibrary, onClose }) {
  const [step, setStep] = useState(1)
  const [linkRules, setLinkRules] = useState([])
  const [ruleComponents, setRuleComponents] = useState({})
  const [allVariables, setAllVariables] = useState([])
  const [analyticsExtId, setAnalyticsExtId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedVariable, setSelectedVariable] = useState(null)
  const [rulesToUpdate, setRulesToUpdate] = useState([])
  const [selectedRuleIds, setSelectedRuleIds] = useState(new Set())

  const [working, setWorking] = useState(false)
  const [injectionResults, setInjectionResults] = useState(null)
  const [filterText, setFilterText] = useState('')

  // Load rules and filter for link-tracking
  useEffect(() => {
    loadRulesAndComponents()
  }, [rules, sourcePropertyId])

  // When variable is selected, update rules list
  useEffect(() => {
    if (!selectedVariable || linkRules.length === 0) {
      setRulesToUpdate([])
      setSelectedRuleIds(new Set())
      return
    }

    // All rules with s.tl() calls are eligible for injection
    setRulesToUpdate(linkRules)

    // Auto-select ALL rules for injection (variable will be injected into existing or new Set Variables)
    setSelectedRuleIds(new Set(linkRules.map(r => r.id)))
  }, [selectedVariable, linkRules, ruleComponents])

  const loadRulesAndComponents = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch extensions to find Adobe Analytics extension ID (needed for creating Set Variables actions)
      const extensions = await client.fetchExtensionsWithPackages(sourcePropertyId)
      let aExt = null
      for (const ext of extensions) {
        if (ext._packageName === 'adobe-analytics') {
          aExt = ext.id
          break
        }
      }
      setAnalyticsExtId(aExt)
      console.log(`[SetRuleName] Found Adobe Analytics extension:`, aExt)

      const comps = {}
      const linkTrackingRules = []
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

      console.log(`[SetRuleName] Total rules to process: ${rules.length}`)

      // Process rules sequentially with 300ms delay to avoid rate limiting
      for (const rule of rules) {
        try {
          const components = await client.getRuleComponents(rule.id)
          comps[rule.id] = components

          if (isLinkTrackingRule(rule, components)) {
            linkTrackingRules.push(rule)
          }
        } catch (err) {
          console.error(`Failed to load components for rule ${rule.id}:`, err)
        }
        await sleep(300)
      }

      console.log(`[SetRuleName] Summary: ${rules.length} total rules, ${linkTrackingRules.length} identified as link-tracking`)

      setRuleComponents(comps)
      setLinkRules(linkTrackingRules)

      const variables = getAvailableVariables(linkTrackingRules, comps)
      setAllVariables(variables)

      if (linkTrackingRules.length === 0) {
        setError('No link-tracking rules found.')
      }
    } catch (err) {
      setError(`Failed to load rules: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleRuleSelection = (ruleId) => {
    const newSet = new Set(selectedRuleIds)
    if (newSet.has(ruleId)) {
      newSet.delete(ruleId)
    } else {
      newSet.add(ruleId)
    }
    setSelectedRuleIds(newSet)
  }

  const selectAllRules = () => {
    setSelectedRuleIds(new Set(rulesToUpdate.map(r => r.id)))
  }

  const selectNoRules = () => {
    setSelectedRuleIds(new Set())
  }

  const filteredRules = rulesToUpdate.filter(rule =>
    rule.attributes.name.toLowerCase().includes(filterText.toLowerCase())
  )

  const handleInjectAll = async () => {
    if (!selectedVariable) return

    setWorking(true)
    try {
      const results = {
        success: [],
        skipped: [],
        failed: []
      }

      const selectedRules = linkRules.filter(r => selectedRuleIds.has(r.id))

      console.log(`[SetRuleName DIAGNOSTIC] Starting injection for ${selectedRules.length} selected rules:`, {
        selectedRuleIds: Array.from(selectedRuleIds),
        selectedRules: selectedRules.map(r => ({ id: r.id, name: r.attributes.name }))
      })

      for (const rule of selectedRules) {
        try {
          let ruleComps = ruleComponents[rule.id]

          // Validate rule has beacon action
          const beaconIdx = findBeaconIndex(ruleComps)
          if (beaconIdx === -1) {
            results.failed.push({ ruleName: rule.attributes.name, error: 'Send Beacon action not found' })
            continue
          }

          // Find or create the Set Variables action
          let setVarsAction = extractSetVariablesAction(ruleComps)
          if (!setVarsAction) {
            console.log(`[SetRuleName DIAGNOSTIC] Set Variables action not found for "${rule.attributes.name}", creating new one`)

            if (!analyticsExtId) {
              results.failed.push({ ruleName: rule.attributes.name, error: 'Adobe Analytics extension not found in property' })
              continue
            }

            // Create a new Set Variables action with empty variables
            const newSetVarsComponent = createNewSetVariablesAction()
            // Order before beacon
            const beaconIdx = findBeaconIndex(ruleComps)
            newSetVarsComponent.order = beaconIdx >= 0 ? Math.max(0, ruleComps[beaconIdx].attributes.order - 1) : 0

            const componentForApi = {
              attributes: newSetVarsComponent,
              relationships: {
                extension: {
                  data: {
                    id: analyticsExtId,
                    type: 'extensions'
                  }
                }
              }
            }

            console.log(`[SetRuleName DIAGNOSTIC] Creating new Set Variables action for "${rule.attributes.name}":`, {
              order: newSetVarsComponent.order,
              analyticsExtId: analyticsExtId
            })

            try {
              await client.createRuleComponent(sourcePropertyId, rule.id, componentForApi, {})
              // Refresh rule components to get the newly created action
              ruleComps = await client.getRuleComponents(rule.id)
              setVarsAction = extractSetVariablesAction(ruleComps)

              if (!setVarsAction) {
                results.failed.push({ ruleName: rule.attributes.name, error: 'Failed to create Set Variables action' })
                continue
              }

              console.log(`[SetRuleName DIAGNOSTIC] Successfully created Set Variables action`)
            } catch (err) {
              console.error(`[SetRuleName DIAGNOSTIC] Error creating Set Variables action:`, err)
              results.failed.push({ ruleName: rule.attributes.name, error: `Failed to create Set Variables action: ${err.message}` })
              continue
            }
          }

          // === DIAGNOSTIC OUTPUT: Log the action object structure ===
          console.log(`[SetRuleName DIAGNOSTIC] Set Variables Action Object for "${rule.attributes.name}":`, {
            id: setVarsAction.id,
            type: setVarsAction.type,
            attributes: {
              delegate_descriptor_id: setVarsAction.attributes?.delegate_descriptor_id,
              name: setVarsAction.attributes?.name,
              order: setVarsAction.attributes?.order,
              settingsType: typeof setVarsAction.attributes?.settings,
              settingsLength: setVarsAction.attributes?.settings?.length,
              settingsPreview: setVarsAction.attributes?.settings?.substring(0, 200)
            },
            relationships: {
              extension: setVarsAction.relationships?.extension?.data?.id
            }
          })

          // Parse the Set Variables action settings
          let settingsObj = {}
          let customSetupSource = ''
          if (setVarsAction.attributes.settings) {
            try {
              settingsObj = JSON.parse(setVarsAction.attributes.settings)
              customSetupSource = settingsObj.customSetup?.source || ''

              // === DIAGNOSTIC OUTPUT: Log parsed settings structure ===
              console.log(`[SetRuleName DIAGNOSTIC] Parsed Settings Structure for "${rule.attributes.name}":`, {
                hasCustomSetup: !!settingsObj.customSetup,
                hasCustomSetupSource: !!settingsObj.customSetup?.source,
                customSetupSourceLength: customSetupSource.length,
                customSetupSourcePreview: customSetupSource.substring(0, 150),
                trackerPropertiesKeys: Object.keys(settingsObj.trackerProperties || {}),
                allSettingsKeys: Object.keys(settingsObj)
              })
            } catch (e) {
              console.error(`[SetRuleName DIAGNOSTIC] Failed to parse Set Variables settings for "${rule.attributes.name}":`, {
                error: e.message,
                rawSettings: setVarsAction.attributes.settings?.substring(0, 300)
              })
              results.failed.push({ ruleName: rule.attributes.name, error: `Failed to parse settings: ${e.message}` })
              continue
            }
          } else {
            console.warn(`[SetRuleName DIAGNOSTIC] No settings found on Set Variables action for "${rule.attributes.name}"`)
          }

          // Check if rule name code already exists
          const existing = detectExistingRuleNameCode(customSetupSource, selectedVariable.name)
          if (existing.exists) {
            results.skipped.push({ ruleName: rule.attributes.name, reason: `Rule name code already exists for ${selectedVariable.name}` })
            continue
          }

          // Append rule name assignment to customSetup.source
          const injection = `s.${selectedVariable.name} = event.$rule.name;`
          const newCustomSetupSource = customSetupSource ? `${customSetupSource}\n${injection}` : injection

          // Update the Set Variables action with the new code
          const updatedSettings = {
            ...settingsObj,
            customSetup: {
              ...settingsObj.customSetup,
              source: newCustomSetupSource
            }
          }

          // === DIAGNOSTIC OUTPUT: Log before sending to API ===
          console.log(`[SetRuleName DIAGNOSTIC] About to update Set Variables action ${setVarsAction.id}:`, {
            ruleName: rule.attributes.name,
            variable: selectedVariable.name,
            oldSourceLength: customSetupSource.length,
            newSourceLength: newCustomSetupSource.length,
            updatedSettingsKeys: Object.keys(updatedSettings),
            updatedCustomSetup: updatedSettings.customSetup
          })

          try {
            const updatePayload = {
              settings: JSON.stringify(updatedSettings)
            }
            console.log(`[SetRuleName DIAGNOSTIC] Update payload to send to API:`, {
              settingsPayloadLength: updatePayload.settings.length,
              settingsPayloadPreview: updatePayload.settings.substring(0, 200)
            })

            await client.updateRuleComponent(setVarsAction.id, updatePayload)
            const successEntry = { id: rule.id, name: rule.attributes.name }
            results.success.push(successEntry)
            console.log(`[SetRuleName DIAGNOSTIC] Successfully updated ${rule.attributes.name}`)
            console.log(`[SetRuleName DIAGNOSTIC] Added to success array:`, {
              entry: successEntry,
              successArrayLength: results.success.length,
              successArray: results.success
            })
          } catch (err) {
            console.error(`[SetRuleName DIAGNOSTIC] Error updating Set Variables action:`, {
              ruleName: rule.attributes.name,
              error: err.message,
              fullError: err.toString()
            })
            results.failed.push({ ruleName: rule.attributes.name, error: err.message })
          }
        } catch (err) {
          console.error(`[SetRuleName DIAGNOSTIC] Outer error for rule ${rule.attributes.name}:`, err)
          results.failed.push({ ruleName: rule.attributes.name, error: err.message })
        }
      }

      console.log(`[SetRuleName DIAGNOSTIC] FINAL RESULTS:`, {
        successCount: results.success.length,
        successEntries: results.success,
        skippedCount: results.skipped.length,
        failedCount: results.failed.length
      })

      setInjectionResults(results)
    } catch (err) {
      setError(`Injection failed: ${err.message}`)
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 600 }}>
          <div className="modal-header"><h2>Set Rule Names</h2></div>
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px', color: 'var(--text)' }}>
              Analyzing rules…
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              <p>Fetching rule components and identifying link-tracking rules.</p>
              <p>This may take a moment for large containers.</p>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', animation: 'pulse 1.5s ease-in-out 0.2s infinite' }} />
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', animation: 'pulse 1.5s ease-in-out 0.4s infinite' }} />
            </div>
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 1; }
            }
          `}</style>
        </div>
      </div>
    )
  }

  if (error && linkRules.length === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 600 }}>
          <div className="modal-header"><h2>Set Rule Names</h2></div>
          <div style={{ padding: '24px' }}>
            <div className="auth-error">{error}</div>
          </div>
          <div className="modal-footer">
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  // STEP 1: Variable Selection
  if (step === 1) {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 600 }}>
          <div className="modal-header">
            <h2>Set Rule Names</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Step 1 of 2: Select a variable to populate with rule names
            </p>
          </div>

          <div style={{ padding: '24px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '500' }}>
              Choose a variable (found in {linkRules.length} link-tracking rule{linkRules.length !== 1 ? 's' : ''}):
            </p>

            <select
              value={selectedVariable?.name || ''}
              onChange={e => {
                const varName = e.target.value
                const variable = allVariables.find(v => v.name === varName)
                setSelectedVariable(variable || null)
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'monospace',
                marginBottom: '16px',
                cursor: 'pointer'
              }}
            >
              <option value="">Select a variable…</option>
              {allVariables.map(variable => (
                <option key={variable.name} value={variable.name}>
                  {variable.name} ({variable.type})
                </option>
              ))}
            </select>

            {selectedVariable && (
              <div style={{
                padding: '12px',
                backgroundColor: '#e8f2ff',
                border: '1px solid #b8d4f8',
                borderRadius: '6px',
                marginBottom: '16px'
              }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '500' }}>
                  Selected: <strong>{selectedVariable.name}</strong>
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Code to inject: <code style={{ fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: '3px' }}>s.{selectedVariable.name} = event.$rule.name;</code>
                </p>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!selectedVariable}
              onClick={() => setStep(2)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    )
  }

  // STEP 2: Rule Selection & Confirmation
  if (step === 2 && !injectionResults) {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
          <div className="modal-header">
            <h2>Set Rule Names</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Step 2 of 2: Review rules to update ({selectedRuleIds.size} selected)
            </p>
          </div>

          <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
            <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#e8f2ff', border: '1px solid #b8d4f8', borderRadius: '6px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Variable:</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', fontWeight: '600' }}>
                {selectedVariable?.name} ({selectedVariable?.type})
              </p>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                  onClick={selectAllRules}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={selectNoRules}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Select None
                </button>
              </div>
              <input
                type="text"
                placeholder="Filter rules…"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace'
                }}
              />
            </div>

            <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>
              {filterText ? `${filteredRules.length} of ${rulesToUpdate.length} rules` : `${rulesToUpdate.length} rules total`}
            </p>

            <div style={{
              border: '1px solid var(--border)',
              borderRadius: '6px',
              minHeight: '200px',
              maxHeight: '350px',
              overflow: 'auto'
            }}>
              {filteredRules.length > 0 ? (
                filteredRules.map(rule => (
                  <label
                    key={rule.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      backgroundColor: selectedRuleIds.has(rule.id) ? '#e8f2ff' : 'transparent',
                      transition: 'background .1s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRuleIds.has(rule.id)}
                      onChange={() => toggleRuleSelection(rule.id)}
                      style={{ marginRight: '10px', cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: '13px', minWidth: 0 }}>{rule.attributes.name}</span>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      backgroundColor: rule.attributes.enabled ? '#e6f9f0' : '#f5f5f5',
                      color: rule.attributes.enabled ? 'var(--success)' : 'var(--text-muted)',
                      fontWeight: '600',
                      flexShrink: 0,
                      marginLeft: '8px'
                    }}>
                      {rule.attributes.enabled ? 'ON' : 'OFF'}
                    </span>
                  </label>
                ))
              ) : (
                <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
                  {filterText ? 'No rules match this filter' : 'No rules available'}
                </div>
              )}
            </div>

            {error && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                border: '1px solid rgba(244, 67, 54, 0.3)',
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--danger)',
                marginTop: '12px'
              }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn-ghost" onClick={() => { setStep(1); setFilterText(''); }} disabled={working}>Back</button>
            <button
              className="btn-primary"
              onClick={handleInjectAll}
              disabled={working || selectedRuleIds.size === 0}
            >
              {working ? `Injecting…` : `Inject & Stage ${selectedRuleIds.size}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Results screen
  if (step === 2 && injectionResults) {
    const { success, skipped, failed } = injectionResults
    const total = success.length + skipped.length + failed.length

    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 700 }}>
          <div className="modal-header">
            <h2>Injection Complete</h2>
          </div>

          <div style={{ padding: '24px' }}>
            {success.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '600', color: 'var(--success)' }}>
                  ✓ Successfully injected: {success.length}
                </p>
                <div style={{
                  backgroundColor: '#e6f9f0',
                  border: '1px solid #12a36b',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  maxHeight: '150px',
                  overflow: 'auto'
                }}>
                  {success.map(item => (
                    <div key={item.id} style={{ fontSize: '12px', padding: '2px 0' }}>• {item.name}</div>
                  ))}
                </div>
              </div>
            )}

            {skipped.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '600', color: 'var(--warning)' }}>
                  ⊘ Skipped (already exists): {skipped.length}
                </p>
                <div style={{
                  backgroundColor: 'rgba(255, 193, 7, 0.1)',
                  border: '1px solid rgba(255, 193, 7, 0.5)',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  maxHeight: '150px',
                  overflow: 'auto'
                }}>
                  {skipped.map(item => (
                    <div key={item.ruleName} style={{ fontSize: '12px', padding: '2px 0' }}>
                      • {item.ruleName}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {failed.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '600', color: 'var(--danger)' }}>
                  ✕ Failed: {failed.length}
                </p>
                <div style={{
                  backgroundColor: 'rgba(244, 67, 54, 0.1)',
                  border: '1px solid rgba(244, 67, 54, 0.3)',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  maxHeight: '150px',
                  overflow: 'auto'
                }}>
                  {failed.map(item => (
                    <div key={item.ruleName} style={{ fontSize: '12px', padding: '2px 0' }}>
                      • {item.ruleName}: {item.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {success.length > 0 && (
              <div style={{
                padding: '12px',
                backgroundColor: '#e8f2ff',
                border: '1px solid #b8d4f8',
                borderRadius: '4px',
                marginTop: '16px'
              }}>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  {success.length} rule{success.length !== 1 ? 's' : ''} will be staged to a library on the next step.
                </p>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {success.length > 0 ? (
              <>
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    const successRuleIds = success.map(item => item.id)
                    onLibrary(successRuleIds, sourcePropertyId)
                  }}
                >
                  Stage to Library
                </button>
              </>
            ) : (
              <button className="btn-primary" onClick={onClose}>Done</button>
            )}
          </div>
        </div>
      </div>
    )
  }
}

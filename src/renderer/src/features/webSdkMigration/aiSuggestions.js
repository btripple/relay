// Calls the Gemini API to suggest semantic XDM paths for Adobe Analytics variables.
// Only invoked explicitly by the user — never called automatically.

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// ── Value hint extraction ─────────────────────────────────────────────────────
// Pull a human-readable label out of a Launch value expression.
// This is the single richest signal for the AI.

function extractValueHint(value) {
  if (!value || typeof value !== 'string') return null
  const v = value.trim()

  // %DE - Internal Search Term%  or  %Page Name%
  let m = v.match(/%(?:de\s*[-–]\s*)?([^%]+)%/i)
  if (m) return m[1].trim()

  // _satellite.getVar('search_keyword')
  m = v.match(/getVar\s*\(\s*['"]([^'"]+)['"]\s*\)/)
  if (m) return m[1].trim()

  // Short clean literal that isn't a code expression
  if (v.length < 64 && !/[{}()\[\]$]/.test(v) && !v.includes('function') && !v.startsWith('//'))
    return v

  return null
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(variables, tenantId, analyticsNames) {
  const hasAnalyticsNames = analyticsNames && Object.keys(analyticsNames).length > 0

  const items = variables.map(v => {
    const deHint       = extractValueHint(v.exampleValue)
    const analyticsName = analyticsNames?.[v.variable.toLowerCase()]
    const rules        = (v.rulesUsing || '')
      .split(',').map(s => s.trim()).filter(Boolean).slice(0, 4)

    return {
      variable: v.variable,
      type:     v.variableType,
      // "name" is the configured Analytics admin label — strongest signal when available
      ...(analyticsName ? { name: analyticsName }   : {}),
      ...(deHint        ? { hint: deHint }           : {}),
      ...(rules.length  ? { rules }                  : {}),
    }
  })

  const hintInstructions = hasAnalyticsNames
    ? `- "name" — the configured variable label from Adobe Analytics admin (STRONGEST signal — use this first)
- "hint" — extracted data element name or literal value (secondary context)
- "rules" — Launch rule names where this variable is set (context clue)`
    : `- "hint" — extracted data element name or literal value (strongest clue)
- "rules" — Launch rule names where this variable is set (context clue)`

  return `You are an Adobe Experience Platform XDM schema architect helping migrate Adobe Analytics to Web SDK for Customer Journey Analytics.

TENANT NAMESPACE: _${tenantId}

For each variable below, infer the business concept from:
${hintInstructions}

MAPPING GUIDELINES:
Use STANDARD XDM paths for known concepts:
  web.search.keywords, web.webPageDetails.name, web.webPageDetails.siteSection,
  commerce.order.purchaseID, commerce.order.priceTotal, productListItems[].name,
  productListItems[].SKU, productListItems[].priceTotal, marketing.trackingCode

Use _${tenantId}.[domain].[semanticFieldName] for business-specific dimensions.
Use DESCRIPTIVE names — never use the eVar number in the field name.
Domain examples: search, user, video, appointment, form, product, content, campaign

For numeric custom events: _${tenantId}.metrics.[descriptiveName]
If genuinely ambiguous: _${tenantId}.analytics.[varName] with confidence "low"

VARIABLES:
${JSON.stringify(items, null, 2)}

Return a JSON array with EXACTLY ${items.length} objects, one per variable in the SAME ORDER:
[
  {
    "variable": "<original variable name>",
    "suggestedPath": "<XDM field path>",
    "confidence": "high" | "medium" | "low",
    "reasoning": "<max 12 words explaining the inferred mapping>"
  }
]`
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getAiMappingSuggestions(rows, tenantId, apiKey, onProgress, analyticsNames = null) {
  // Only rows that need a manual mapping and haven't been skipped
  const eligible = rows.filter(r => !r.skip && r.requiresManualMapping)
  if (!eligible.length) return {}

  onProgress?.(`Sending ${eligible.length} variables to Gemini…`)

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(eligible, tenantId, analyticsNames) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature:      0.15,
        maxOutputTokens:  16384,
        // Disable extended thinking — unnecessary for structured JSON output and
        // causes the model to return a thought part before the actual answer part.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })

  if (!response.ok) {
    let msg = `Gemini API error ${response.status}`
    try { const e = await response.json(); msg = e.error?.message || msg } catch {}
    throw new Error(msg)
  }

  const data = await response.json()

  // Thinking models return multiple parts; the thought part has `thought: true`.
  // Find the actual text response part regardless of position.
  const parts = data.candidates?.[0]?.content?.parts || []
  const raw = parts.find(p => p.text && !p.thought)?.text || parts[0]?.text
  if (!raw) throw new Error('Empty response from Gemini API')

  // Strip markdown code fences that some model versions wrap around JSON
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let suggestions
  try { suggestions = JSON.parse(text) } catch {
    throw new Error('Gemini response was cut off — try reducing the number of variables or re-running.')
  }
  if (!Array.isArray(suggestions)) throw new Error('Unexpected response shape from Gemini API')

  // Return a map keyed by lowercase variable name for fast lookup
  return Object.fromEntries(
    suggestions
      .filter(s => s?.variable && s?.suggestedPath)
      .map(s => [s.variable.toLowerCase(), s])
  )
}

// ── Event interaction name suggestions ───────────────────────────────────────
// Generates lowercase "object:action" names for custom events (e.g. "store:search").
// Uses Analytics admin labels as the primary signal, rule names for context.

export async function getAiEventNameSuggestions(eventRows, analyticsNames, apiKey, onProgress) {
  const eligible = eventRows.filter(r => !r.skip)
  if (!eligible.length) return {}

  onProgress?.(`Sending ${eligible.length} events to Gemini…`)

  const items = eligible.map(r => {
    const label = analyticsNames?.[r.variable.toLowerCase()] || r.interactionName || null
    const rules = (r.rulesUsing || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 5)
    return {
      event: r.variable,
      ...(label  ? { label }  : {}),
      ...(rules.length ? { rules } : {}),
    }
  })

  const prompt = `You are a CJA/Adobe Experience Platform event naming expert.

For each custom Analytics event, generate a concise lowercase "object:action" name for use as the web.webInteraction.name value.

FORMAT RULES:
- Lowercase only, colon-separated: "object:action"
- "object" = business domain noun (store, appointment, cart, product, user, video, form, offer, review, filter, checkout, account, quiz, banner, search, navigation, booking, service, coupon)
- "action" = verb describing what happened (view, click, search, add, complete, remove, start, submit, load, open, close, select, apply, share, download, print, save, book, cancel, confirm, expand)
- No spaces, no special characters except the colon
- Unique across all events — no duplicates
- Use "label" as the PRIMARY signal. Use "rules" as secondary context.

EVENTS:
${JSON.stringify(items, null, 2)}

Return a JSON array with EXACTLY ${items.length} objects in the SAME ORDER:
[
  {
    "event": "<original event id>",
    "interactionName": "<object:action>",
    "reasoning": "<max 8 words explaining the choice>"
  }
]`

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature:      0.2,
        maxOutputTokens:  8192,
        thinkingConfig:   { thinkingBudget: 0 },
      },
    }),
  })

  if (!response.ok) {
    let msg = `Gemini API error ${response.status}`
    try { const e = await response.json(); msg = e.error?.message || msg } catch {}
    throw new Error(msg)
  }

  const data  = await response.json()
  const parts = data.candidates?.[0]?.content?.parts || []
  const raw   = parts.find(p => p.text && !p.thought)?.text || parts[0]?.text
  if (!raw) throw new Error('Empty response from Gemini API')

  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let suggestions
  try { suggestions = JSON.parse(text) } catch {
    throw new Error('Gemini response could not be parsed for event names.')
  }
  if (!Array.isArray(suggestions)) throw new Error('Unexpected response shape from Gemini API')

  return Object.fromEntries(
    suggestions
      .filter(s => s?.event && s?.interactionName)
      .map(s => [s.event.toLowerCase(), s.interactionName.toLowerCase().replace(/[^a-z0-9:]/g, '')])
  )
}

// Apply a suggestions map (from getAiMappingSuggestions) onto a rows array.
// Returns a new array — does not mutate.
export function applyAiSuggestions(rows, suggestions) {
  return rows.map(row => {
    const s = suggestions[row.variable.toLowerCase()]
    if (!s) return row
    return {
      ...row,
      suggestedXdmPath: s.suggestedPath,
      notes:            s.reasoning  || row.notes,
      _aiSuggested:     true,
      _aiConfidence:    s.confidence || 'medium',
    }
  })
}

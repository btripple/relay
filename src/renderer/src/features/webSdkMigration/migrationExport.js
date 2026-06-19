import * as XLSX from 'xlsx-js-style'

// ── Column definitions ────────────────────────────────────────────────────────

const MAPPING_COLS = [
  { header: 'Variable',           key: 'variable',         width: 20 },
  { header: 'Variable Type',      key: 'variableType',     width: 15 },
  { header: 'Example Value',      key: 'exampleValue',     width: 32 },
  { header: '# Rules Using',      key: 'rulesCount',       width: 12 },
  { header: 'Rules Using',        key: 'rulesUsing',       width: 42 },
  { header: 'Source',             key: 'sources',          width: 24 },
  { header: 'Suggested XDM Path', key: 'suggestedXdmPath', width: 58 },
  { header: 'Custom XDM Path',    key: 'customXdmPath',    width: 58 },
  { header: 'Web SDK Value',      key: 'webSdkValue',      width: 36 },
  { header: 'Notes',              key: 'notes',            width: 44 },
  { header: 'Skip (Yes/No)',      key: 'skip',             width: 14 },
]

const EVENT_COLS = [
  { header: 'Event',                          key: 'variable',        width: 14 },
  { header: 'Is Custom Event',                key: 'isCustom',        width: 16 },
  { header: 'Interaction Name',               key: 'interactionName', width: 52 },
  { header: 'XDM Path (commerce auto-mapped)',key: 'suggestedXdmPath',width: 40 },
  { header: '# Rules',                        key: 'rulesCount',      width: 10 },
  { header: 'Rules Using',                    key: 'rulesUsing',      width: 42 },
  { header: 'Skip (Yes/No)',                  key: 'skip',            width: 14 },
]

const RULES_COLS = [
  { header: 'Rule Name',          key: 'name',         width: 52 },
  { header: 'Enabled',            key: 'enabled',      width: 10 },
  { header: 'Has Set Variables',  key: 'hasSetVars',   width: 18 },
  { header: 'Has Send Beacon',    key: 'hasBeacon',    width: 17 },
  { header: 'Beacon Type',        key: 'beaconType',   width: 14 },
]

const HEADER_STYLE = {
  font:      { bold: true, color: { rgb: 'FFFFFF' } },
  fill:      { fgColor: { rgb: '1473e6' } },
  alignment: { horizontal: 'left' },
}

const MANUAL_STYLE = {
  fill: { fgColor: { rgb: 'FFF8E6' } },
  font: { color: { rgb: '92400E' } },
}

const IMPORTED_STYLE = {
  fill: { fgColor: { rgb: 'EBF4FF' } },
  font: { color: { rgb: '0D66D0' } },
}

const IS_CUSTOM_EVENT = /^event\d+$/i

// ── Export ────────────────────────────────────────────────────────────────────

export function exportMigrationExcel(mappingRows, aaRules, strategyName, propertyName) {
  const wb = XLSX.utils.book_new()

  const varRows   = mappingRows.filter(r => r.variableType !== 'event')
  const eventRows = mappingRows.filter(r => r.variableType === 'event')

  // Sheet 1: Variable Mapping (eVars, props, standard)
  const mapAoa = [
    MAPPING_COLS.map(c => c.header),
    ...varRows.map(r => MAPPING_COLS.map(c =>
      c.key === 'skip' ? (r.skip ? 'Yes' : 'No') : (r[c.key] ?? '')
    )),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(mapAoa)
  ws1['!cols'] = MAPPING_COLS.map(c => ({ wch: c.width }))

  MAPPING_COLS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: ci })
    if (ws1[ref]) ws1[ref].s = HEADER_STYLE
  })
  varRows.forEach((row, ri) => {
    if (!row.skip && row.requiresManualMapping && !row.customXdmPath) {
      MAPPING_COLS.forEach((_, ci) => {
        const ref = XLSX.utils.encode_cell({ r: ri + 1, c: ci })
        if (ws1[ref]) ws1[ref].s = MANUAL_STYLE
      })
    }
  })
  XLSX.utils.book_append_sheet(wb, ws1, 'Variable Mapping')

  // Sheet 2: Event Mapping (custom + commerce events)
  const eventAoa = [
    EVENT_COLS.map(c => c.header),
    ...eventRows.map(r => EVENT_COLS.map(c => {
      if (c.key === 'skip')     return r.skip ? 'Yes' : 'No'
      if (c.key === 'isCustom') return IS_CUSTOM_EVENT.test(r.variable) ? 'Yes' : 'No'
      return r[c.key] ?? ''
    })),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(eventAoa)
  ws2['!cols'] = EVENT_COLS.map(c => ({ wch: c.width }))
  EVENT_COLS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: ci })
    if (ws2[ref]) ws2[ref].s = HEADER_STYLE
  })
  // Highlight custom events without an interaction name
  eventRows.forEach((row, ri) => {
    if (!row.skip && IS_CUSTOM_EVENT.test(row.variable) && !row.interactionName) {
      EVENT_COLS.forEach((_, ci) => {
        const ref = XLSX.utils.encode_cell({ r: ri + 1, c: ci })
        if (ws2[ref]) ws2[ref].s = MANUAL_STYLE
      })
    }
  })
  XLSX.utils.book_append_sheet(wb, ws2, 'Event Mapping')

  // Sheet 3: Rules Overview
  const rulesAoa = [
    RULES_COLS.map(c => c.header),
    ...aaRules.map(r => [
      r.name,
      r.enabled    ? 'Yes' : 'No',
      r.hasSetVars ? 'Yes' : 'No',
      r.hasBeacon  ? 'Yes' : 'No',
      r.beaconType || '',
    ]),
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(rulesAoa)
  ws3['!cols'] = RULES_COLS.map(c => ({ wch: c.width }))
  RULES_COLS.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: ci })
    if (ws3[ref]) ws3[ref].s = HEADER_STYLE
  })
  XLSX.utils.book_append_sheet(wb, ws3, 'Rules Overview')

  // Sheet 4: Instructions
  const instructions = [
    ['Web SDK Migration — Variable & Event Mapping'],
    [],
    ['Property:',  propertyName || '(unknown)'],
    ['Strategy:',  strategyName || ''],
    ['Generated:', new Date().toLocaleString()],
    [],
    ['Variable Mapping sheet:'],
    ['1.', 'Review the Suggested XDM Path column for each eVar/prop.'],
    ['2.', 'Rows highlighted in yellow require manual mapping — fill in Custom XDM Path with your preferred XDM field path.'],
    ['3.', 'For CJA strategy, rename eVar/prop paths to descriptive semantic names (e.g. _tenantId.productCategory).'],
    ['4.', 'Set Skip (Yes/No) to Yes for any variables to exclude.'],
    [],
    ['Event Mapping sheet:'],
    ['5.', 'For custom events (Is Custom Event = Yes), fill in the Interaction Name column with a descriptive value.'],
    ['6.', 'In your Web SDK Send Event action, populate web.webInteraction.name with this value.'],
    ['7.', 'In your CJA Data View, create a metric that counts events where web.webInteraction.name equals the interaction name.'],
    ['8.', 'Commerce events (Is Custom Event = No) are auto-mapped to standard XDM paths — no action needed.'],
    [],
    ['Save the file and import it back into the Relay Web SDK Migration tool.'],
    [],
    ['Adobe XDM Schema References:'],
    ['XDM Field Catalog', 'https://experienceleague.adobe.com/docs/experience-platform/xdm/field-groups/event/analytics-full-extension.html'],
    ['Web SDK Send Event', 'https://experienceleague.adobe.com/docs/experience-platform/web-sdk/commands/sendevent/overview.html'],
    ['CJA Data View Metrics', 'https://experienceleague.adobe.com/docs/analytics-platform/using/cja-dataviews/create-dataview.html'],
  ]
  const ws4 = XLSX.utils.aoa_to_sheet(instructions)
  ws4['!cols'] = [{ wch: 28 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, ws4, 'Instructions')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })
}

// ── Import ────────────────────────────────────────────────────────────────────

export function importMigrationExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result)
        const wb   = XLSX.read(data, { type: 'array' })

        // ── Variable Mapping sheet ────────────────────────────────────────
        const wsVar = wb.Sheets['Variable Mapping']
        if (!wsVar) {
          reject(new Error('Could not find the "Variable Mapping" sheet. Make sure this is a Relay migration export.'))
          return
        }
        const varSheet = XLSX.utils.sheet_to_json(wsVar, { header: 1, defval: '' })
        if (varSheet.length < 2) { reject(new Error('The Variable Mapping sheet appears empty.')); return }

        const [varHeaders, ...varDataRows] = varSheet
        const vc = (name) => varHeaders.indexOf(name)

        const variableRows = varDataRows
          .filter(row => row[vc('Variable')])
          .map(row => ({
            variable:             String(row[vc('Variable')]          || ''),
            variableType:         String(row[vc('Variable Type')]     || ''),
            exampleValue:         String(row[vc('Example Value')]     || ''),
            rulesCount:           Number(row[vc('# Rules Using')])    || 0,
            rulesUsing:           String(row[vc('Rules Using')]       || ''),
            sources:              String(row[vc('Source')]            || ''),
            suggestedXdmPath:     String(row[vc('Suggested XDM Path')]|| ''),
            customXdmPath:        String(row[vc('Custom XDM Path')]   || ''),
            webSdkValue:          String(row[vc('Web SDK Value')]     || ''),
            notes:                String(row[vc('Notes')]             || ''),
            skip:                 String(row[vc('Skip (Yes/No)')] || '').toLowerCase() === 'yes',
            requiresManualMapping: !row[vc('Custom XDM Path')] && !row[vc('Suggested XDM Path')],
            _imported:            true,
          }))

        // ── Event Mapping sheet (optional — may not exist in older exports) ──
        const wsEvt = wb.Sheets['Event Mapping']
        let eventRows = []
        if (wsEvt) {
          const evtSheet = XLSX.utils.sheet_to_json(wsEvt, { header: 1, defval: '' })
          if (evtSheet.length >= 2) {
            const [evtHeaders, ...evtDataRows] = evtSheet
            const ec = (name) => evtHeaders.indexOf(name)

            eventRows = evtDataRows
              .filter(row => row[ec('Event')])
              .map(row => {
                const isCustom = String(row[ec('Is Custom Event')] || '').toLowerCase() === 'yes'
                return {
                  variable:             String(row[ec('Event')]           || ''),
                  variableType:         'event',
                  exampleValue:         '',
                  rulesCount:           Number(row[ec('# Rules')])        || 0,
                  rulesUsing:           String(row[ec('Rules Using')]     || ''),
                  sources:              '',
                  suggestedXdmPath:     isCustom ? 'web.webInteraction.name' : String(row[ec('XDM Path (commerce auto-mapped)')] || ''),
                  customXdmPath:        '',
                  webSdkValue:          '',
                  notes:                '',
                  skip:                 String(row[ec('Skip (Yes/No)')] || '').toLowerCase() === 'yes',
                  requiresManualMapping: false,
                  ...(isCustom ? { interactionName: String(row[ec('Interaction Name')] || '') } : {}),
                  _imported:            true,
                }
              })
          }
        }

        resolve([...variableRows, ...eventRows])
      } catch (err) {
        reject(new Error('Failed to parse the Excel file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read the selected file.'))
    reader.readAsArrayBuffer(file)
  })
}

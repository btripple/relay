const BASE = 'https://reactor.adobe.io'

export default class ReactorClient {
  constructor({ accessToken, clientId, orgId = null }) {
    this.accessToken = accessToken
    this.clientId = clientId
    this.orgId = orgId
  }

  async _fetch(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${BASE}${url}`
    const { method = 'GET', body } = options

    const result = await window.electronAPI.reactorApi({
      url: fullUrl,
      method,
      body,
      accessToken: this.accessToken,
      clientId: this.clientId,
      orgId: this.orgId
    })

    if (result.status === 204) return null

    if (result.status < 200 || result.status >= 300) {
      const rawBody = result.body || '(empty response body)'
      let msg = `HTTP ${result.status}: ${rawBody.substring(0, 300)}`
      try {
        const err = JSON.parse(result.body)
        const detail = err.errors?.[0]?.detail || err.errors?.[0]?.title || err.message
        if (detail) msg = `HTTP ${result.status}: ${detail}`
      } catch {}
      throw new Error(msg)
    }

    return result.body ? JSON.parse(result.body) : null
  }

  async _request(method, path, body) {
    return this._fetch(`${BASE}${path}`, { method, body })
  }

  async _fetchAll(startPath) {
    const results = []
    let url = startPath.startsWith('http') ? startPath : `${BASE}${startPath}`
    while (url) {
      const data = await this._fetch(url)
      results.push(...(data.data || []))
      url = data.links?.next || null
    }
    return results
  }

  async fetchExtensionsWithPackages(propertyId) {
    const results = []
    const packageMap = {}
    let url = `${BASE}/properties/${propertyId}/extensions?include=extension_package`
    while (url) {
      const data = await this._fetch(url, {})
      results.push(...(data.data || []))
      for (const inc of data.included || []) {
        if (inc.type === 'extension_packages') packageMap[inc.id] = inc.attributes.name
      }
      url = data.links?.next || null
    }
    return results.map(ext => ({
      ...ext,
      _packageName: packageMap[ext.relationships?.extension_package?.data?.id] || null
    }))
  }

  buildExtensionMap(srcExts, destExts) {
    const destByPkg = {}
    for (const ext of destExts) {
      if (ext._packageName) destByPkg[ext._packageName] = ext.id
    }
    const map = {}
    for (const ext of srcExts) {
      if (ext._packageName && destByPkg[ext._packageName]) {
        map[ext.id] = destByPkg[ext._packageName]
      }
    }
    return map
  }

  _remapExt(relationships, extMap) {
    const srcId = relationships?.extension?.data?.id
    if (!srcId) return relationships
    const destId = extMap[srcId]
    if (!destId) return relationships
    return { ...relationships, extension: { data: { id: destId, type: 'extensions' } } }
  }

  getCompanies() { return this._fetchAll('/companies') }
  getProperties(companyId) { return this._fetchAll(`/companies/${companyId}/properties`) }
  getRules(propertyId) { return this._fetchAll(`/properties/${propertyId}/rules`) }
  getDataElements(propertyId) { return this._fetchAll(`/properties/${propertyId}/data_elements`) }
  getRuleComponents(ruleId) { return this._fetchAll(`/rules/${ruleId}/rule_components`) }

  async auditProperty(propertyId, onProgress) {
    onProgress?.('Fetching extensions…', 5)
    const extensions = await this.fetchExtensionsWithPackages(propertyId)

    onProgress?.('Fetching rules…', 15)
    const rules = await this.getRules(propertyId)

    onProgress?.('Fetching data elements…', 25)
    const dataElements = await this.getDataElements(propertyId)

    // Fetch rule components concurrently (8 at a time)
    const ruleComponents = {}
    let done = 0
    const queue = [...rules]
    const workers = Array.from({ length: Math.min(8, queue.length || 1) }, async () => {
      while (queue.length > 0) {
        const rule = queue.shift()
        if (!rule) break
        ruleComponents[rule.id] = await this.getRuleComponents(rule.id)
        done++
        const pct = 30 + Math.round((done / rules.length) * 65)
        onProgress?.(`Fetching rule components (${done}/${rules.length})…`, pct)
      }
    })
    await Promise.all(workers)

    return { extensions, rules, dataElements, ruleComponents }
  }

  async createRule(propertyId, name, enabled) {
    const r = await this._request('POST', `/properties/${propertyId}/rules`, {
      data: { type: 'rules', attributes: { name, enabled } }
    })
    return r.data
  }

  async updateRule(ruleId, attrs) {
    const r = await this._request('PATCH', `/rules/${ruleId}`, {
      data: { type: 'rules', id: ruleId, attributes: attrs }
    })
    return r.data
  }

  async createRuleComponent(propertyId, ruleId, comp, extMap) {
    const attrs = {}
    const keep = ['delegate_descriptor_id', 'settings', 'order', 'rule_order', 'timeout', 'negate', 'name']
    for (const k of keep) {
      if (comp.attributes[k] !== undefined) attrs[k] = comp.attributes[k]
    }
    const r = await this._request('POST', `/properties/${propertyId}/rule_components`, {
      data: {
        type: 'rule_components',
        attributes: attrs,
        relationships: {
          ...this._remapExt(comp.relationships, extMap),
          rules: { data: [{ id: ruleId, type: 'rules' }] }
        }
      }
    })
    return r.data
  }

  deleteRuleComponent(id) { return this._request('DELETE', `/rule_components/${id}`) }

  async createDataElement(propertyId, de, extMap) {
    const attrs = {}
    const keep = ['name', 'delegate_descriptor_id', 'settings', 'enabled',
                  'default_value', 'force_lower_case', 'storage_duration', 'clean_text']
    for (const k of keep) {
      if (de.attributes[k] !== undefined) attrs[k] = de.attributes[k]
    }
    const r = await this._request('POST', `/properties/${propertyId}/data_elements`, {
      data: {
        type: 'data_elements',
        attributes: attrs,
        relationships: this._remapExt(de.relationships, extMap)
      }
    })
    return r.data
  }

  async updateDataElement(deId, de, extMap) {
    const attrs = {}
    const keep = ['name', 'delegate_descriptor_id', 'settings', 'enabled',
                  'default_value', 'force_lower_case', 'storage_duration', 'clean_text']
    for (const k of keep) {
      if (de.attributes[k] !== undefined) attrs[k] = de.attributes[k]
    }
    const r = await this._request('PATCH', `/data_elements/${deId}`, {
      data: {
        type: 'data_elements',
        id: deId,
        attributes: attrs,
        relationships: this._remapExt(de.relationships, extMap)
      }
    })
    return r.data
  }

  async compareAssets(srcPropId, destPropId) {
    const [srcRules, destRules, srcDEs, destDEs] = await Promise.all([
      this.getRules(srcPropId),
      this.getRules(destPropId),
      this.getDataElements(srcPropId),
      this.getDataElements(destPropId)
    ])
    const byName = arr => arr.slice().sort((a, b) => a.attributes.name.localeCompare(b.attributes.name))
    const diff = (src, dest) => {
      const srcNames = new Set(src.map(i => i.attributes.name))
      const destNames = new Set(dest.map(i => i.attributes.name))
      return {
        matched: byName(src.filter(i => destNames.has(i.attributes.name))),
        missingFromDest: byName(src.filter(i => !destNames.has(i.attributes.name))),
        extraInDest: byName(dest.filter(i => !srcNames.has(i.attributes.name)))
      }
    }
    return {
      rules: diff(srcRules, destRules),
      dataElements: diff(srcDEs, destDEs)
    }
  }

  async copyAssets(srcPropId, destPropId, rules, dataElements, { overwrite }, onProgress) {
    const log = []
    const destRuleIds = []
    const destDEIds = []
    const emit = (type, message) => { log.push({ type, message }); onProgress?.([...log]) }

    const [srcExts, destExts] = await Promise.all([
      this.fetchExtensionsWithPackages(srcPropId),
      this.fetchExtensionsWithPackages(destPropId)
    ])
    const extMap = this.buildExtensionMap(srcExts, destExts)

    const unmapped = srcExts.filter(e => e._packageName && !extMap[e.id]).map(e => e._packageName)
    if (unmapped.length) {
      emit('warning', `Extensions not in destination (assets using these may fail): ${[...new Set(unmapped)].join(', ')}`)
    }

    // Data elements
    if (dataElements.length) {
      const destDEs = await this.getDataElements(destPropId)
      const destByName = Object.fromEntries(destDEs.map(d => [d.attributes.name, d]))

      for (const de of dataElements) {
        const name = de.attributes.name
        try {
          const existing = destByName[name]
          if (existing && overwrite) {
            await this.updateDataElement(existing.id, de, extMap)
            destDEIds.push(existing.id)
            emit('success', `Updated data element: ${name}`)
          } else if (existing) {
            emit('skipped', `Skipped (exists): ${name}`)
          } else {
            const created = await this.createDataElement(destPropId, de, extMap)
            destDEIds.push(created.id)
            emit('success', `Created data element: ${name}`)
          }
        } catch (err) {
          emit('error', `Failed data element "${name}": ${err.message}`)
        }
      }
    }

    // Rules
    if (rules.length) {
      const destRules = await this.getRules(destPropId)
      const destByName = Object.fromEntries(destRules.map(r => [r.attributes.name, r]))

      for (const rule of rules) {
        const name = rule.attributes.name
        try {
          const components = await this.getRuleComponents(rule.id)
          const existing = destByName[name]

          if (existing && overwrite) {
            await this.updateRule(existing.id, { name, enabled: rule.attributes.enabled })
            const existingComps = await this.getRuleComponents(existing.id)
            for (const c of existingComps) await this.deleteRuleComponent(c.id)
            for (const c of components) await this.createRuleComponent(destPropId, existing.id, c, extMap)
            destRuleIds.push(existing.id)
            emit('success', `Updated rule: ${name}`)
          } else if (existing) {
            emit('skipped', `Skipped (exists): ${name}`)
          } else {
            const newRule = await this.createRule(destPropId, name, rule.attributes.enabled)
            for (const c of components) await this.createRuleComponent(destPropId, newRule.id, c, extMap)
            destRuleIds.push(newRule.id)
            emit('success', `Created rule: ${name}`)
          }
        } catch (err) {
          emit('error', `Failed rule "${name}": ${err.message}`)
        }
      }
    }

    return { log, destRuleIds, destDEIds }
  }

  async exportProperty(propertyId, onProgress) {
    onProgress?.('Fetching extensions…', 5)
    const extensions = await this.fetchExtensionsWithPackages(propertyId)

    onProgress?.('Fetching rules…', 15)
    const rules = await this.getRules(propertyId)

    onProgress?.('Fetching data elements…', 30)
    const dataElements = await this.getDataElements(propertyId)

    let done = 0
    const queue = [...rules]
    const workers = Array.from({ length: Math.min(8, queue.length || 1) }, async () => {
      while (queue.length > 0) {
        const rule = queue.shift()
        if (!rule) break
        rule._components = await this.getRuleComponents(rule.id)
        done++
        const pct = 35 + Math.round((done / (rules.length || 1)) * 60)
        onProgress?.(`Fetching rule components (${done}/${rules.length})…`, pct)
      }
    })
    await Promise.all(workers)

    return { version: 1, exportedAt: new Date().toISOString(), extensions, rules, dataElements }
  }

  async importAssets(destPropId, exportData, { overwrite = false }, onProgress) {
    const log = []
    const destRuleIds = []
    const destDEIds = []
    const emit = (type, message) => { log.push({ type, message }); onProgress?.([...log]) }

    const destExts = await this.fetchExtensionsWithPackages(destPropId)
    const srcExts = exportData.extensions || []
    const extMap = this.buildExtensionMap(srcExts, destExts)

    const unmapped = srcExts.filter(e => e._packageName && !extMap[e.id]).map(e => e._packageName)
    if (unmapped.length) {
      emit('warning', `Extensions not in destination (assets using these may fail): ${[...new Set(unmapped)].join(', ')}`)
    }

    const { dataElements = [], rules = [] } = exportData

    if (dataElements.length) {
      const destDEs = await this.getDataElements(destPropId)
      const destByName = Object.fromEntries(destDEs.map(d => [d.attributes.name, d]))

      for (const de of dataElements) {
        const name = de.attributes.name
        try {
          const existing = destByName[name]
          if (existing && overwrite) {
            await this.updateDataElement(existing.id, de, extMap)
            destDEIds.push(existing.id)
            emit('success', `Updated data element: ${name}`)
          } else if (existing) {
            emit('skipped', `Skipped (exists): ${name}`)
          } else {
            const created = await this.createDataElement(destPropId, de, extMap)
            destDEIds.push(created.id)
            emit('success', `Created data element: ${name}`)
          }
        } catch (err) {
          emit('error', `Failed data element "${name}": ${err.message}`)
        }
      }
    }

    if (rules.length) {
      const destRules = await this.getRules(destPropId)
      const destByName = Object.fromEntries(destRules.map(r => [r.attributes.name, r]))

      for (const rule of rules) {
        const name = rule.attributes.name
        const components = rule._components || []
        try {
          const existing = destByName[name]
          if (existing && overwrite) {
            await this.updateRule(existing.id, { name, enabled: rule.attributes.enabled })
            const existingComps = await this.getRuleComponents(existing.id)
            for (const c of existingComps) await this.deleteRuleComponent(c.id)
            for (const c of components) await this.createRuleComponent(destPropId, existing.id, c, extMap)
            destRuleIds.push(existing.id)
            emit('success', `Updated rule: ${name}`)
          } else if (existing) {
            emit('skipped', `Skipped (exists): ${name}`)
          } else {
            const newRule = await this.createRule(destPropId, name, rule.attributes.enabled)
            for (const c of components) await this.createRuleComponent(destPropId, newRule.id, c, extMap)
            destRuleIds.push(newRule.id)
            emit('success', `Created rule: ${name}`)
          }
        } catch (err) {
          emit('error', `Failed rule "${name}": ${err.message}`)
        }
      }
    }

    return { log, destRuleIds, destDEIds }
  }

  async getLibraries(propertyId) {
    const libs = await this._fetchAll(`/properties/${propertyId}/libraries`)
    return libs.filter(l => l.attributes.state !== 'published')
  }

  async createLibrary(propertyId, name) {
    const r = await this._request('POST', `/properties/${propertyId}/libraries`, {
      data: { type: 'libraries', attributes: { name } }
    })
    return r.data
  }

  async addToLibrary(libraryId, ruleIds, deIds) {
    const calls = []
    if (ruleIds.length) {
      calls.push(this._request('POST', `/libraries/${libraryId}/relationships/rules`, {
        data: ruleIds.map(id => ({ id, type: 'rules', meta: { action: 'revise' } }))
      }))
    }
    if (deIds.length) {
      calls.push(this._request('POST', `/libraries/${libraryId}/relationships/data_elements`, {
        data: deIds.map(id => ({ id, type: 'data_elements', meta: { action: 'revise' } }))
      }))
    }
    if (calls.length) await Promise.all(calls)
  }
}

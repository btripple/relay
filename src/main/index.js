import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import https from 'https'
import fs from 'fs'
import path from 'path'

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) }
  catch { return {} }
}

function saveSettings(s) {
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2))
}

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString()
    const req = https.request(
      { hostname, path, method: 'POST', headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let buf = ''
        res.on('data', c => (buf += c))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(buf)
            if (parsed.error) reject(new Error(parsed.error_description || parsed.error))
            else resolve(parsed)
          } catch (e) { reject(e) }
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f7f8fa'
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('get-settings', () => loadSettings())
ipcMain.handle('save-settings', (_, s) => { saveSettings(s); return true })

ipcMain.handle('get-token', (_, { clientId, clientSecret }) => {
  return httpsPost('ims-na1.adobelogin.com', '/ims/token/v3', {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'AdobeID,openid,read_organizations,additional_info.job_function,additional_info.projectedProductContext,additional_info.roles'
  })
})

ipcMain.handle('reactor-api', (_, { url, method = 'GET', body, accessToken, clientId, orgId }) => {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const bodyStr = body ? JSON.stringify(body) : null

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': clientId,
      Accept: 'application/vnd.api+json;revision=1'
    }
    if (orgId) headers['x-gw-ims-org-id'] = orgId
    if (bodyStr) {
      headers['Content-Type'] = 'application/vnd.api+json'
      headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }

    console.log(`[Reactor] ${method} ${url}`)
    console.log(`[Reactor] api-key: ${clientId}`)
    console.log(`[Reactor] org:     ${orgId}`)
    console.log(`[Reactor] token:   ${accessToken ? accessToken.substring(0, 40) + '...' : 'MISSING'}`)
    if (bodyStr) console.log(`[Reactor] body:    ${bodyStr.substring(0, 500)}`)

    const req = https.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method, headers },
      (res) => {
        let buf = ''
        res.on('data', c => (buf += c))
        res.on('end', () => {
          console.log(`[Reactor] <- ${res.statusCode}`)
          console.log(`[Reactor] body: ${buf || '(empty)'}`)
          resolve({ status: res.statusCode, body: buf })
        })
      }
    )
    req.on('error', (err) => {
      console.error(`[Reactor] request error:`, err.message)
      reject(err)
    })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
})

ipcMain.handle('open-file', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return null
  return fs.readFileSync(filePaths[0], 'utf-8')
})

ipcMain.handle('save-file', async (_, base64Data, defaultName) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  })
  if (canceled || !filePath) return { saved: false }
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
  return { saved: true, filePath }
})

ipcMain.handle('save-json', async (_, data, defaultName) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { saved: false }
  fs.writeFileSync(filePath, data, 'utf-8')
  return { saved: true, filePath }
})

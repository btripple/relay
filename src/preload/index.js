import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  getToken: (credentials) => ipcRenderer.invoke('get-token', credentials),
  reactorApi: (params) => ipcRenderer.invoke('reactor-api', params),
  saveFile: (base64Data, defaultName) => ipcRenderer.invoke('save-file', base64Data, defaultName),
  saveJson: (data, defaultName) => ipcRenderer.invoke('save-json', data, defaultName),
  openFile: () => ipcRenderer.invoke('open-file')
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gitbro', {
  selectRepo: () => ipcRenderer.invoke('gitbro:selectRepo'),
  openRepo: (path) => ipcRenderer.invoke('gitbro:openRepo', path),
  run: (cmd, cwd) => ipcRenderer.invoke('gitbro:run', cmd, cwd),
  hostCloud: (port) => ipcRenderer.invoke('gitbro:hostCloud', port),
  stopCloud: () => ipcRenderer.invoke('gitbro:stopCloud')
})

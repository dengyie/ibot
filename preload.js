const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('petAPI', {
  getAnimations: () => ipcRenderer.invoke('pet:get-animations'),
  getBounds: () => ipcRenderer.invoke('pet:get-bounds'),
  setPosition: (point) => ipcRenderer.send('pet:set-position', point),
  moveBy: (delta) => ipcRenderer.send('pet:move-by', delta),
  quit: () => ipcRenderer.send('pet:quit')
})

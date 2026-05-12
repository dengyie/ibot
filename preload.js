const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('petAPI', {
  getAnimations: () => ipcRenderer.invoke('pet:get-animations'),
  getBounds: () => ipcRenderer.invoke('pet:get-bounds'),
  getMovementState: () => ipcRenderer.invoke('pet:get-movement-state'),
  setPosition: (point) => ipcRenderer.send('pet:set-position', point),
  moveBy: (delta) => ipcRenderer.invoke('pet:move-by', delta),
  quit: () => ipcRenderer.send('pet:quit')
})

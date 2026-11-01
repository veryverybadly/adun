const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('overlay', {
  updateRect(rect) {
    ipcRenderer.send('cube:rect', rect)
  },
  setDragging(value) {
    ipcRenderer.send('cube:dragging', Boolean(value))
  },
  onReset(callback) {
    ipcRenderer.on('cube:reset', callback)
  },
  onDisplayChanged(callback) {
    ipcRenderer.on('display:changed', (_event, data) => callback(data))
  }
})

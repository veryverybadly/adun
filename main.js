
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  screen,
  ipcMain,
  nativeImage
} = require('electron')
const path = require('node:path')

let win
let control
let tray
let quitting = false
let ignoringMouse = true
let cubeRect = null
let dragging = false
let cursorPoll = null

function getWorkArea() {
  return screen.getPrimaryDisplay().workArea
}

function createWindow() {
  const area = getWorkArea()

  win = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.loadFile(path.join(__dirname, 'index.html'))

  win.once('ready-to-show', () => {
    if (!win || win.isDestroyed()) return
    win.showInactive()
    win.setAlwaysOnTop(true, 'screen-saver')
  })

  win.on('closed', () => {
    win = null
  })
}

function createControlWindow() {
  control = new BrowserWindow({
    width: 340,
    height: 180,
    title: 'Adun Overlay',
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#181818',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  control.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box }
        body {
          margin: 0;
          padding: 24px;
          background: #181818;
          color: #eee;
          font: 14px "Segoe UI", sans-serif;
        }
        h2 { margin: 0 0 8px; font-size: 20px }
        p { color: #999; margin: 0 0 22px }
        button {
          border: 0;
          border-radius: 7px;
          padding: 10px 16px;
          background: #333;
          color: white;
          cursor: pointer;
          margin-right: 8px;
        }
        button:hover { background: #444 }
        .exit { background: #a83232 }
        .exit:hover { background: #c13c3c }
      </style>
    </head>
    <body>
      <h2>Adun Overlay</h2>
      <p>3D-кубик работает в фоновом режиме</p>
      <button onclick="window.close()">Скрыть</button>
      <button class="exit" onclick="window.close()">Выход</button>
    </body>
    </html>
  `))

  control.once('ready-to-show', () => {
    if (control && !control.isDestroyed()) control.show()
  })

  control.on('close', event => {
    if (!quitting) {
      event.preventDefault()
      quitApp()
    }
  })

  control.on('closed', () => {
    control = null
  })
}

function setMouseIgnore(value) {
  if (!win || win.isDestroyed() || ignoringMouse === value) return
  ignoringMouse = value
  win.setIgnoreMouseEvents(value, { forward: true })
}

function pointInsideCube(point, rect, margin = 5) {
  if (!rect) return false
  return point.x >= rect.x - margin &&
    point.x <= rect.x + rect.width + margin &&
    point.y >= rect.y - margin &&
    point.y <= rect.y + rect.height + margin
}

function pollCursor() {
  if (!win || win.isDestroyed()) return
  const cursor = screen.getCursorScreenPoint()
  const bounds = win.getBounds()
  const localPoint = { x: cursor.x - bounds.x, y: cursor.y - bounds.y }
  setMouseIgnore(!(dragging || pointInsideCube(localPoint, cubeRect)))
}

function resetPosition() {
  if (win && !win.isDestroyed()) win.webContents.send('cube:reset')
}

function createTray() {
  const iconData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
  const icon = nativeImage.createFromBuffer(Buffer.from(iconData, 'base64'))
    .resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip('Adun Overlay')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть управление', click: () => control && control.show() },
    { label: 'Сбросить позицию', click: resetPosition },
    { type: 'separator' },
    { label: 'Выход', click: quitApp }
  ]))
  tray.on('double-click', () => control && control.show())
}

function quitApp() {
  if (quitting) return
  quitting = true

  if (cursorPoll) clearInterval(cursorPoll)
  globalShortcut.unregisterAll()

  if (tray) {
    tray.destroy()
    tray = null
  }

  if (control && !control.isDestroyed()) {
    control.destroy()
    control = null
  }

  if (win && !win.isDestroyed()) {
    win.destroy()
    win = null
  }

  app.quit()
}

function updateWorkArea() {
  if (!win || win.isDestroyed()) return
  const area = getWorkArea()
  win.setBounds({ x: area.x, y: area.y, width: area.width, height: area.height })
  win.webContents.send('display:changed', {
    width: area.width,
    height: area.height
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('ru.b4dly.adunoverlay')

  createWindow()
  createControlWindow()
  createTray()

  globalShortcut.register('CommandOrControl+Shift+Q', quitApp)
  cursorPoll = setInterval(pollCursor, 16)

  screen.on('display-metrics-changed', updateWorkArea)
  screen.on('display-added', updateWorkArea)
  screen.on('display-removed', updateWorkArea)

  ipcMain.on('cube:rect', (_event, rect) => {
    if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
      cubeRect = rect
    }
  })

  ipcMain.on('cube:dragging', (_event, value) => {
    dragging = Boolean(value)
    if (dragging) setMouseIgnore(false)
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => {})

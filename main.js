const { app, BrowserWindow, ipcMain, screen } = require('electron')
const fs = require('fs')
const path = require('path')

let petWindow
const framesRoot = path.join(__dirname, 'cat_anime', 'flames')

const actionLabels = {
  idle: '待机',
  bai: '待机',
  bai_no_bg: '待机',
  eat: '喂食',
  eat_no_bg: '喂食'
}

const isImageFile = (fileName) => /\.(png|jpe?g|webp|gif)$/i.test(fileName)

const compareFrameName = (left, right) => {
  const leftNumber = Number(left.match(/\d+/)?.[0] || 0)
  const rightNumber = Number(right.match(/\d+/)?.[0] || 0)

  return leftNumber === rightNumber
    ? left.localeCompare(right)
    : leftNumber - rightNumber
}

const toActionLabel = (folderName) => {
  if (actionLabels[folderName]) return actionLabels[folderName]

  return folderName
    .replace(/_?no_?bg$/i, '')
    .replace(/[-_]+/g, ' ')
}

const isLoopAction = (folderName) => /(^idle$|bai|stand|walk|loop)/i.test(folderName)

const getPetAnimations = () => {
  if (!fs.existsSync(framesRoot)) {
    return { defaultAction: '', clickAction: '', actions: [] }
  }

  // 每个子文件夹就是一个动作；文件夹内图片按数字顺序作为逐帧动画播放。
  const actions = fs.readdirSync(framesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folder = path.join(framesRoot, entry.name)
      const frames = fs.readdirSync(folder)
        .filter(isImageFile)
        .sort(compareFrameName)
        .map((fileName) => path.posix.join('cat_anime', 'flames', entry.name, fileName))

      return {
        id: entry.name,
        label: toActionLabel(entry.name),
        frames,
        frameMs: /eat/i.test(entry.name) ? 85 : 95,
        loop: isLoopAction(entry.name)
      }
    })
    .filter((action) => action.frames.length > 0)

  const defaultAction = actions.find((action) => /^idle$/i.test(action.id))?.id
    || actions.find((action) => /bai/i.test(action.id))?.id
    || actions[0]?.id
    || ''
  const clickAction = actions.find((action) => /eat/i.test(action.id))?.id
    || actions.find((action) => action.id !== defaultAction)?.id
    || defaultAction

  return { defaultAction, clickAction, actions }
}

const clampToWorkArea = (win, x, y) => {
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching({ x, y, width: bounds.width, height: bounds.height })
  const { workArea } = display

  return {
    x: Math.min(Math.max(Math.round(x), workArea.x), workArea.x + workArea.width - bounds.width),
    y: Math.min(Math.max(Math.round(y), workArea.y), workArea.y + workArea.height - bounds.height)
  }
}

const createWindow = () => {
  petWindow = new BrowserWindow({
    width: 260,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const { workArea } = screen.getPrimaryDisplay()
  petWindow.setPosition(
    workArea.x + workArea.width - 300,
    workArea.y + workArea.height - 300
  )
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('pet:get-animations', () => getPetAnimations())

ipcMain.handle('pet:get-bounds', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win.getBounds()
})

ipcMain.on('pet:set-position', (event, point) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !point) return

  const next = clampToWorkArea(win, point.x, point.y)
  win.setPosition(next.x, next.y)
})

ipcMain.on('pet:move-by', (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !delta) return

  const [x, y] = win.getPosition()
  const next = clampToWorkArea(win, x + delta.x, y + delta.y)
  win.setPosition(next.x, next.y)
})

ipcMain.on('pet:quit', () => {
  app.quit()
})

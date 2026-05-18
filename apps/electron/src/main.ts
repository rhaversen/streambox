import { app, BrowserWindow, globalShortcut } from 'electron'
import path from 'path'

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: !isDev,
    width: isDev ? 1280 : undefined,
    height: isDev ? 720 : undefined,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  if (isDev) {
    void win.loadURL('http://localhost:3000')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(__dirname, '../../ui/dist/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()

  if (isDev) {
    globalShortcut.register('Escape', () => app.quit())
  }
})

app.on('window-all-closed', () => app.quit())

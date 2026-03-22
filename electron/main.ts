import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { setupSimulatorManager } from './simulators/manager.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as https from 'https';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = !app.isPackaged;

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'OpenEFB/0.1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: https://*.cartocdn.com https://*.tile.openstreetmap.org https://*.amazonaws.com; " +
          "connect-src 'self' https://data.vatsim.net https://api.ivao.aero https://www.hoppie.nl https://aviationweather.gov https://www.simbrief.com https://*.cartocdn.com https://charts.api.navigraph.com https://identity.api.navigraph.com https://api.vatsim.net https://atc.vatsim.net https://data.ivao.aero"
        ],
      },
    });
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }

  return win;
}

ipcMain.handle('win:minimize',    (_e, _a, win = BrowserWindow.getFocusedWindow()) => win?.minimize());
ipcMain.handle('win:maximize',    (_e, _a, win = BrowserWindow.getFocusedWindow()) => win?.isMaximized() ? win.unmaximize() : win?.maximize());
ipcMain.handle('win:close',       (_e, _a, win = BrowserWindow.getFocusedWindow()) => win?.close());
ipcMain.handle('win:is-maximized',(_e, _a, win = BrowserWindow.getFocusedWindow()) => win?.isMaximized() ?? false);
ipcMain.handle('win:platform',    () => process.platform);

ipcMain.handle('open-external', (_event, url: string) => {
  // Only allow https:// URLs
  if (typeof url === 'string' && url.startsWith('https://')) {
    shell.openExternal(url);
  }
});

ipcMain.handle('fetch-avwx-metar', async (_event, icao: string) => {
  const url = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=json`;
  return fetchJson(url);
});

function setupUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = true;

  const send = (status: string, info?: unknown) =>
    win.webContents.send('update-status', { status, info });

  autoUpdater.on('checking-for-update',  ()     => send('checking'));
  autoUpdater.on('update-available',     (info) => send('available', info));
  autoUpdater.on('update-not-available', (info) => send('not-available', info));
  autoUpdater.on('error',                (err)  => send('error', err.message));
  autoUpdater.on('download-progress',    (p)    => send('progress', Math.round(p.percent)));
  autoUpdater.on('update-downloaded',    (info) => send('downloaded', info));

  // Check on startup, then every 4 hours
  if (!isDev) {
    autoUpdater.checkForUpdates();
    setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
  }

  ipcMain.handle('check-for-updates', () => {
    if (isDev) { send('not-available'); return; }
    autoUpdater.checkForUpdates();
  });

  ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());
}

app.whenReady().then(() => {
  const win = createWindow();
  setupUpdater(win);
  setupSimulatorManager(win);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

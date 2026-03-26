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
    https.get(url, { headers: { 'User-Agent': 'OpsLink/0.1.0' } }, (res) => {
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
          "connect-src 'self' https://data.vatsim.net https://api.ivao.aero https://www.hoppie.nl https://aviationweather.gov https://www.simbrief.com https://*.cartocdn.com https://charts.api.navigraph.com https://identity.api.navigraph.com https://api.vatsim.net https://atc.vatsim.net https://data.ivao.aero https://raw.githubusercontent.com"
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
ipcMain.handle('app:version',     () => app.getVersion());

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

  // Configure channel based on app version — must happen before first checkForUpdates()
  // channel is baked into app-update.yml at build time (generic provider for dev, github for stable)
  const isPreRelease = /-(dev|alpha|beta)/.test(app.getVersion());
  autoUpdater.allowDowngrade  = isPreRelease;
  autoUpdater.allowPrerelease = isPreRelease;

  const send = (status: string, info?: unknown) =>
    win.webContents.send('update-status', { status, info });

  autoUpdater.on('checking-for-update',  ()     => send('checking'));
  autoUpdater.on('update-available',     (info) => send('available', info));
  autoUpdater.on('update-not-available', (info) => send('not-available', info));
  autoUpdater.on('error', (err) => {
    const msg = err.message ?? '';
    if (msg.includes('Unable to find latest release') || msg.includes('No published versions'))
      send('error', 'No release found for this channel.');
    else if (msg.includes('net::') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED'))
      send('error', 'Network error — check your connection.');
    else
      send('error', 'Update check failed.');
  });
  autoUpdater.on('download-progress',    (p)    => send('progress', Math.round(p.percent)));

  let updateReady = false;
  let downloadedFile = '';
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    downloadedFile = info.downloadedFile ?? '';
    send('downloaded', info);
  });

  // isDev = running unpackaged (Vite dev server) — skip auto-updater entirely
  if (!isDev) {
    setTimeout(() => { if (!updateReady) autoUpdater.checkForUpdates(); }, 5000);
    setInterval(() => { if (!updateReady) autoUpdater.checkForUpdates(); }, 4 * 60 * 60 * 1000);
  }

  ipcMain.handle('check-for-updates', () => {
    if (isDev) { send('not-available'); return; }
    autoUpdater.checkForUpdates();
  });

  ipcMain.handle('set-update-channel', (_e, channel: string) => {
    const preRelease = channel === 'dev';
    autoUpdater.allowDowngrade  = preRelease;
    autoUpdater.allowPrerelease = preRelease;
  });

  ipcMain.handle('install-update', () => {
    if (process.platform === 'darwin' && downloadedFile) {
      // Unsigned macOS apps can't self-replace — open the DMG so the user can drag-install
      shell.openPath(downloadedFile).catch(() => shell.showItemInFolder(downloadedFile));
      return;
    }
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch {
      if (downloadedFile) shell.showItemInFolder(downloadedFile);
      else send('error', 'Neustart fehlgeschlagen — bitte manuell neu starten.');
    }
  });
}

app.whenReady().then(() => {
  const win = createWindow();
  setupUpdater(win);
  setupSimulatorManager(win);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

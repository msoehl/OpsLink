import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  fetchAvwxMetar:   (icao: string)  => ipcRenderer.invoke('fetch-avwx-metar', icao),
  fetchGeojson:     (url: string)   => ipcRenderer.invoke('fetch-geojson', url),
  openExternal:     (url: string)   => ipcRenderer.invoke('open-external', url),
  checkForUpdates:  ()              => ipcRenderer.invoke('check-for-updates'),
  setUpdateChannel: (ch: string)    => ipcRenderer.invoke('set-update-channel', ch),
  downloadUpdate:   ()              => ipcRenderer.invoke('download-update'),
  installUpdate:    ()              => ipcRenderer.invoke('install-update'),
  onUpdateStatus:   (cb: (payload: { status: string; info?: unknown }) => void) => {
    const listener = (_e: unknown, payload: { status: string; info?: unknown }) => cb(payload);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  onSimPosition: (cb: (pos: unknown) => void) => {
    ipcRenderer.on('sim:position', (_e, pos) => cb(pos));
    return () => ipcRenderer.removeAllListeners('sim:position');
  },
  onSimStatus: (cb: (status: { connected: boolean; source: string | null }) => void) => {
    ipcRenderer.on('sim:status', (_e, status) => cb(status));
    return () => ipcRenderer.removeAllListeners('sim:status');
  },
  appVersion:      () => ipcRenderer.invoke('app:version'),
  platform:        () => ipcRenderer.invoke('win:platform'),
  windowMinimize:  () => ipcRenderer.invoke('win:minimize'),
  windowMaximize:  () => ipcRenderer.invoke('win:maximize'),
  windowClose:     () => ipcRenderer.invoke('win:close'),
  windowIsMaximized: () => ipcRenderer.invoke('win:is-maximized'),
});

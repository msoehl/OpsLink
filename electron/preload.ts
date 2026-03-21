import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  fetchAvwxMetar:   (icao: string)  => ipcRenderer.invoke('fetch-avwx-metar', icao),
  openExternal:     (url: string)   => ipcRenderer.invoke('open-external', url),
  checkForUpdates:  ()              => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate:   ()              => ipcRenderer.invoke('download-update'),
  installUpdate:    ()              => ipcRenderer.invoke('install-update'),
  onUpdateStatus:   (cb: (payload: { status: string; info?: unknown }) => void) => {
    ipcRenderer.on('update-status', (_e, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners('update-status');
  },
});

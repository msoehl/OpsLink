import type { BrowserWindow } from 'electron';
import type { SimPosition, StatusCallback, PositionCallback } from './types.js';
import { startSimConnectConnector } from './simconnect.js';
import { startXPlaneConnector } from './xplane.js';

/** Starts all simulator connectors and forwards position/status via IPC.
 *  Multiple connectors can be active — last position received wins.
 *  Connected/source status is tracked per-connector; overall status reflects
 *  whichever is currently active. */
export function setupSimulatorManager(win: BrowserWindow) {
  // Track which sources are currently connected
  const connectedSources = new Set<'msfs' | 'p3d' | 'xplane'>();

  // Current status — returned synchronously when renderer requests it on mount
  let currentStatus: { connected: boolean; source: 'msfs' | 'p3d' | 'xplane' | null } = {
    connected: false,
    source: null,
  };

  const onPosition: PositionCallback = (pos: SimPosition) => {
    if (!win.isDestroyed()) {
      win.webContents.send('sim:position', pos);
    }
  };

  const onStatus: StatusCallback = (connected, source) => {
    if (source) {
      if (connected) {
        // MSFS (KittyHawk) takes priority — if MSFS is already connected, ignore a P3D connect,
        // and if MSFS connects while P3D was connected, evict P3D.
        if (source === 'p3d' && connectedSources.has('msfs')) return;
        if (source === 'msfs') connectedSources.delete('p3d');
        connectedSources.add(source);
      } else {
        connectedSources.delete(source);
      }
    }

    const activeSource = connectedSources.size > 0
      ? [...connectedSources][connectedSources.size - 1]
      : null;

    currentStatus = { connected: connectedSources.size > 0, source: activeSource };

    if (!win.isDestroyed()) {
      win.webContents.send('sim:status', currentStatus);
    }
  };

  const getStatus = () => currentStatus;

  const stopSimConnect = startSimConnectConnector(onPosition, onStatus);
  const stopXPlane    = startXPlaneConnector(onPosition, onStatus);

  return {
    stop: () => { stopSimConnect(); stopXPlane(); },
    getStatus,
  };
}

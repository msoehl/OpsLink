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

  const onPosition: PositionCallback = (pos: SimPosition) => {
    if (!win.isDestroyed()) {
      win.webContents.send('sim:position', pos);
    }
  };

  const onStatus: StatusCallback = (connected, source) => {
    if (source) {
      if (connected) {
        connectedSources.add(source);
      } else {
        connectedSources.delete(source);
      }
    }

    const activeSource = connectedSources.size > 0
      ? [...connectedSources][connectedSources.size - 1]
      : null;

    if (!win.isDestroyed()) {
      win.webContents.send('sim:status', {
        connected: connectedSources.size > 0,
        source: activeSource,
      });
    }
  };

  const stopSimConnect = startSimConnectConnector(onPosition, onStatus);
  const stopXPlane    = startXPlaneConnector(onPosition, onStatus);

  return () => {
    stopSimConnect();
    stopXPlane();
  };
}

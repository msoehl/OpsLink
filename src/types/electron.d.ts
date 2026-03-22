import type { SimPosition } from './simulator';

declare global {
  interface Window {
    electronAPI?: {
      fetchAvwxMetar:  (icao: string)  => Promise<unknown>;
      openExternal:    (url: string)   => Promise<void>;
      checkForUpdates: ()              => Promise<void>;
      downloadUpdate:  ()              => Promise<void>;
      installUpdate:   ()              => Promise<void>;
      onUpdateStatus:  (cb: (payload: { status: string; info?: unknown }) => void) => () => void;
      onSimPosition:   (cb: (pos: SimPosition) => void) => () => void;
      onSimStatus:     (cb: (status: { connected: boolean; source: 'msfs' | 'p3d' | 'xplane' | null }) => void) => () => void;
    };
  }
}

export {};

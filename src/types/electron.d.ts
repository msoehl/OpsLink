import type { SimPosition } from './simulator';

declare global {
  interface Window {
    electronAPI?: {
      fetchAvwxMetar:  (icao: string)  => Promise<unknown>;
      openExternal:    (url: string)   => Promise<void>;
      checkForUpdates:  ()              => Promise<void>;
      downloadUpdate:   ()              => Promise<void>;
      installUpdate:    ()              => Promise<void>;
      setUpdateChannel: (ch: string)   => Promise<void>;
      onUpdateStatus:  (cb: (payload: { status: string; info?: unknown }) => void) => () => void;
      onSimPosition:   (cb: (pos: SimPosition) => void) => () => void;
      onSimStatus:       (cb: (status: { connected: boolean; source: 'msfs' | 'p3d' | 'xplane' | null }) => void) => () => void;
      appVersion:        () => Promise<string>;
      platform:          () => Promise<string>;
      windowMinimize:    () => Promise<void>;
      windowMaximize:    () => Promise<void>;
      windowClose:       () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
    };
  }
}

export {};

declare global {
  interface Window {
    electronAPI?: {
      fetchAvwxMetar:  (icao: string)  => Promise<unknown>;
      openExternal:    (url: string)   => Promise<void>;
      checkForUpdates: ()              => Promise<void>;
      downloadUpdate:  ()              => Promise<void>;
      installUpdate:   ()              => Promise<void>;
      onUpdateStatus:  (cb: (payload: { status: string; info?: unknown }) => void) => () => void;
    };
  }
}

export {};

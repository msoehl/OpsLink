import { useEffect } from 'react';
import { useEFBStore } from '../store/efbStore';

/** Listens for simulator position/status IPC events and updates the store.
 *  Must be called once at the App root level.
 *  Position data is never cleared on reconnect — only updated when new data arrives. */
export function useSimPosition() {
  useEffect(() => {
    const cleanPos = window.electronAPI?.onSimPosition?.((pos) => {
      useEFBStore.getState().setSimPosition(pos);
      useEFBStore.getState().appendSimTrail({ lat: pos.lat, lon: pos.lon });
    });

    const cleanStatus = window.electronAPI?.onSimStatus?.(({ connected, source }) => {
      useEFBStore.getState().setSimStatus(connected, source);
    });

    return () => {
      cleanPos?.();
      cleanStatus?.();
    };
  }, []);
}

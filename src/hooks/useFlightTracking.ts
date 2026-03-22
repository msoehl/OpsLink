import { useEffect, useRef } from 'react';
import { useEFBStore } from '../store/efbStore';
import type { LogbookEntry } from '../types/logbook';

export function useFlightTracking() {
  const airborneRef = useRef(false);
  const offBlockTimeRef = useRef<Date | null>(null);
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = useEFBStore.subscribe((state) => {
      const pos = state.simPosition;
      if (!pos) return;

      const gs = pos.groundspeedKts;

      if (!airborneRef.current && gs > 80) {
        airborneRef.current = true;
        offBlockTimeRef.current = new Date();
        if (landingTimerRef.current) {
          clearTimeout(landingTimerRef.current);
          landingTimerRef.current = null;
        }
      }

      if (airborneRef.current && gs < 30) {
        if (!landingTimerRef.current) {
          landingTimerRef.current = setTimeout(() => {
            const onBlockTime = new Date();
            const offBlockTime = offBlockTimeRef.current ?? onBlockTime;
            const flightTimeMin = Math.round((onBlockTime.getTime() - offBlockTime.getTime()) / 60000);

            const store = useEFBStore.getState();
            const ofp = store.ofp;

            const pad = (n: number) => String(n).padStart(2, '0');
            const toHHMM = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

            const entry: LogbookEntry = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              date: offBlockTime.toISOString().slice(0, 10),
              callsign: ofp?.atc?.callsign ?? '',
              dep: ofp?.origin?.icao_code ?? '',
              arr: ofp?.destination?.icao_code ?? '',
              offBlockUtc: toHHMM(offBlockTime),
              onBlockUtc: toHHMM(onBlockTime),
              flightTimeMin,
              simulator: (store.simSource ?? 'manual') as LogbookEntry['simulator'],
              notes: '',
            };

            store.addLogbookEntry(entry);

            airborneRef.current = false;
            offBlockTimeRef.current = null;
            landingTimerRef.current = null;
          }, 10_000);
        }
      } else if (airborneRef.current && gs >= 30 && landingTimerRef.current) {
        clearTimeout(landingTimerRef.current);
        landingTimerRef.current = null;
      }
    });

    return () => {
      unsubscribe();
      if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
    };
  }, []);
}

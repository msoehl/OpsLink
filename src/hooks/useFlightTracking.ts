import { useEffect, useRef } from 'react';
import { useEFBStore } from '../store/efbStore';

export function useFlightTracking() {
  const airborneRef = useRef(false);
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = useEFBStore.subscribe((state) => {
      const pos = state.simPosition;
      if (!pos) return;

      const gs = pos.groundspeedKts;

      if (!airborneRef.current && gs > 80) {
        airborneRef.current = true;
        if (landingTimerRef.current) {
          clearTimeout(landingTimerRef.current);
          landingTimerRef.current = null;
        }
      }

      if (airborneRef.current && gs < 30) {
        if (!landingTimerRef.current) {
          landingTimerRef.current = setTimeout(() => {
            airborneRef.current = false;
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

import { useEffect, useRef } from 'react';
import { useEFBStore } from '../store/efbStore';
import { hoppiePoll, hoppiePing } from '../services/hoppie';
import { playIncomingBeep, playCpdlcChime, playOpsBeep } from '../services/audio';

const POLL_INTERVAL = 30_000;

export function useAcarsPolling() {
  const { hoppieLogon, ofp } = useEFBStore();
  const callsign = ofp?.atc?.callsign ?? '';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!hoppieLogon || !callsign) return;

    const { setHoppieConnected } = useEFBStore.getState();
    hoppiePing(hoppieLogon, callsign)
      .then(ok => setHoppieConnected(ok))
      .catch(() => setHoppieConnected(false));

    async function doPoll() {
      const s = useEFBStore.getState();
      const cs = s.ofp?.atc?.callsign ?? '';
      if (!s.hoppieLogon || !cs) return;
      s.setHoppiePolling(true);
      try {
        const msgs = await hoppiePoll(s.hoppieLogon, cs);
        if (msgs.length > 0) {
          const fresh = useEFBStore.getState();
          msgs.forEach(m => {
            fresh.addAcarsMessage(m);
            if (!m.isSent && m.from !== 'OPSLINK' && Notification.permission === 'granted' && !document.hasFocus()) {
              new Notification(`ACARS ▼ ${m.from}`, { body: m.packet.length > 120 ? m.packet.slice(0, 120).replace(/\s\S*$/, '…') : m.packet, silent: true });
            }
            if (fresh.soundEnabled) {
              if (m.type === 'cpdlc') playCpdlcChime();
              else if (m.from?.endsWith('_ATIS') || m.from === 'OPSLINK') playOpsBeep();
              else playIncomingBeep();
            }
          });
          useEFBStore.getState().incrementAcarsUnread();
        }
        useEFBStore.getState().setHoppieError(null);
      } catch {
        useEFBStore.getState().setHoppieError('Poll failed');
      } finally {
        useEFBStore.getState().setHoppiePolling(false);
      }
    }

    doPoll();
    intervalRef.current = setInterval(doPoll, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [hoppieLogon, callsign]);
}

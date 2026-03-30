import { useState } from 'react';
import { useEFBStore } from '../../../store/efbStore';
import type { HoppieMessage } from '../../../services/hoppie';
import {
  hoppiePoll, hoppieSend,
} from '../../../services/hoppie';
import { playIncomingBeep, playCpdlcChime, playOpsBeep } from '../../../services/audio';
import { injectOps, utcNow, utcPlus, CONNEX_AIRLINES } from '../../../hooks/useOpsPhaseMessages';

export interface InlineReply {
  idx: number;
  fob: string;
  fl: string;
  eta: string;
}

export interface UseMessageActionsReturn {
  sendMsg: (to: string, type: string, packet: string) => Promise<void>;
  injectOps: (packet: string) => void;
  replyToMsg: (idx: number, to: string, packet: string, feedback?: string) => void;
  poll: () => Promise<void>;
  testAllPhaseMessages: () => void;
  isResponded: (msg: HoppieMessage) => boolean;
  inlineReply: InlineReply | null;
  setInlineReply: React.Dispatch<React.SetStateAction<InlineReply | null>>;
}

export function useMessageActions(): UseMessageActionsReturn {
  const { hoppieLogon, addAcarsMessage, respondedMessageKeys, markMessageResponded } = useEFBStore();

  const callsign = useEFBStore(s => s.ofp?.atc?.callsign ?? '');

  const [inlineReply, setInlineReply] = useState<InlineReply | null>(null);

  function msgKey(msg: HoppieMessage): string {
    return `${msg.from ?? ''}|${new Date(msg.receivedAt).getTime()}`;
  }

  function isResponded(msg: HoppieMessage): boolean {
    return respondedMessageKeys.includes(msgKey(msg));
  }

  async function sendMsg(to: string, type: string, packet: string) {
    await hoppieSend(hoppieLogon, callsign, to, type, packet);
    addAcarsMessage({ from: callsign, to, type, packet, isSent: true, receivedAt: new Date() });
  }

  function replyToMsg(idx: number, to: string, packet: string, feedback?: string) {
    const msgs = useEFBStore.getState().acarsMessages;
    if (msgs[idx]) markMessageResponded(msgKey(msgs[idx]));
    sendMsg(to, 'telex', packet).catch(() => {});
    setInlineReply(null);
    if (feedback) {
      const delay = 2500 + Math.random() * 2500;
      setTimeout(() => injectOps(feedback), delay);
    }
  }

  async function poll() {
    const s = useEFBStore.getState();
    const cs = s.ofp?.atc?.callsign ?? '';
    if (!s.hoppieLogon || !cs) return;
    s.setHoppiePolling(true);
    try {
      const msgs = await hoppiePoll(s.hoppieLogon, cs);
      if (msgs.length > 0) {
        msgs.forEach(m => {
          s.addAcarsMessage(m);
          if (s.soundEnabled) {
            if (m.type === 'cpdlc') playCpdlcChime();
            else if (m.from?.endsWith('_ATIS') || m.from === 'OPSLINK') playOpsBeep();
            else playIncomingBeep();
          }
        });
        s.incrementAcarsUnread();
      }
      s.setHoppieError(null);
    } catch {
      s.setHoppieError('Poll failed');
    } finally {
      useEFBStore.getState().setHoppiePolling(false);
    }
  }

  function testAllPhaseMessages() {
    const s = useEFBStore.getState();
    const currentOfp = s.ofp;
    if (!currentOfp) return;
    s.resetAcarsPhaseTracking();
    const cs = currentOfp.atc.callsign;
    const dep = currentOfp.origin.icao_code;
    const dst = currentOfp.destination.icao_code;
    const u   = currentOfp.general.units?.toUpperCase() === 'LBS' ? 'LBS' : 'KG';
    const acType = currentOfp.aircraft.icaocode;
    const acr = currentOfp.aircraft.reg ?? acType;
    const etaMin = 90;
    const ownAirline = cs.replace(/\d.*$/, '').toUpperCase();
    const pool = CONNEX_AIRLINES.filter(a => a !== ownAirline);
    const [al1, al2, al3] = [...pool].sort(() => Math.random() - 0.5);
    const messages: string[] = [
      // Preflight
      ['PAX / LOAD BRIEF', `FLIGHT ${cs}  ${dep}-${dst}`, `AIRCRAFT ${acr}  ${acType}`,
        `PAX               ${currentOfp.weights.pax_count ?? '—'}`,
        `BAGS              ${currentOfp.weights.bag_count ?? '—'}`,
        `PAYLOAD           ${currentOfp.weights.payload ?? '—'} ${u}`,
        `EST ZFW           ${currentOfp.weights.est_zfw ?? '—'} ${u}`,
        `EST TOW           ${currentOfp.weights.est_tow ?? '—'} ${u}`,
        `RAMP FUEL         ${currentOfp.fuel.plan_ramp ?? '—'} ${u}`,
        'LOADSHEET PENDING — REVIEW AND SIGN', 'REPLY ACPT'].join('\n'),
      ['CATERING / CREW MEALS', `FLIGHT ${cs}  ${dep}-${dst}`,
        `TOTAL PAX    ${currentOfp.weights.pax_count ?? '—'}`,
        'CATERING LOADED FOR DEPARTURE',
        'PLEASE CONFIRM CATERING UPLIFT', 'ADVISE ANY SPECIAL MEAL CHANGES'].join('\n'),
      // Special events (shown in test regardless of conditions)
      ['LONG HAUL OPERATIONS BRIEF', `FLIGHT ${cs}  ${dep}-${dst}`,
        'EST FLIGHT TIME  12H 30M', 'ROUTE DISTANCE   6500 NM',
        'CONFIRM CREW REST SCHEDULE AGREED', 'ADVISE OPS OF ANY REST DISRUPTION',
        'ACKNOWLEDGE WHEN READY'].join('\n'),
      ['SHORT TURNAROUND ALERT', `FLIGHT ${cs}  ${dep}-${dst}`,
        'PREV BLOCK IN  13:45Z', 'TURNAROUND TIME  28 MIN',
        'CONFIRM AIRCRAFT SERVICED AND READY', 'ADVISE OPS OF ANY OUTSTANDING ITEMS',
        'ACKNOWLEDGE WHEN READY'].join('\n'),
      // Taxi out
      ['DEPARTURE CONFIRMATION', `FLIGHT ${cs}  ${dep}-${dst}`, `AIRCRAFT ${acr}  ${acType}`,
        'SLOT/CTOT AS FILED', 'OPS MONITORING — CONTACT FOR UPDATES', 'HAVE A SAFE DEPARTURE'].join('\n'),
      ['NIGHT DEPARTURE CHECK', `FLIGHT ${cs}  ${dep}-${dst}`,
        `DEP TIME  ${utcNow()} UTC`, 'CONFIRM EXTERIOR LIGHTING OPERATIONAL',
        'CONFIRM CREW REST COMPLIANT', 'HAVE A SAFE NIGHT DEPARTURE', 'ACKNOWLEDGE WHEN READY'].join('\n'),
      // Climb
      ['AIRBORNE NOTIFICATION', `FLIGHT ${cs}  ${dep}-${dst}`,
        `AIRBORNE TIME  ${utcNow()}`, `ETA ${dst}       ${utcPlus(etaMin)}`, 'REPORT WHEN LEVEL'].join('\n'),
      // Cruise
      ['CRUISE LEVEL REACHED', `FLIGHT ${cs}  ${dep}-${dst}`,
        'CRUISE FL370', 'MAINTAIN PLANNED CRUISE PROFILE', 'CRUISE REPORT WILL FOLLOW'].join('\n'),
      ['CRUISE CHECK REQUEST', `FLIGHT ${cs}  ${dep}-${dst}`, 'PLEASE REPORT:',
        `  FOB (${u})`, '  CURRENT LEVEL', `  ETA ${dst}`, 'THANK YOU'].join('\n'),
      ['CONNEX SCHEDULE', `FLIGHT ${cs}  ${dep}-${dst}`, 'TOTAL CONNEX PAX  21', '',
        `FROM ${al1}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin - 10)}   10 PAX`,
        `FROM ${al2}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin - 3)}    7 PAX`,
        `FROM ${al3}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin + 15)}   4 PAX`, '',
        'MIN CONNECT TIME  45 MIN', 'NOTE PRIORITY OFFLOAD RECOMMENDED'].join('\n'),
      // Descent
      ['DESTINATION WEATHER ADVISORY', `FLIGHT ${cs}  APPROACHING ${dst}`,
        `DISTANCE TO ${dst}  80 NM`,
        'AUTO D-ATIS WILL FOLLOW AT 200 NM',
        'ADVISE OPS OF ANY ROUTE DEVIATIONS', 'HAVE A SAFE DESCENT'].join('\n'),
      // Approach
      ['GATE ASSIGNMENT', `FLIGHT ${cs}  ${dep}-${dst}`,
        'ARR GATE/STAND  B14', `ETA             ${utcPlus(20)}`,
        'HANDLING TEAM NOTIFIED', `WELCOME TO ${dst}`, 'ACKNOWLEDGE WHEN READY'].join('\n'),
      // Taxi in
      ['LANDING ACKNOWLEDGEMENT', `FLIGHT ${cs}  LANDED ${dst}`,
        `LANDING TIME  ${utcNow()}`, 'PLEASE REPORT BLOCK IN TIME', 'GROUND HANDLING STANDING BY'].join('\n'),
      // On block
      ['BLOCK IN / FUEL UPLIFT REQUEST', `FLIGHT ${cs}  ${dep}-${dst}`,
        `BLOCK IN TIME      ${utcNow()}`, '',
        '── FUEL SUMMARY ──────────────────',
        `PLANNED RAMP       ${currentOfp.fuel.plan_ramp ?? '—'} ${u}`,
        `PLANNED LAND       ${currentOfp.fuel.plan_land ?? '—'} ${u}`,
        `ENROUTE BURN       ${currentOfp.fuel.enroute_burn ?? '—'} ${u}`,
        `TAXI BURN          ${currentOfp.fuel.taxi ?? '—'} ${u}`, '',
        '── UPLIFT REQUEST ────────────────',
        `TARGET RAMP FUEL   ${currentOfp.fuel.plan_ramp ?? '—'} ${u}`,
        'FUEL UPLIFT BEING ARRANGED', 'CONFIRM ACTUAL FOB AND DEFECTS'].join('\n'),
    ];
    messages.forEach((pkt, i) => setTimeout(() => injectOps(pkt), i * 400));
  }

  return {
    sendMsg,
    injectOps,
    replyToMsg,
    poll,
    testAllPhaseMessages,
    isResponded,
    inlineReply,
    setInlineReply,
  };
}

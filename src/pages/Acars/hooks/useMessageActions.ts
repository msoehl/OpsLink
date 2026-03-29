import { useEffect, useRef, useState } from 'react';
import { useEFBStore } from '../../../store/efbStore';
import {
  hoppiePoll, hoppieSend,
} from '../../../services/hoppie';
import { fetchVatsimATIS } from '../../../services/atis/vatsim';
import { fetchIvaoATIS } from '../../../services/atis/ivao';
import { playIncomingBeep, playCpdlcChime, playOpsBeep } from '../../../services/audio';

function utcNow(): string {
  return new Date().toUTCString().slice(17, 22) + 'Z';
}

function utcPlus(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60000);
  return d.toUTCString().slice(17, 22) + 'Z';
}

function nmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(a));
}

export interface InlineReply {
  idx: number;
  fob: string;
  fl: string;
  eta: string;
}

// Realistic airline pool for CONNEX schedule (excludes own carrier at runtime)
const CONNEX_AIRLINES = [
  // European network carriers
  'DLH', 'BAW', 'AFR', 'KLM', 'IBE', 'AUA', 'SWR', 'THY', 'SAS', 'FIN',
  'TAP', 'LOT', 'CSA', 'AZA', 'VLG', 'BEL', 'EIN', 'TRA',
  // Long-haul feeders
  'UAE', 'QTR', 'SIA', 'ETD', 'ELY', 'MSR', 'DAL', 'UAL', 'AAL', 'ACA',
  // Asian carriers
  'ANA', 'JAL', 'KAL', 'CPA', 'MAS', 'THA',
];

export interface UseMessageActionsReturn {
  sendMsg: (to: string, type: string, packet: string) => Promise<void>;
  injectOps: (packet: string) => void;
  replyToMsg: (idx: number, to: string, packet: string, feedback?: string) => void;
  poll: () => Promise<void>;
  testAllPhaseMessages: () => void;
  respondedIdx: Set<number>;
  setRespondedIdx: React.Dispatch<React.SetStateAction<Set<number>>>;
  inlineReply: InlineReply | null;
  setInlineReply: React.Dispatch<React.SetStateAction<InlineReply | null>>;
}

export function useMessageActions(): UseMessageActionsReturn {
  const { hoppieLogon, addAcarsMessage, simPosition } = useEFBStore();

  const callsign = useEFBStore(s => s.ofp?.atc?.callsign ?? '');

  const [respondedIdx, setRespondedIdx] = useState<Set<number>>(new Set());
  const [inlineReply, setInlineReply] = useState<InlineReply | null>(null);

  const autoAtisRef = useRef<Set<string>>(new Set());
  const opsCallsign = useRef<string>('OPSLINK');

  async function sendMsg(to: string, type: string, packet: string) {
    await hoppieSend(hoppieLogon, callsign, to, type, packet);
    addAcarsMessage({ from: callsign, to, type, packet, isSent: true, receivedAt: new Date() });
  }

  function injectOps(packet: string) {
    const s = useEFBStore.getState();
    const cs = s.ofp?.atc?.callsign ?? '';
    s.addAcarsMessage({ from: opsCallsign.current, type: 'telex', packet, receivedAt: new Date() });
    s.incrementAcarsUnread();
    if (s.soundEnabled) playOpsBeep();
    if (s.hoppieLogon && cs) {
      hoppieSend(s.hoppieLogon, opsCallsign.current, cs, 'telex', packet).catch(() => {});
    }
  }

  function replyToMsg(idx: number, to: string, packet: string, feedback?: string) {
    sendMsg(to, 'telex', packet).catch(() => {});
    setRespondedIdx(prev => new Set(prev).add(idx));
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

  // ── Auto D-ATIS when < 200 NM from destination ────────────────────────────
  useEffect(() => {
    const s = useEFBStore.getState();
    const currentOfp = s.ofp;
    const currentSimPosition = s.simPosition;
    if (!currentSimPosition || !currentOfp) return;
    const destIcao = currentOfp.destination.icao_code;
    const destLat = parseFloat(currentOfp.destination.pos_lat);
    const destLon = parseFloat(currentOfp.destination.pos_long);
    if (!isFinite(destLat) || !isFinite(destLon)) return;
    const dLat = (destLat - currentSimPosition.lat) * Math.PI / 180;
    const dLon = (destLon - currentSimPosition.lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(currentSimPosition.lat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const distNm = 2 * 3440.065 * Math.asin(Math.sqrt(a));
    if (distNm < 200 && !autoAtisRef.current.has(destIcao)) {
      autoAtisRef.current.add(destIcao);
      const currentAtisNetwork = s.atisNetwork;
      const fetchFn = currentAtisNetwork === 'ivao' ? fetchIvaoATIS : fetchVatsimATIS;
      fetchFn(destIcao).then(result => {
        const st = useEFBStore.getState();
        if (result && result.lines.length > 0) {
          const infoLine = result.code ? `INFORMATION ${result.code}\n` : '';
          const packet = `[AUTO D-ATIS]\n${infoLine}${result.lines.join('\n')}`;
          const cs = st.ofp?.atc?.callsign ?? '';
          st.addAcarsMessage({ from: `${destIcao}_ATIS`, type: 'telex', packet, receivedAt: new Date() });
          st.incrementAcarsUnread();
          if (st.soundEnabled) playOpsBeep();
          if (st.hoppieLogon && cs) {
            hoppieSend(st.hoppieLogon, `${destIcao}_ATIS`, cs, 'telex', packet).catch(() => {});
          }
        }
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPosition]);

  // ── Flight-phase auto messages ─────────────────────────────────────────────
  useEffect(() => {
    const s = useEFBStore.getState();
    const currentOfp = s.ofp;
    const currentSimPosition = s.simPosition;
    if (!currentSimPosition || !currentOfp) return;
    const { altFt, groundspeedKts, verticalSpeedFpm } = currentSimPosition;

    const depLat  = parseFloat(currentOfp.origin.pos_lat);
    const depLon  = parseFloat(currentOfp.origin.pos_long);
    const destLat = parseFloat(currentOfp.destination.pos_lat);
    const destLon = parseFloat(currentOfp.destination.pos_long);
    const distToDest   = isFinite(destLat) ? nmBetween(currentSimPosition.lat, currentSimPosition.lon, destLat, destLon) : 999;
    const distToOrigin = isFinite(depLat)  ? nmBetween(currentSimPosition.lat, currentSimPosition.lon, depLat, depLon)   : 999;

    let phase: string;
    if (altFt < 800 && groundspeedKts < 5) {
      phase = distToOrigin < distToDest ? 'preflight' : 'on_block';
    } else if (altFt < 800 && groundspeedKts >= 5 && groundspeedKts < 80) {
      phase = distToOrigin < distToDest ? 'taxi_out' : 'taxi_in';
    } else if (altFt < 800 && groundspeedKts >= 80) {
      phase = 'takeoff_roll';
    } else if (altFt >= 800 && verticalSpeedFpm > 300) {
      phase = 'climb';
    } else if (altFt >= 800 && verticalSpeedFpm < -500 && distToDest > 80) {
      phase = 'descent';
    } else if (altFt >= 800 && distToDest <= 80) {
      phase = 'approach';
    } else if (altFt >= 10000 && Math.abs(verticalSpeedFpm) <= 300 && groundspeedKts > 150) {
      phase = 'cruise';
    } else {
      phase = s.acarsPhase;
    }

    const prev = s.acarsPhase;
    if (phase === prev) return;
    s.setAcarsPhase(phase);

    // Update logbook phase history
    const currentActiveLogbookEntryId = s.activeLogbookEntryId;
    if (currentActiveLogbookEntryId) {
      const entry = s.logbookEntries.find(e => e.id === currentActiveLogbookEntryId);
      if (entry) {
        const phaseHistory = [...entry.phaseHistory, { phase, time: utcNow() }];
        s.updateLogbookEntry(currentActiveLogbookEntryId, { phaseHistory });
        if (phase === 'taxi_out') s.updateLogbookEntry(currentActiveLogbookEntryId, { offBlockUtc: utcNow() });
        if (phase === 'on_block') {
          s.updateLogbookEntry(currentActiveLogbookEntryId, {
            onBlockUtc: utcNow(),
            simulator: (currentSimPosition as { source?: 'msfs' | 'p3d' | 'xplane' }).source ?? null,
          });
          s.closeLogbookEntry();
        }
      }
    }

    const cs  = currentOfp.atc.callsign;
    const dep = currentOfp.origin.icao_code;
    const dst = currentOfp.destination.icao_code;
    const u   = currentOfp.general.units?.toUpperCase() === 'LBS' ? 'LBS' : 'KG';
    const acType = currentOfp.aircraft.icaocode;
    const acr = currentOfp.aircraft.reg ?? acType;

    const fire = (key: string, msg: string) => {
      const st = useEFBStore.getState();
      if (st.acarsPhasesFired.includes(key)) return;
      st.markAcarsPhaseAsFired(key);
      if (!st.enabledOpsMessages.includes(key)) return;
      injectOps(msg);
    };

    if (phase === 'preflight') {
      fire('pax_brief', [
        'PAX / LOAD BRIEF',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        `AIRCRAFT ${acr}  ${acType}`,
        `PAX               ${currentOfp.weights.pax_count ?? '—'}`,
        `BAGS              ${currentOfp.weights.bag_count ?? '—'}`,
        `PAYLOAD           ${currentOfp.weights.payload ?? '—'} ${u}`,
        `EST ZFW           ${currentOfp.weights.est_zfw ?? '—'} ${u}`,
        `EST TOW           ${currentOfp.weights.est_tow ?? '—'} ${u}`,
        `RAMP FUEL         ${currentOfp.fuel.plan_ramp ?? '—'} ${u}`,
        'LOADSHEET PENDING — REVIEW AND SIGN',
        'REPLY ACPT',
      ].join('\n'));

      const paxPre = currentOfp.weights.pax_count ?? '—';
      fire('meals_reminder', [
        'CATERING / CREW MEALS',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        `TOTAL PAX    ${paxPre}`,
        'CATERING LOADED FOR DEPARTURE',
        'PLEASE CONFIRM CATERING UPLIFT',
        'ADVISE ANY SPECIAL MEAL CHANGES',
      ].join('\n'));

      // Special event: short turnaround (prev on-block < 45 min ago)
      const today = new Date().toISOString().slice(0, 10);
      const recentEntry = [...s.logbookEntries]
        .filter(e => e.date === today && e.onBlockUtc && e.id !== s.activeLogbookEntryId)
        .sort((a, b) => a.onBlockUtc.localeCompare(b.onBlockUtc))
        .pop();
      if (recentEntry) {
        const [hh, mm] = recentEntry.onBlockUtc.replace('Z', '').split(':').map(Number);
        const blockInDate = new Date();
        blockInDate.setUTCHours(hh, mm, 0, 0);
        const diffMin = (Date.now() - blockInDate.getTime()) / 60000;
        if (diffMin >= 0 && diffMin < 45) {
          fire('short_turnaround', [
            'SHORT TURNAROUND ALERT',
            `FLIGHT ${cs}  ${dep}-${dst}`,
            `PREV BLOCK IN  ${recentEntry.onBlockUtc}`,
            `TURNAROUND TIME  ${Math.round(diffMin)} MIN`,
            'CONFIRM AIRCRAFT SERVICED AND READY',
            'ADVISE OPS OF ANY OUTSTANDING ITEMS',
            'ACKNOWLEDGE WHEN READY',
          ].join('\n'));
        }
      }

      // Special event: long haul (great-circle > 2000 NM)
      const routeDistNm = nmBetween(depLat, depLon, destLat, destLon);
      if (routeDistNm > 2000) {
        const enrouteSec = parseInt(currentOfp.times.est_time_enroute || '0');
        const flightH = Math.floor(enrouteSec / 3600);
        const flightM = Math.round((enrouteSec % 3600) / 60);
        fire('long_haul', [
          'LONG HAUL OPERATIONS BRIEF',
          `FLIGHT ${cs}  ${dep}-${dst}`,
          `EST FLIGHT TIME  ${flightH}H ${String(flightM).padStart(2, '0')}M`,
          `ROUTE DISTANCE   ${Math.round(routeDistNm)} NM`,
          'CONFIRM CREW REST SCHEDULE AGREED',
          'ADVISE OPS OF ANY REST DISRUPTION',
          'ACKNOWLEDGE WHEN READY',
        ].join('\n'));
      }
    }

    if (phase === 'taxi_out') {
      fire('taxi_out', [
        'DEPARTURE CONFIRMATION',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        `AIRCRAFT ${acr}  ${acType}`,
        'SLOT/CTOT AS FILED',
        'OPS MONITORING — CONTACT FOR UPDATES',
        'HAVE A SAFE DEPARTURE',
      ].join('\n'));

      // Special event: night departure (22:00–05:59 UTC)
      const utcHour = new Date().getUTCHours();
      if (utcHour >= 22 || utcHour < 6) {
        fire('night_departure', [
          'NIGHT DEPARTURE CHECK',
          `FLIGHT ${cs}  ${dep}-${dst}`,
          `DEP TIME  ${utcNow()} UTC`,
          'CONFIRM EXTERIOR LIGHTING OPERATIONAL',
          'CONFIRM CREW REST COMPLIANT',
          'HAVE A SAFE NIGHT DEPARTURE',
          'ACKNOWLEDGE WHEN READY',
        ].join('\n'));
      }
    }

    if (phase === 'climb') {
      const enrouteMin = Math.round(parseInt(currentOfp.times.est_time_enroute || '7200') / 60);
      fire('airborne', [
        'AIRBORNE NOTIFICATION',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        `AIRBORNE TIME  ${utcNow()}`,
        `ETA ${dst}       ${utcPlus(enrouteMin)}`,
        'REPORT WHEN LEVEL',
      ].join('\n'));
    }

    if (phase === 'cruise') {
      fire('top_of_climb', [
        'CRUISE LEVEL REACHED',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        `CRUISE FL${Math.round(altFt / 100)}`,
        'MAINTAIN PLANNED CRUISE PROFILE',
        'CRUISE REPORT WILL FOLLOW',
      ].join('\n'));

      fire('cruise_check', [
        'CRUISE CHECK REQUEST',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        'PLEASE REPORT:',
        `  FOB (${u})`,
        '  CURRENT LEVEL',
        `  ETA ${dst}`,
        'THANK YOU',
      ].join('\n'));

      const etaMin = groundspeedKts > 0 ? Math.round(distToDest / groundspeedKts * 60) : 90;
      const totalPax = Math.floor(Math.random() * 25 + 3);
      const pax1 = Math.floor(totalPax * 0.55);
      const pax2 = totalPax - pax1;
      const ownAirline = cs.replace(/\d.*$/, '').toUpperCase();
      const connexPool = CONNEX_AIRLINES.filter(a => a !== ownAirline);
      const [al1, al2, al3] = [...connexPool].sort(() => Math.random() - 0.5);
      const pax3 = pax2 > 5 ? Math.floor(pax2 * 0.4) : 0;
      const pax2final = pax3 > 0 ? pax2 - pax3 : pax2;
      fire('connex', [
        'CONNEX SCHEDULE',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        `TOTAL CONNEX PAX  ${totalPax + pax3}`,
        '',
        `FROM ${al1}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin - 10)}   ${pax1} PAX`,
        `FROM ${al2}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin - 3)}    ${pax2final} PAX`,
        ...(pax3 > 0 ? [`FROM ${al3}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin + 15)}   ${pax3} PAX`] : []),
        '',
        'MIN CONNECT TIME  45 MIN',
        ...(pax3 > 0 ? ['NOTE PRIORITY OFFLOAD RECOMMENDED'] : []),
      ].join('\n'));
    }

    if (phase === 'descent') {
      fire('descent_wx', [
        'DESTINATION WEATHER ADVISORY',
        `FLIGHT ${cs}  APPROACHING ${dst}`,
        `DISTANCE TO ${dst}  ${Math.round(distToDest)} NM`,
        'AUTO D-ATIS WILL FOLLOW AT 200 NM',
        'ADVISE OPS OF ANY ROUTE DEVIATIONS',
        'HAVE A SAFE DESCENT',
      ].join('\n'));
    }

    if (phase === 'approach') {
      const gates = ['A', 'B', 'C', 'D', 'E'];
      const arrGate = `${gates[Math.floor(Math.random() * gates.length)]}${Math.floor(Math.random() * 40 + 1)}`;
      fire('gate_approach', [
        'GATE ASSIGNMENT',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        `ARR GATE/STAND  ${arrGate}`,
        `ETA             ${utcPlus(Math.round(distToDest / (groundspeedKts || 250) * 60))}`,
        'HANDLING TEAM NOTIFIED',
        'WELCOME TO ' + dst,
        'ACKNOWLEDGE WHEN READY',
      ].join('\n'));
    }

    if (phase === 'taxi_in') {
      fire('landed', [
        'LANDING ACKNOWLEDGEMENT',
        `FLIGHT ${cs}  LANDED ${dst}`,
        `LANDING TIME  ${utcNow()}`,
        'PLEASE REPORT BLOCK IN TIME',
        'GROUND HANDLING STANDING BY',
      ].join('\n'));
    }

    if (phase === 'on_block' && distToDest < 15) {
      const planRamp = currentOfp.fuel.plan_ramp  ?? '—';
      const planLand = currentOfp.fuel.plan_land  ?? '—';
      const enrtBurn = currentOfp.fuel.enroute_burn ?? '—';
      const taxiFuel = currentOfp.fuel.taxi       ?? '—';
      fire('on_block', [
        'BLOCK IN / FUEL UPLIFT REQUEST',
        `FLIGHT ${cs}  ${dep}-${dst}`,
        `BLOCK IN TIME      ${utcNow()}`,
        '',
        '── FUEL SUMMARY ──────────────────',
        `PLANNED RAMP       ${planRamp} ${u}`,
        `PLANNED LAND       ${planLand} ${u}`,
        `ENROUTE BURN       ${enrtBurn} ${u}`,
        `TAXI BURN          ${taxiFuel} ${u}`,
        '',
        '── UPLIFT REQUEST ────────────────',
        `TARGET RAMP FUEL   ${planRamp} ${u}`,
        'FUEL UPLIFT BEING ARRANGED',
        'CONFIRM ACTUAL FOB AND DEFECTS',
      ].join('\n'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPosition]);

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
    respondedIdx,
    setRespondedIdx,
    inlineReply,
    setInlineReply,
  };
}

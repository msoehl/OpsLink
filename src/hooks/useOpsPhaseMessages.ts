import { useEffect, useRef } from 'react';
import { useEFBStore } from '../store/efbStore';
import { hoppieSend } from '../services/hoppie';
import { fetchVatsimATIS } from '../services/atis/vatsim';
import { fetchIvaoATIS } from '../services/atis/ivao';
import { playOpsBeep } from '../services/audio';

export function utcNow(): string {
  return new Date().toUTCString().slice(17, 22) + 'Z';
}

export function utcPlus(offsetMin: number): string {
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

export function injectOps(packet: string) {
  const s = useEFBStore.getState();
  const cs = s.ofp?.atc?.callsign ?? '';
  s.addAcarsMessage({ from: 'OPSLINK', to: cs || 'CREW', type: 'telex', packet, receivedAt: new Date(), isSent: true });
  s.incrementAcarsUnread();
  if (s.soundEnabled) playOpsBeep();
  if (s.hoppieLogon && cs) {
    hoppieSend(s.hoppieLogon, 'OPSLINK', cs, 'telex', packet).catch(() => {});
  }
}

export const CONNEX_AIRLINES = [
  'DLH', 'BAW', 'AFR', 'KLM', 'IBE', 'AUA', 'SWR', 'THY', 'SAS', 'FIN',
  'TAP', 'LOT', 'CSA', 'AZA', 'VLG', 'BEL', 'EIN', 'TRA',
  'UAE', 'QTR', 'SIA', 'ETD', 'ELY', 'MSR', 'DAL', 'UAL', 'AAL', 'ACA',
  'ANA', 'JAL', 'KAL', 'CPA', 'MAS', 'THA',
];

export function useOpsPhaseMessages() {
  const { simPosition } = useEFBStore();
  const autoAtisRef = useRef<Set<string>>(new Set());
  // Debounce phase transitions: a new phase must be stable for 3 s before
  // committing. This filters out single-frame SimConnect noise on (re)connect,
  // which would otherwise fire messages from a fresh/empty acarsPhasesFired.
  const pendingPhaseRef = useRef<{ phase: string; since: number } | null>(null);

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
    const distNm = nmBetween(currentSimPosition.lat, currentSimPosition.lon, destLat, destLon);
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
    const distToDest   = isFinite(destLat) && isFinite(destLon) ? nmBetween(currentSimPosition.lat, currentSimPosition.lon, destLat, destLon) : 999;
    const distToOrigin = isFinite(depLat)  && isFinite(depLon)  ? nmBetween(currentSimPosition.lat, currentSimPosition.lon, depLat, depLon)   : 999;

    let phase: string;
    if (altFt < 800 && groundspeedKts < 2) {
      phase = distToOrigin < distToDest ? 'preflight' : 'on_block';
    } else if (altFt < 800 && groundspeedKts >= 2 && groundspeedKts < 80) {
      phase = distToOrigin < distToDest ? 'taxi_out' : 'taxi_in';
    } else if (altFt < 800 && groundspeedKts >= 80) {
      phase = 'takeoff_roll';
    } else if (altFt >= 800 && verticalSpeedFpm > 300) {
      phase = 'climb';
    } else if (altFt >= 800 && verticalSpeedFpm < -500 && distToDest > 80) {
      phase = 'descent';
    } else if (altFt >= 800 && distToDest <= 80) {
      phase = 'approach';
    } else if (altFt >= 3000 && Math.abs(verticalSpeedFpm) <= 300 && groundspeedKts > 100) {
      phase = 'cruise';
    } else {
      phase = s.acarsPhase;
    }

    const prev = s.acarsPhase;
    if (phase === prev) {
      pendingPhaseRef.current = null; // stable — clear any pending candidate
      return;
    }

    // Debounce: ground phases (taxi) confirm after 1 s, airborne phases after 3 s.
    // Ground phases need faster response; longer debounce filters SimConnect noise at altitude.
    const isGroundPhase = altFt < 800;
    const debounceMs = isGroundPhase ? 1000 : 3000;
    const now = Date.now();
    const pending = pendingPhaseRef.current;
    if (!pending || pending.phase !== phase) {
      pendingPhaseRef.current = { phase, since: now };
      return;
    }
    if (now - pending.since < debounceMs) return;

    // Phase confirmed stable — commit.
    pendingPhaseRef.current = null;
    s.setAcarsPhase(phase);

    // Update logbook phase history
    // closeLogbookEntry is deferred until after all fire() calls so the on_block
    // message is captured in the logbook's acarsMessages snapshot.
    let shouldCloseLogbook = false;
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
            simulator: currentSimPosition.source,
          });
          shouldCloseLogbook = true;
        }
      }
    }

    const cs  = currentOfp.atc?.callsign   || currentOfp.general?.icao_airline || '???';
    const dep = currentOfp.origin?.icao_code      || '????';
    const dst = currentOfp.destination?.icao_code || '????';
    const u   = currentOfp.general?.units?.toUpperCase() === 'LBS' ? 'LBS' : 'KG';
    const acType = currentOfp.aircraft?.icaocode || '????';
    const acr = currentOfp.aircraft?.reg ?? acType;

    const fire = (key: string, msg: string, delayMs = 0) => {
      const st = useEFBStore.getState();
      if (st.acarsPhasesFired.includes(key)) return;
      if (!st.enabledOpsMessages.includes(key)) {
        // Mark as fired even when disabled so it doesn't retroactively send
        // if the user enables it mid-flight after the phase has passed.
        st.markAcarsPhaseAsFired(key);
        return;
      }
      st.markAcarsPhaseAsFired(key);
      if (delayMs > 0) {
        setTimeout(() => injectOps(msg), delayMs);
      } else {
        injectOps(msg);
      }
    };

    const DELAY = 45_000; // ms between staggered OPS messages

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
      ].join('\n'), DELAY);

      const today = new Date().toISOString().slice(0, 10);
      const recentEntry = [...s.logbookEntries]
        .filter(e =>
          e.date === today &&
          e.onBlockUtc &&
          e.id !== s.activeLogbookEntryId &&
          e.flightTimeMin >= 10   // ignore test sessions / short spurious entries
        )
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
          ].join('\n'), DELAY * 2);
        }
      }

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
        ].join('\n'), DELAY * 2);
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
        ].join('\n'), DELAY);
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
      ].join('\n'), DELAY);

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
        `TOTAL CONNEX PAX  ${totalPax}`,
        '',
        `FROM ${al1}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin - 10)}   ${pax1} PAX`,
        `FROM ${al2}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin - 3)}    ${pax2final} PAX`,
        ...(pax3 > 0 ? [`FROM ${al3}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin + 15)}   ${pax3} PAX`] : []),
        '',
        'MIN CONNECT TIME  45 MIN',
        ...(pax3 > 0 ? ['NOTE PRIORITY OFFLOAD RECOMMENDED'] : []),
      ].join('\n'), DELAY * 2);
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

    if (phase === 'on_block') {
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

    // Close logbook after all fire() calls so the on_block message is included.
    if (shouldCloseLogbook) {
      useEFBStore.getState().closeLogbookEntry();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPosition]);
}

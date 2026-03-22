import type { VatsimPilot } from './vatsim';

interface IvaoPilot {
  callsign: string;
  lastTrack?: {
    latitude: number;
    longitude: number;
    altitude: number;
    groundSpeed: number;
    heading: number;
  };
  flightPlan?: { aircraftId?: string; departureId?: string; arrivalId?: string };
}

interface IvaoWhazzup {
  clients?: { pilots?: IvaoPilot[] };
}

let cachedData: VatsimPilot[] | null = null;
let cacheTime = 0;
const CACHE_MS = 25_000;

export async function fetchIvaoTraffic(): Promise<VatsimPilot[]> {
  if (cachedData && Date.now() - cacheTime < CACHE_MS) return cachedData;

  const res = await fetch('https://api.ivao.aero/v2/tracker/whazzup');
  if (!res.ok) throw new Error('IVAO data unavailable');
  const data: IvaoWhazzup = await res.json();

  const pilots = data.clients?.pilots ?? [];
  cachedData = pilots
    .filter(p => p.lastTrack)
    .map(p => ({
      callsign: p.callsign,
      latitude: p.lastTrack!.latitude,
      longitude: p.lastTrack!.longitude,
      altitude: p.lastTrack!.altitude,
      groundspeed: p.lastTrack!.groundSpeed,
      heading: p.lastTrack!.heading,
      aircraft: p.flightPlan?.aircraftId ?? '',
    dep: p.flightPlan?.departureId ?? '',
    dest: p.flightPlan?.arrivalId ?? '',
    }));
  cacheTime = Date.now();
  return cachedData;
}

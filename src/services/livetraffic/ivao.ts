import type { VatsimPilot } from './vatsim';
import { fetchIvaoWhazzup } from './ivaoWhazzup';

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

export async function fetchIvaoTraffic(): Promise<VatsimPilot[]> {
  const data = await fetchIvaoWhazzup() as IvaoWhazzup;

  const pilots = data.clients?.pilots ?? [];
  return pilots
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
}

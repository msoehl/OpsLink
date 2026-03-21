export interface VatsimPilot {
  callsign: string;
  latitude: number;
  longitude: number;
  altitude: number;
  groundspeed: number;
  heading: number;
  aircraft: string;
  dep: string;
  dest: string;
}

interface VatsimData {
  pilots: {
    callsign: string;
    latitude: number;
    longitude: number;
    altitude: number;
    groundspeed: number;
    heading: number;
    flight_plan?: { aircraft_short?: string; departure?: string; arrival?: string };
  }[];
}

let cachedData: VatsimPilot[] | null = null;
let cacheTime = 0;
const CACHE_MS = 25_000; // VATSIM updates every ~15s, cache 25s to avoid hammering

export async function fetchVatsimTraffic(): Promise<VatsimPilot[]> {
  if (cachedData && Date.now() - cacheTime < CACHE_MS) return cachedData;

  const res = await fetch('https://data.vatsim.net/v3/vatsim-data.json');
  if (!res.ok) throw new Error('VATSIM data unavailable');
  const data: VatsimData = await res.json();

  cachedData = data.pilots.map((p) => ({
    callsign: p.callsign,
    latitude: p.latitude,
    longitude: p.longitude,
    altitude: p.altitude,
    groundspeed: p.groundspeed,
    heading: p.heading,
    aircraft: p.flight_plan?.aircraft_short ?? '',
    dep: p.flight_plan?.departure ?? '',
    dest: p.flight_plan?.arrival ?? '',
  }));
  cacheTime = Date.now();
  return cachedData;
}

/** Filter to pilots within a lat/lon bounding box */
export function filterByBounds(
  pilots: VatsimPilot[],
  minLat: number, maxLat: number,
  minLon: number, maxLon: number,
): VatsimPilot[] {
  return pilots.filter(
    (p) =>
      p.latitude >= minLat && p.latitude <= maxLat &&
      p.longitude >= minLon && p.longitude <= maxLon,
  );
}

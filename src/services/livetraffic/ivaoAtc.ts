import type { VatsimController } from './vatsimAtc';

// IVAO position strings → VATSIM facility numbers (shared interface)
const POSITION_TO_FACILITY: Record<string, number> = {
  DEL: 2, GND: 3, TWR: 4, APP: 5, DEP: 5, CTR: 6, FSS: 6, ATIS: 8,
};

interface IvaoAtc {
  callsign: string;
  atcSession: {
    frequency: number;   // kHz  e.g. 118780 = 118.780 MHz
    position: string;    // "TWR" | "GND" | "CTR" etc.
    visualRange: number;
  };
  lastTrack?: {
    latitude: number;
    longitude: number;
  };
  atis?: {
    lines?: string[];
    revision?: string;
  };
}

interface IvaoWhazzupAtc {
  clients?: { atcs?: IvaoAtc[] };
}

interface AvwxAirport {
  icaoId: string;
  lat: number;
  lon: number;
}

const FIR_CENTERS: Record<string, { lat: number; lon: number }> = {
  EDGG: { lat: 50.5, lon: 9.0   }, EDYY: { lat: 51.5, lon: 10.5  },
  EGTT: { lat: 51.5, lon: -0.5  }, EGPX: { lat: 56.5, lon: -4.0  },
  LFFF: { lat: 49.0, lon: 2.5   }, LFBB: { lat: 44.5, lon: 0.5   },
  LFRR: { lat: 48.0, lon: -3.5  }, LFMM: { lat: 43.5, lon: 5.5   },
  LOVV: { lat: 47.5, lon: 14.5  }, LKAA: { lat: 50.0, lon: 15.5  },
  EPWW: { lat: 52.0, lon: 19.0  }, EINN: { lat: 53.3, lon: -8.0  },
  EBBU: { lat: 50.5, lon: 4.5   }, EHAA: { lat: 52.5, lon: 5.5   },
  ESAA: { lat: 59.5, lon: 17.5  }, EKDK: { lat: 56.0, lon: 10.5  },
  ENOR: { lat: 65.0, lon: 14.0  }, EFIN: { lat: 64.0, lon: 26.0  },
  BIRK: { lat: 64.0, lon: -18.0 }, LECB: { lat: 41.0, lon: -3.5  },
  LECM: { lat: 40.5, lon: -3.7  }, LPPO: { lat: 39.0, lon: -8.0  },
  LRBB: { lat: 45.5, lon: 24.0  }, LDZO: { lat: 45.5, lon: 16.0  },
  LYBA: { lat: 44.0, lon: 21.0  }, LGGG: { lat: 39.5, lon: 22.0  },
  LTAA: { lat: 40.0, lon: 33.0  }, LCCC: { lat: 35.0, lon: 33.0  },
  LLLL: { lat: 31.0, lon: 35.0  }, UDDD: { lat: 40.0, lon: 45.0  },
  KZNY: { lat: 40.0, lon: -77.0 }, KZDC: { lat: 38.5, lon: -77.5 },
  KZBW: { lat: 42.5, lon: -71.0 }, KZJX: { lat: 32.0, lon: -81.0 },
  KZTL: { lat: 33.5, lon: -84.5 }, KZME: { lat: 32.0, lon: -90.0 },
  KZOB: { lat: 41.5, lon: -82.0 }, KZMP: { lat: 44.5, lon: -93.5 },
  KZLA: { lat: 34.0, lon: -118.0}, KZLC: { lat: 40.5, lon: -112.0},
  KZSE: { lat: 47.5, lon: -122.5}, KZMA: { lat: 25.5, lon: -80.5 },
  KZFW: { lat: 32.5, lon: -97.0 }, KZHU: { lat: 29.5, lon: -95.0 },
  CZQX: { lat: 49.0, lon: -54.0 }, CZUL: { lat: 45.5, lon: -73.5 },
  CZYZ: { lat: 43.5, lon: -79.5 }, CZVR: { lat: 49.0, lon: -123.0},
  EGGX: { lat: 52.0, lon: -15.0 }, KZWY: { lat: 43.0, lon: -40.0 },
  KZAK: { lat: 37.0, lon: -140.0}, RJJJ: { lat: 33.0, lon: 131.0 },
};

let cachedControllers: VatsimController[] | null = null;
let cacheTime = 0;
const CACHE_MS = 25_000;

function icaoFromCallsign(callsign: string): string | null {
  const parts = callsign.split('_');
  if (parts.length < 2) return null;
  const prefix = parts[0];
  return prefix.length >= 3 && prefix.length <= 4 ? prefix : null;
}

function formatFreq(freq: number): string {
  // IVAO API may return frequency in kHz (118780) or MHz (118.78)
  // ATC frequencies are always 100–140 MHz; anything > 1000 is in kHz
  const mhz = freq > 1000 ? freq / 1000 : freq;
  return mhz.toFixed(3);
}

async function fetchAirportCoords(icaos: string[]): Promise<Map<string, { lat: number; lon: number }>> {
  if (icaos.length === 0) return new Map();
  try {
    const ids = icaos.join(',');
    const res = await fetch(`https://aviationweather.gov/api/data/airport?ids=${ids}&format=json`);
    if (!res.ok) return new Map();
    const data: AvwxAirport[] = await res.json();
    const map = new Map<string, { lat: number; lon: number }>();
    for (const ap of data) {
      if (ap.icaoId && isFinite(ap.lat) && isFinite(ap.lon)) {
        map.set(ap.icaoId.toUpperCase(), { lat: ap.lat, lon: ap.lon });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function fetchIvaoControllers(): Promise<VatsimController[]> {
  if (cachedControllers && Date.now() - cacheTime < CACHE_MS) return cachedControllers;

  const res = await fetch('https://api.ivao.aero/v2/tracker/whazzup');
  if (!res.ok) throw new Error('IVAO data unavailable');
  const data: IvaoWhazzupAtc = await res.json();

  const raw = (data.clients?.atcs ?? []).filter(c => {
    const f = POSITION_TO_FACILITY[c.atcSession?.position?.toUpperCase() ?? ''];
    return f !== undefined && f >= 2;
  });

  const icaoSet = new Set<string>();
  for (const c of raw) {
    const icao = icaoFromCallsign(c.callsign);
    if (icao) icaoSet.add(icao);
  }

  const coordMap = await fetchAirportCoords([...icaoSet]);

  cachedControllers = raw.flatMap((c): VatsimController[] => {
    const facility = POSITION_TO_FACILITY[c.atcSession.position.toUpperCase()] ?? 2;
    const icao = icaoFromCallsign(c.callsign);
    const track = c.lastTrack;
    const textAtis = c.atis?.lines ?? [];
    const frequency = formatFreq(c.atcSession.frequency);

    // Use IVAO-provided coords if valid
    if (track && isFinite(track.latitude) && isFinite(track.longitude) &&
        !(track.latitude === 0 && track.longitude === 0)) {
      return [{ callsign: c.callsign, frequency, facility, latitude: track.latitude, longitude: track.longitude, textAtis, visualRange: c.atcSession.visualRange, icao }];
    }

    // Fall back to airport coords then FIR table
    const coords = icao
      ? (coordMap.get(icao.toUpperCase()) ?? FIR_CENTERS[icao.toUpperCase()])
      : undefined;
    if (!coords) return [];
    return [{ callsign: c.callsign, frequency, facility, latitude: coords.lat, longitude: coords.lon, textAtis, visualRange: c.atcSession.visualRange, icao }];
  });

  cacheTime = Date.now();
  return cachedControllers;
}

export interface VatsimController {
  callsign: string;
  frequency: string;
  facility: number;
  latitude: number;
  longitude: number;
  textAtis: string[];
  visualRange: number;
  icao: string | null;
}

interface VatsimRawController {
  callsign: string;
  frequency: string;
  facility: number;
  latitude: number;
  longitude: number;
  text_atis: string[] | null;
  visual_range: number;
}

interface VatsimAtcData {
  controllers?: VatsimRawController[];
}

interface VatsimTransceiver {
  callsign: string;
  transceivers: { latDeg: number; lonDeg: number }[];
}

// Approximate center coordinates for common FIR/UIR/ARTCC identifiers
// Used as fallback when the prefix is not an airport ICAO
const FIR_CENTERS: Record<string, { lat: number; lon: number }> = {
  // Europe
  EDGG: { lat: 50.5,  lon: 9.0   }, EDYY: { lat: 51.5,  lon: 10.5  },
  EGTT: { lat: 51.5,  lon: -0.5  }, EGPX: { lat: 56.5,  lon: -4.0  },
  LFFF: { lat: 49.0,  lon: 2.5   }, LFBB: { lat: 44.5,  lon: 0.5   },
  LFRR: { lat: 48.0,  lon: -3.5  }, LFMM: { lat: 43.5,  lon: 5.5   },
  LOVV: { lat: 47.5,  lon: 14.5  }, LKAA: { lat: 50.0,  lon: 15.5  },
  EPWW: { lat: 52.0,  lon: 19.0  }, EINN: { lat: 53.3,  lon: -8.0  },
  EBBU: { lat: 50.5,  lon: 4.5   }, EHAA: { lat: 52.5,  lon: 5.5   },
  ESAA: { lat: 59.5,  lon: 17.5  }, EKDK: { lat: 56.0,  lon: 10.5  },
  ENOR: { lat: 65.0,  lon: 14.0  }, EFIN: { lat: 64.0,  lon: 26.0  },
  BIRK: { lat: 64.0,  lon: -18.0 }, LECB: { lat: 41.0,  lon: -3.5  },
  LECM: { lat: 40.5,  lon: -3.7  }, LPPO: { lat: 39.0,  lon: -8.0  },
  LRBB: { lat: 45.5,  lon: 24.0  }, LDZO: { lat: 45.5,  lon: 16.0  },
  LYBA: { lat: 44.0,  lon: 21.0  }, LGGG: { lat: 39.5,  lon: 22.0  },
  LTAA: { lat: 40.0,  lon: 33.0  }, LCCC: { lat: 35.0,  lon: 33.0  },
  LLLL: { lat: 31.0,  lon: 35.0  }, UDDD: { lat: 40.0,  lon: 45.0  },
  // North America
  KZNY: { lat: 40.0,  lon: -77.0 }, KZDC: { lat: 38.5,  lon: -77.5 },
  KZBW: { lat: 42.5,  lon: -71.0 }, KZJX: { lat: 32.0,  lon: -81.0 },
  KZTL: { lat: 33.5,  lon: -84.5 }, KZME: { lat: 32.0,  lon: -90.0 },
  KZOB: { lat: 41.5,  lon: -82.0 }, KZMP: { lat: 44.5,  lon: -93.5 },
  KZLA: { lat: 34.0,  lon: -118.0}, KZLC: { lat: 40.5,  lon: -112.0},
  KZSE: { lat: 47.5,  lon: -122.5}, KZMA: { lat: 25.5,  lon: -80.5 },
  KZFW: { lat: 32.5,  lon: -97.0 }, KZHU: { lat: 29.5,  lon: -95.0 },
  KZKC: { lat: 38.5,  lon: -94.5 }, KZAU: { lat: 41.5,  lon: -88.0 },
  CZQX: { lat: 49.0,  lon: -54.0 }, CZUL: { lat: 45.5,  lon: -73.5 },
  CZYZ: { lat: 43.5,  lon: -79.5 }, CZVR: { lat: 49.0,  lon: -123.0},
  // Oceanic
  EGGX: { lat: 52.0,  lon: -15.0 }, KZWY: { lat: 43.0,  lon: -40.0 },
  KZAK: { lat: 37.0,  lon: -140.0}, RJJJ: { lat: 33.0,  lon: 131.0 },
  NZZO: { lat: -36.0, lon: 175.0 }, YBBB: { lat: -25.0, lon: 133.0 },
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

async function fetchTransceiverCoords(): Promise<Map<string, { lat: number; lon: number }>> {
  try {
    const res = await fetch('https://data.vatsim.net/v3/transceivers-data.json');
    if (!res.ok) return new Map();
    const data: VatsimTransceiver[] = await res.json();
    const map = new Map<string, { lat: number; lon: number }>();
    for (const entry of data) {
      const t = entry.transceivers?.[0];
      if (t && isFinite(t.latDeg) && isFinite(t.lonDeg) && !(t.latDeg === 0 && t.lonDeg === 0)) {
        map.set(entry.callsign, { lat: t.latDeg, lon: t.lonDeg });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function fetchVatsimControllers(): Promise<VatsimController[]> {
  if (cachedControllers && Date.now() - cacheTime < CACHE_MS) return cachedControllers;

  const [dataRes, transceiverMap] = await Promise.all([
    fetch('https://data.vatsim.net/v3/vatsim-data.json'),
    fetchTransceiverCoords(),
  ]);

  if (!dataRes.ok) throw new Error('VATSIM data unavailable');
  const data: VatsimAtcData = await dataRes.json();

  const raw = (data.controllers ?? []).filter(c => c.facility >= 2 && c.facility !== 1);

  cachedControllers = raw.flatMap((c) => {
    const icao = icaoFromCallsign(c.callsign);

    // 1. VATSIM-provided coords
    if (isFinite(c.latitude) && isFinite(c.longitude) && !(c.latitude === 0 && c.longitude === 0)) {
      return [{ callsign: c.callsign, frequency: c.frequency, facility: c.facility, latitude: c.latitude, longitude: c.longitude, textAtis: c.text_atis ?? [], visualRange: c.visual_range, icao }];
    }
    // 2. Transceivers API
    const tc = transceiverMap.get(c.callsign);
    if (tc) {
      return [{ callsign: c.callsign, frequency: c.frequency, facility: c.facility, latitude: tc.lat, longitude: tc.lon, textAtis: c.text_atis ?? [], visualRange: c.visual_range, icao }];
    }
    // 3. FIR center table (last resort for CTR/FIR stations)
    const fir = icao ? FIR_CENTERS[icao.toUpperCase()] : undefined;
    if (fir) {
      return [{ callsign: c.callsign, frequency: c.frequency, facility: c.facility, latitude: fir.lat, longitude: fir.lon, textAtis: c.text_atis ?? [], visualRange: c.visual_range, icao }];
    }
    return [];
  });

  cacheTime = Date.now();
  return cachedControllers;
}

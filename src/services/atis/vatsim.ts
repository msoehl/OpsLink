import axios from 'axios';

interface VatsimATIS {
  cid: number;
  callsign: string;
  frequency: string;
  atis_code: string | null;
  text_atis: string[] | null;
}

interface VatsimData {
  atis: VatsimATIS[];
}

let cache: { data: VatsimData; ts: number } | null = null;
const TTL_MS = 60_000;

async function getVatsimData(): Promise<VatsimData> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) return cache.data;
  const response = await axios.get<VatsimData>('https://data.vatsim.net/v3/vatsim-data.json');
  cache = { data: response.data, ts: now };
  return response.data;
}

export interface ATISResult {
  callsign: string;
  frequency: string;
  code: string | null;
  lines: string[];
}

export async function fetchVatsimATIS(icao: string): Promise<ATISResult | null> {
  const results = await fetchAllVatsimATIS(icao);
  return results[0] ?? null;
}

export async function fetchAllVatsimATIS(icao: string): Promise<ATISResult[]> {
  const data = await getVatsimData();
  const re = new RegExp(`^${icao.toUpperCase()}_[A-Z_]*ATIS`, 'i');
  return (data.atis ?? [])
    .filter(a => re.test(a.callsign))
    .map(a => ({
      callsign: a.callsign,
      frequency: a.frequency,
      code: a.atis_code,
      lines: a.text_atis ?? [],
    }));
}

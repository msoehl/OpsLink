import axios from 'axios';
import type { ATISResult } from './vatsim';

interface IvaoATC {
  callsign: string;
  atisMessage: string | null;
  lastTrack?: { frequency?: number };
}

interface IvaoData {
  clients: { atcs: IvaoATC[] };
}

let cache: { data: IvaoData; ts: number } | null = null;
const TTL_MS = 60_000;

async function getIvaoData(): Promise<IvaoData> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) return cache.data;
  const response = await axios.get<IvaoData>('https://api.ivao.aero/v2/tracker/whazzup');
  cache = { data: response.data, ts: now };
  return response.data;
}

export async function fetchIvaoATIS(icao: string): Promise<ATISResult | null> {
  const data = await getIvaoData();
  const re = new RegExp(`^${icao.toUpperCase()}_ATIS`, 'i');
  const match = data.clients?.atcs?.find((a) => re.test(a.callsign));
  if (!match) return null;

  const text = match.atisMessage ?? '';
  // Extract ATIS letter from message (usually the first single uppercase letter after INFO/INFORMATION)
  const codeMatch = text.match(/\bINFO(?:RMATION)?\s+([A-Z])\b/i);
  const code = codeMatch ? codeMatch[1].toUpperCase() : null;

  return {
    callsign: match.callsign,
    frequency: match.lastTrack?.frequency?.toFixed(3) ?? '—',
    code,
    lines: text ? [text] : [],
  };
}

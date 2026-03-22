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

function parseAtc(a: IvaoATC): ATISResult {
  const text = a.atisMessage ?? '';
  const codeMatch = text.match(/\bINFO(?:RMATION)?\s+([A-Z])\b/i);
  return {
    callsign: a.callsign,
    frequency: a.lastTrack?.frequency?.toFixed(3) ?? '—',
    code: codeMatch ? codeMatch[1].toUpperCase() : null,
    lines: text ? [text] : [],
  };
}

export async function fetchIvaoATIS(icao: string): Promise<ATISResult | null> {
  const results = await fetchAllIvaoATIS(icao);
  return results[0] ?? null;
}

export async function fetchAllIvaoATIS(icao: string): Promise<ATISResult[]> {
  const data = await getIvaoData();
  const re = new RegExp(`^${icao.toUpperCase()}_[A-Z_]*ATIS`, 'i');
  return (data.clients?.atcs ?? []).filter(a => re.test(a.callsign)).map(parseAtc);
}

import axios from 'axios';
import type { SimbriefOFP } from '../../types/simbrief';

const SIMBRIEF_API_BASE = 'https://www.simbrief.com/api/xml.fetcher.php';

export async function fetchOFP(username: string): Promise<SimbriefOFP> {
  const url = `${SIMBRIEF_API_BASE}?username=${encodeURIComponent(username)}&json=1`;
  const response = await axios.get<SimbriefOFP>(url);
  if (response.data.fetch?.status === 'Error') {
    throw new Error('No flight plan found for this SimBrief username.');
  }
  return response.data;
}


function isKgs(units: unknown): boolean {
  return typeof units !== 'string' || units !== 'lbs';
}

export function formatWeight(value: string, units: unknown): string {
  const num = parseInt(value, 10);
  if (isNaN(num)) return '—';
  return isKgs(units) ? `${(num / 1000).toFixed(1)}T` : `${(num / 1000).toFixed(1)}K lbs`;
}

export function formatFuel(value: string, units: unknown): string {
  const num = parseInt(value, 10);
  if (isNaN(num)) return '—';
  return isKgs(units) ? `${num.toLocaleString()} KG` : `${num.toLocaleString()} LBS`;
}

export function formatTime(seconds: string): string {
  const secs = parseInt(seconds, 10);
  if (isNaN(secs)) return '--:--';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

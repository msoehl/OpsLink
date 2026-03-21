import axios from 'axios';

interface AvwxMetar {
  rawOb: string;
  stationId: string;
  observationTime: string;
}

export async function fetchAvwxMetar(icao: string): Promise<string | null> {
  try {
    let data: AvwxMetar[];

    if (typeof window !== 'undefined' && window.electronAPI) {
      // Electron: use IPC to bypass CORS
      data = (await window.electronAPI.fetchAvwxMetar(icao)) as AvwxMetar[];
    } else {
      // Vite dev server: use proxy
      const response = await axios.get<AvwxMetar[]>(
        `/api/avwx/metar?ids=${encodeURIComponent(icao)}&format=json`
      );
      data = response.data;
    }

    if (Array.isArray(data) && data.length > 0) {
      return data[0].rawOb;
    }
    return null;
  } catch {
    return null;
  }
}

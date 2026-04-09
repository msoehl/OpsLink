const CACHE_MS = 25_000;
let cachedRaw: unknown = null;
let cacheTime = 0;
let inflight: Promise<unknown> | null = null;

/** Single shared fetch+cache for the IVAO whazzup endpoint.
 *  Deduplicates concurrent calls — only one HTTP request in flight at a time. */
export async function fetchIvaoWhazzup(): Promise<unknown> {
  if (cachedRaw && Date.now() - cacheTime < CACHE_MS) return cachedRaw;
  if (inflight) return inflight;
  inflight = fetch('https://api.ivao.aero/v2/tracker/whazzup')
    .then(res => {
      if (!res.ok) throw new Error('IVAO data unavailable');
      return res.json();
    })
    .then(data => {
      cachedRaw = data;
      cacheTime = Date.now();
      inflight = null;
      return data;
    })
    .catch(e => {
      inflight = null;
      throw e;
    });
  return inflight;
}

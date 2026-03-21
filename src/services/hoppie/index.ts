export type HoppieMessageType = 'telex' | 'poll' | 'ping' | 'cpdlc';

export interface CpdlcParsed {
  msgId: string;
  refId: string;
  content: string;
}

export interface HoppieMessage {
  from: string;
  to?: string;
  type: string;
  packet: string;
  isSent?: boolean;
  receivedAt: Date;
  cpdlc?: CpdlcParsed;
}

/** Parse a CPDLC packet: /data2/<msgId>/<refId>/<content> */
export function parseCpdlc(packet: string): CpdlcParsed | null {
  const m = packet.match(/^\/data2\/(\d+)\/(\d*)\/(.*)$/s);
  if (!m) return null;
  return { msgId: m[1], refId: m[2], content: m[3].trim() };
}

/** Build an outgoing CPDLC packet */
export function buildCpdlcPacket(msgId: number, refId: string, content: string): string {
  return `/data2/${msgId}/${refId}/${content}`;
}

/** ATC uplinks (refId empty) are new instructions that need a pilot response */
export function cpdlcNeedsResponse(parsed: CpdlcParsed): boolean {
  return parsed.refId === '';
}

const BASE = 'https://www.hoppie.nl/acars/system/connect.html';

function buildUrl(params: Record<string, string>): string {
  return `${BASE}?${new URLSearchParams(params).toString()}`;
}

export async function hoppiePoll(logon: string, callsign: string): Promise<HoppieMessage[]> {
  const url = buildUrl({ logon, from: callsign, type: 'poll' });
  const res = await fetch(url);
  const text = await res.text();
  return parseResponse(text);
}

export async function hoppieSend(
  logon: string,
  from: string,
  to: string,
  type: string,
  packet: string,
): Promise<string> {
  const url = buildUrl({ logon, from, to, type, packet });
  const res = await fetch(url);
  const text = await res.text();
  if (text.startsWith('error')) throw new Error(text.slice(6).trim());
  return text;
}

export async function hoppiePing(logon: string, callsign: string): Promise<boolean> {
  const url = buildUrl({ logon, from: callsign, to: 'SERVER', type: 'ping', packet: '' });
  const res = await fetch(url);
  const text = await res.text();
  return text.startsWith('ok');
}

/** Returns true if the given station callsign is currently online on Hoppie.
 *  Hoppie echoes the station name in the response body when it is active:
 *  "ok {EDDF_DEL:ping:}" → online,  "ok" (empty body) → offline. */
export async function hoppieStationOnline(logon: string, from: string, station: string): Promise<boolean> {
  try {
    const url = buildUrl({ logon, from, to: station, type: 'ping', packet: '' });
    const res = await fetch(url);
    const text = await res.text();
    return text.startsWith('ok') && text.toUpperCase().includes(station.toUpperCase());
  } catch {
    return false;
  }
}

function parseResponse(raw: string): HoppieMessage[] {
  if (!raw.startsWith('ok')) return [];
  const body = raw.slice(3).trim();
  if (!body) return [];
  const messages: HoppieMessage[] = [];
  // Format: {FROM:TYPE:PACKET} {FROM:TYPE:PACKET} ...
  const re = /\{([^}]+)\}/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    const parts = match[1].split(':');
    if (parts.length < 3) continue;
    const [from, type, ...rest] = parts;
    const packet = rest.join(':');
    const cpdlc = type === 'cpdlc' ? parseCpdlc(packet) ?? undefined : undefined;
    messages.push({ from, type, packet, receivedAt: new Date(), cpdlc });
  }
  return messages;
}

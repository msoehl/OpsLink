import dgram from 'dgram';
import type { PositionCallback, StatusCallback } from './types.js';

const XPLANE_PORT  = 49000; // X-Plane listens here
const LISTEN_PORT  = 49002; // We listen here for RPOS/RREF replies
const RPOS_FREQ    = 2;     // 2 packets per second
const TIMEOUT_MS   = 5_000; // Consider disconnected after 5s of no data

// DREF subscriptions (not included in RPOS)
const VS_DREF_IDX      = 1;
const VS_DREF          = 'sim/flightmodel/position/vh_ind_fpm';
const ENGINE_DREF_IDX  = 2;
const ENGINE_DREF      = 'sim/flightmodel2/engines/engine_is_burning_fuel[0]';

/** X-Plane UDP RPOS connector. Works with X-Plane 11 and 12.
 *  Position data is never cleared on reconnect — only updated when new data arrives. */
export function startXPlaneConnector(
  onPosition: PositionCallback,
  onStatus: StatusCallback,
) {
  let stopped      = false;
  let connected    = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let latestVsFpm        = 0;
  let latestEngineRunning = false;

  const socket = dgram.createSocket('udp4');

  socket.bind(LISTEN_PORT, () => {
    sendRposRequest();
    sendDrefSubscription();
    setInterval(() => {
      if (!stopped) { sendRposRequest(); sendDrefSubscription(); }
    }, 2_000); // Re-request every 2s in case X-Plane restarts
  });

  socket.on('message', (msg) => {
    if (msg.length < 5) return;
    const header = msg.toString('ascii', 0, 4);

    // RREF response — parse subscribed dataref values
    if (header === 'RREF') {
      let offset = 5;
      while (offset + 8 <= msg.length) {
        const idx = msg.readInt32LE(offset);
        const val = msg.readFloatLE(offset + 4);
        if (idx === VS_DREF_IDX)     latestVsFpm         = val;
        if (idx === ENGINE_DREF_IDX) latestEngineRunning = val > 0.5;
        offset += 8;
      }
      return;
    }

    if (header !== 'RPOS') return;

    // RPOS response layout (little-endian, starting at offset 5):
    // double lon (8), double lat (8), double altMSL-m (8),
    // float altAGL-m (4), float pitch (4), float roll (4),
    // float trueHdg (4), float speed-m/s (4)
    if (msg.length < 49) return;

    const lon    = msg.readDoubleLE(5);
    const lat    = msg.readDoubleLE(13);
    const altM   = msg.readDoubleLE(21);
    const trueHdg = msg.readFloatLE(41);
    const speedMs = msg.readFloatLE(45);

    if (!connected) {
      connected = true;
      onStatus(true, 'xplane');
    }

    // Reset disconnect timeout
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      connected = false;
      onStatus(false, null);
    }, TIMEOUT_MS);

    onPosition({
      lat,
      lon,
      altFt:            altM * 3.28084,
      headingTrue:      trueHdg,
      groundspeedKts:   speedMs * 1.94384,
      verticalSpeedFpm: latestVsFpm,
      enginesRunning:   latestEngineRunning,
      source:           'xplane',
      timestamp:        Date.now(),
    });
  });

  socket.on('error', () => { /* ignore */ });

  function sendRposRequest() {
    // "RPOS\0" + float32 (frequency)
    const buf = Buffer.allocUnsafe(9);
    buf.write('RPOS\0', 0, 'ascii');
    buf.writeFloatLE(RPOS_FREQ, 5);
    socket.send(buf, XPLANE_PORT, '127.0.0.1');
  }

  function sendDrefSubscription() {
    // "RREF\0" + int32 frequency + int32 index + char[400] dref path — one packet per DREF
    function subscribe(idx: number, dref: string) {
      const buf = Buffer.alloc(413);
      buf.write('RREF\0', 0, 'ascii');
      buf.writeInt32LE(RPOS_FREQ, 5);
      buf.writeInt32LE(idx, 9);
      buf.write(dref, 13, 'ascii');
      socket.send(buf, XPLANE_PORT, '127.0.0.1');
    }
    subscribe(VS_DREF_IDX,     VS_DREF);
    subscribe(ENGINE_DREF_IDX, ENGINE_DREF);
  }

  return () => {
    stopped = true;
    if (timeoutId) clearTimeout(timeoutId);
    socket.close();
  };
}

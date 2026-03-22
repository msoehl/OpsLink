import dgram from 'dgram';
import type { PositionCallback, StatusCallback } from './types.js';

const XPLANE_PORT  = 49000; // X-Plane listens here
const LISTEN_PORT  = 49002; // We listen here for RPOS replies
const RPOS_FREQ    = 2;     // 2 packets per second
const TIMEOUT_MS   = 5_000; // Consider disconnected after 5s of no data

/** X-Plane UDP RPOS connector. Works with X-Plane 11 and 12.
 *  Position data is never cleared on reconnect — only updated when new data arrives. */
export function startXPlaneConnector(
  onPosition: PositionCallback,
  onStatus: StatusCallback,
) {
  let stopped   = false;
  let connected = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const socket = dgram.createSocket('udp4');

  socket.bind(LISTEN_PORT, () => {
    sendRposRequest();
    setInterval(() => {
      if (!stopped) sendRposRequest();
    }, 2_000); // Re-request every 2s in case X-Plane restarts
  });

  socket.on('message', (msg) => {
    if (msg.length < 5) return;
    const header = msg.toString('ascii', 0, 4);
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
      verticalSpeedFpm: 0, // RPOS doesn't include VS; omit
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

  return () => {
    stopped = true;
    if (timeoutId) clearTimeout(timeoutId);
    socket.close();
  };
}

import { open, Protocol, SimConnectDataType, SimConnectPeriod, SimConnectConstants } from 'node-simconnect';
import type { PositionCallback, StatusCallback } from './types.js';

const DEF_ID  = 0;
const REQ_ID  = 1;

/** Try to connect to MSFS (KittyHawk) or P3D/FSX (FSX_SP2). Auto-retries on disconnect.
 *  Position data is never cleared on reconnect — only updated when new data arrives. */
export function startSimConnectConnector(
  onPosition: PositionCallback,
  onStatus: StatusCallback,
) {
  let stopped = false;

  async function tryConnect(protocol: Protocol, source: 'msfs' | 'p3d') {
    // For P3D: delay the first connection attempt so MSFS (KittyHawk) can connect
    // first and take priority. MSFS accepts both protocols — without this delay
    // the FSX_SP2 connection often wins the race and the UI flashes "P3D" briefly.
    if (source === 'p3d') await sleep(800);

    while (!stopped) {
      try {
        const { handle } = await open('OpsLink', protocol);

        handle.addToDataDefinition(DEF_ID, 'PLANE LATITUDE',              'degrees',         SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(DEF_ID, 'PLANE LONGITUDE',             'degrees',         SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(DEF_ID, 'PLANE ALTITUDE',              'feet',            SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(DEF_ID, 'PLANE HEADING DEGREES TRUE',  'degrees',         SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(DEF_ID, 'GROUND VELOCITY',             'knots',           SimConnectDataType.FLOAT64);
        handle.addToDataDefinition(DEF_ID, 'VERTICAL SPEED',              'feet per minute', SimConnectDataType.FLOAT64);

        handle.requestDataOnSimObject(
          REQ_ID, DEF_ID,
          SimConnectConstants.OBJECT_ID_USER,
          SimConnectPeriod.SECOND,
        );

        onStatus(true, source);

        await new Promise<void>((resolve) => {
          handle.on('simObjectData', (recv) => {
            if (recv.requestID !== REQ_ID) return;
            const d = recv.data;
            onPosition({
              lat:              d.readFloat64(),
              lon:              d.readFloat64(),
              altFt:            d.readFloat64(),
              headingTrue:      d.readFloat64(),
              groundspeedKts:   d.readFloat64(),
              verticalSpeedFpm: d.readFloat64(),
              source,
              timestamp: Date.now(),
            });
          });

          handle.on('error', () => resolve());
          handle.on('close', () => resolve());
        });

        onStatus(false, source);
      } catch {
        // Not running — wait and retry silently
      }

      if (!stopped) await sleep(5_000);
    }
  }

  // Run both protocols in parallel — whichever connects first wins
  tryConnect(Protocol.KittyHawk, 'msfs');
  tryConnect(Protocol.FSX_SP2,   'p3d');

  return () => { stopped = true; };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

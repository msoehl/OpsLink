# Robustness & Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden three services against failure, deduplicate ATIS network state, add a map Center button with manual-only pan, and split the 1800-line ACARS component into focused modules.

**Architecture:** Five independent improvements applied in order: (1) Hoppie rate limiting, (2) VatGlasses timeout + rate-limit error surfacing, (3) ATIS network single source of truth, (4) Map toolbar Center button + FitBounds fix, (5) ACARS component split into hooks + focused components.

**Tech Stack:** React 18, TypeScript, Zustand, Leaflet/React-Leaflet, Tailwind CSS, Electron IPC, Vite.

---

## Task 1: Hoppie Rate Limiting

**Files:**
- Modify: `src/services/hoppie/index.ts`

- [ ] **Step 1: Add module-level rate-limit guard to `hoppiePoll`**

Open `src/services/hoppie/index.ts`. Add the `_lastPollAt` variable and the guard immediately before the `fetch` call inside `hoppiePoll`. The rest of the file is unchanged.

```ts
// add after const BASE = '...' line
let _lastPollAt = 0;
const MIN_POLL_INTERVAL_MS = 10_000;
```

Replace the `hoppiePoll` function body:

```ts
export async function hoppiePoll(logon: string, callsign: string): Promise<HoppieMessage[]> {
  const now = Date.now();
  if (now - _lastPollAt < MIN_POLL_INTERVAL_MS) return [];
  _lastPollAt = now;
  const url = buildUrl({ logon, from: callsign, type: 'poll' });
  const res = await fetch(url);
  const text = await res.text();
  return parseResponse(text);
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/hoppie/index.ts
git commit -m "fix: add 10s minimum interval guard to hoppiePoll"
```

---

## Task 2: VatGlasses Fetch Hardening

**Files:**
- Modify: `src/services/livetraffic/vatglasses.ts`
- Modify: `src/pages/Map/index.tsx`

- [ ] **Step 1: Add `RateLimitError` and `fetchWithTimeout` to vatglasses.ts**

Add after the imports at the top of `src/services/livetraffic/vatglasses.ts` (before `const VATSPY_URL`):

```ts
export class RateLimitError extends Error {
  constructor(public readonly status: number) {
    super(`GitHub API rate limited (HTTP ${status})`);
    this.name = 'RateLimitError';
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Update `loadFirBoundaries` to use timeout**

Replace the `loadFirBoundaries` function:

```ts
async function loadFirBoundaries(): Promise<FirFeature[]> {
  if (firFeatures) return firFeatures;
  try {
    const res = await fetchWithTimeout(VATSPY_URL);
    if (!res.ok) return [];
    const geojson = await res.json();
    firFeatures = geojson.features ?? [];
    return firFeatures!;
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Update `fetchJsonProxy` fallback to use timeout + detect rate limit**

Replace the `fetchJsonProxy` function:

```ts
async function fetchJsonProxy(url: string): Promise<unknown> {
  if (typeof window !== 'undefined' && window.electronAPI?.fetchGeojson) {
    return window.electronAPI.fetchGeojson(url);
  }
  const res = await fetchWithTimeout(url);
  if (res.status === 403 || res.status === 429) throw new RateLimitError(res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Update GitHub API call in `loadTraconRings` to throw `RateLimitError`**

Replace the `// Try 3` block inside `loadTraconRings` (the `try` block that calls the GitHub API):

```ts
  // Try 3: list folder via GitHub API and load ALL sub-files (e.g. N90 → JFK+EWR+LGA+...)
  try {
    const apiUrl = `https://api.github.com/repos/vatsimnetwork/simaware-tracon-project/contents/Boundaries/${folder}`;
    const apiRes = await fetchWithTimeout(apiUrl);
    if (apiRes.status === 403 || apiRes.status === 429) throw new RateLimitError(apiRes.status);
    if (!apiRes.ok) { traconCache.set(prefix, null); return null; }
    const files = await apiRes.json() as { name: string; download_url: string }[];
    if (Array.isArray(files)) {
      const allRings: [number, number][][] = [];
      await Promise.all(
        files
          .filter(f => f.name.endsWith('.json'))
          .map(async f => {
            const r = await fetchRingsFromUrl(f.download_url);
            if (r) allRings.push(...r);
          })
      );
      if (allRings.length > 0) { traconCache.set(prefix, allRings); return allRings; }
    }
  } catch (e) {
    if (e instanceof RateLimitError) throw e; // propagate — caller decides how to surface
    // ignore other errors
  }
```

- [ ] **Step 5: Propagate `RateLimitError` from `fetchControllerSectors`**

In `fetchControllerSectors`, the `Promise.all` over `appCtrl` currently swallows all errors via the outer catch-free flow. Update the APP section to propagate `RateLimitError`:

```ts
  await Promise.all(appCtrl.map(async c => {
    const prefix = c.callsign.split('_')[0].toUpperCase();
    const rings = await loadTraconRings(prefix); // RateLimitError will propagate from Promise.all
    if (rings)
      results.push({ callsign: c.callsign, facility: 5, rings });
  }));
```

This is already the current code; no change needed. `Promise.all` will reject if any promise throws `RateLimitError`, which is then propagated to the caller. ✓

- [ ] **Step 6: Surface `sectorError` in `Map/index.tsx`**

In `src/pages/Map/index.tsx`:

Add import at the top:
```ts
import { fetchControllerSectors, type ControllerSector, RateLimitError } from '../../services/livetraffic/vatglasses';
```

Add state after the existing state declarations (around line 153):
```ts
const [sectorError, setSectorError] = useState<string | null>(null);
```

Update the `fetchControllerSectors` call inside `loadAtc`:
```ts
      if (atisNetwork !== 'ivao') {
        const visible = controllers.filter(c =>
          isFinite(c.latitude) && isFinite(c.longitude) && !(c.latitude === 0 && c.longitude === 0)
        );
        fetchControllerSectors(visible)
          .then(sectors => { setSectorPolygons(sectors); setSectorError(null); })
          .catch(e => {
            if (e instanceof RateLimitError) {
              setSectorError('GitHub rate limit — sector polygons unavailable');
            }
            setSectorPolygons([]);
          });
      }
```

Add the error indicator in the toolbar JSX, after the `{atcEnabled && ...}` span (around line 330):
```tsx
          {sectorError && (
            <span className="text-xs text-amber-500 font-mono" title={sectorError}>
              ⚠ Sectors
            </span>
          )}
```

- [ ] **Step 7: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/services/livetraffic/vatglasses.ts src/pages/Map/index.tsx
git commit -m "fix: add timeout + RateLimitError to VatGlasses fetches, surface sector error in Map toolbar"
```

---

## Task 3: ATIS Network Dedup

**Files:**
- Modify: `src/pages/Acars/index.tsx`

- [ ] **Step 1: Remove `atisNetwork` prop from `DAtisForm`**

In `src/pages/Acars/index.tsx`, find the `DAtisForm` function signature (line ~257):

```ts
function DAtisForm({ airports, hoppieLogon, callsign, atisNetwork, onSend, onInject }: {
  airports: string[];
  hoppieLogon: string;
  callsign: string;
  atisNetwork: 'vatsim' | 'ivao';
  onSend: (to: string, pkt: string) => Promise<void>;
  onInject: (msg: HoppieMessage) => void;
})
```

Replace with (remove `atisNetwork` from params and interface, add store read):

```ts
function DAtisForm({ airports, hoppieLogon, callsign, onSend, onInject }: {
  airports: string[];
  hoppieLogon: string;
  callsign: string;
  onSend: (to: string, pkt: string) => Promise<void>;
  onInject: (msg: HoppieMessage) => void;
}) {
  const atisNetwork = useEFBStore(s => s.atisNetwork);
```

Add the `const atisNetwork = ...` line as the first line of the function body (after the opening `{`).

- [ ] **Step 2: Remove `atisNetwork` prop from `DAtisForm` call site in `AcarsPage`**

Find the `DAtisForm` usage in the compose panel (around line 1744):

```tsx
            <DAtisForm airports={airports} hoppieLogon={hoppieLogon} callsign={callsign} atisNetwork={atisNetwork}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
```

Replace with:

```tsx
            <DAtisForm airports={airports} hoppieLogon={hoppieLogon} callsign={callsign}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Acars/index.tsx
git commit -m "refactor: DAtisForm reads atisNetwork from store directly, removes prop"
```

---

## Task 4: Map Toolbar — Center Button + FitBounds Fix

**Files:**
- Modify: `src/components/map/RouteMap.tsx`
- Modify: `src/pages/Map/index.tsx`

- [ ] **Step 1: Fix `FitBounds` to fire only once per route**

In `src/components/map/RouteMap.tsx`, replace the `FitBounds` component (lines 28-36):

```ts
function FitBounds({ positions, routeKey }: { positions: LatLngTuple[]; routeKey: string }) {
  const map = useMap();
  const firedRef = useRef(false);
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (routeKey !== lastKeyRef.current) {
      lastKeyRef.current = routeKey;
      firedRef.current = false;
    }
    if (!firedRef.current && positions.length > 1) {
      map.fitBounds(positions, { padding: [40, 40] });
      firedRef.current = true;
    }
  }, [map, positions, routeKey]);
  return null;
}
```

Add `useRef` to the react import at line 1:
```ts
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Add `onMapReady` prop and `MapReadyEmitter` to `RouteMap`**

Add `routeKey` and `onMapReady` to the `Props` interface (after `sectorPolygons?`):

```ts
  routeKey?: string;
  onMapReady?: (map: L.Map) => void;
```

Add a `MapReadyEmitter` component right after the `FitBounds` component definition:

```ts
function MapReadyEmitter({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}
```

- [ ] **Step 3: Update `RouteMap` render to pass `routeKey` to `FitBounds` and include `MapReadyEmitter`**

Find the `<FitBounds positions={routePositions} />` usage inside the `MapContainer` and update it. Also add `MapReadyEmitter` right after it:

```tsx
          <FitBounds positions={routePositions} routeKey={routeKey ?? ''} />
          {onMapReady && <MapReadyEmitter onReady={onMapReady} />}
```

- [ ] **Step 4: Add `mapRef` and Center button to `Map/index.tsx`**

Add `L` import to `Map/index.tsx` at the top:
```ts
import L from 'leaflet';
```

Add `mapRef` after the existing `useRef` declarations (around line 153):
```ts
const mapRef = useRef<L.Map | null>(null);
```

Compute `routeKey` after the `bounds` calculation:
```ts
const routeKey = ofp ? `${ofp.origin.icao_code}-${ofp.destination.icao_code}` : '';
```

Add `routeKey` and `onMapReady` props to the `<RouteMap>` element:
```tsx
              <RouteMap
                fixes={fixes}
                originIcao={ofp.origin.icao_code}
                destIcao={ofp.destination.icao_code}
                alternateLat={...}
                alternateLon={...}
                alternateIcao={ofp.alternate?.icao_code}
                traffic={traffic}
                simPosition={simPosition ?? undefined}
                showTrail={trailEnabled}
                controllers={atcVisible}
                sectorPolygons={atcEnabled ? sectorPolygons : []}
                routeKey={routeKey}
                onMapReady={(map) => { mapRef.current = map; }}
              />
```

Add `Crosshair` to the lucide-react import:
```ts
import { Globe, Radio, Loader2, WifiOff, Joystick, Navigation, Trash2, Headphones, Copy, Check, LogIn, Crosshair } from 'lucide-react';
```

Add the Center button to the toolbar, immediately before the clear-trail `<button>` (after the `sectorError` indicator):

```tsx
          <button
            onClick={() => {
              if (!mapRef.current || fixes.length === 0) return;
              const validFixes = fixes.filter(f => f.pos_lat !== '0.000000' && f.pos_long !== '0.000000');
              if (validFixes.length < 2) return;
              const latLngs = validFixes.map(f => [parseFloat(f.pos_lat), parseFloat(f.pos_long)] as [number, number]);
              mapRef.current.fitBounds(latLngs, { padding: [40, 40] });
            }}
            title="Center on route"
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border border-[var(--c-border)] text-gray-500 hover:text-white hover:border-[var(--c-border2)] transition-colors"
          >
            <Crosshair size={12} />
          </button>
```

- [ ] **Step 5: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, open the Map page. Verify:
1. Map does NOT auto-jump when sim position updates.
2. Loading a new OFP causes one fitBounds on first render.
3. Clicking Center button fits the route.

- [ ] **Step 7: Commit**

```bash
git add src/components/map/RouteMap.tsx src/pages/Map/index.tsx
git commit -m "feat: add Center button to Map toolbar, fix FitBounds to fire only on route change"
```

---

## Task 5: ACARS — Extract `useMessageActions` hook

**Files:**
- Create: `src/pages/Acars/hooks/useMessageActions.ts`
- Modify: `src/pages/Acars/index.tsx`

- [ ] **Step 1: Create the hooks directory and `useMessageActions.ts`**

Create `src/pages/Acars/hooks/useMessageActions.ts` with the following content (extracted from `AcarsPage`):

```ts
import { useRef, useState } from 'react';
import { useEFBStore } from '../../../store/efbStore';
import { hoppieSend, hoppiePoll } from '../../../services/hoppie';
import type { HoppieMessage } from '../../../services/hoppie';
import { fetchVatsimATIS } from '../../../services/atis/vatsim';
import { fetchIvaoATIS } from '../../../services/atis/ivao';
import { playIncomingBeep, playCpdlcChime, playOpsBeep } from '../../../services/audio';
import type { SimPosition } from '../../../types/simulator';

function utcNow(): string {
  return new Date().toUTCString().slice(17, 22) + 'Z';
}

function utcPlus(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60000);
  return d.toUTCString().slice(17, 22) + 'Z';
}

function nmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(a));
}

export { utcNow, utcPlus };

export function useMessageActions() {
  const {
    ofp, hoppieLogon, atisNetwork, soundEnabled,
    addAcarsMessage, incrementAcarsUnread,
    activeLogbookEntryId, updateLogbookEntry, closeLogbookEntry,
    setHoppiePolling, setHoppieError,
  } = useEFBStore();

  const callsign = ofp?.atc?.callsign ?? '';
  const fuelUnits = ofp?.general?.units?.toUpperCase() === 'LBS' ? 'LBS' : 'KG';

  const [respondedIdx, setRespondedIdx] = useState<Set<number>>(new Set());
  const [inlineReply, setInlineReply] = useState<{ idx: number; fob: string; fl: string; eta: string } | null>(null);

  const phaseRef    = useRef<string>('preflight');
  const firedRef    = useRef<Set<string>>(new Set());
  const opsCallsign = useRef<string>('OPSLINKOPS');
  const autoAtisRef = useRef<Set<string>>(new Set());

  async function sendMsg(to: string, type: string, packet: string): Promise<void> {
    await hoppieSend(hoppieLogon, callsign, to, type, packet);
    addAcarsMessage({ from: callsign, to, type, packet, isSent: true, receivedAt: new Date() });
  }

  function injectOps(packet: string) {
    addAcarsMessage({ from: opsCallsign.current, type: 'telex', packet, receivedAt: new Date() });
    incrementAcarsUnread();
    if (soundEnabled) playOpsBeep();
    if (hoppieLogon && callsign) {
      hoppieSend(hoppieLogon, opsCallsign.current, callsign, 'telex', packet).catch(() => {});
    }
  }

  function replyToMsg(idx: number, to: string, packet: string) {
    sendMsg(to, 'telex', packet).catch(() => {});
    setRespondedIdx(s => new Set(s).add(idx));
    setInlineReply(null);
  }

  async function poll() {
    const s = useEFBStore.getState();
    const cs = s.ofp?.atc?.callsign ?? '';
    if (!s.hoppieLogon || !cs) return;
    s.setHoppiePolling(true);
    try {
      const msgs = await hoppiePoll(s.hoppieLogon, cs);
      if (msgs.length > 0) {
        msgs.forEach((m: HoppieMessage) => {
          s.addAcarsMessage(m);
          if (s.soundEnabled) {
            if (m.type === 'cpdlc') playCpdlcChime();
            else if (m.from?.endsWith('_ATIS') || m.from === 'OPSLINKOPS') playOpsBeep();
            else playIncomingBeep();
          }
        });
        s.incrementAcarsUnread();
      }
      s.setHoppieError(null);
    } catch {
      s.setHoppieError('Poll failed');
    } finally {
      useEFBStore.getState().setHoppiePolling(false);
    }
  }

  function testAllPhaseMessages() {
    if (!ofp) return;
    firedRef.current.clear();
    const cs  = ofp.atc.callsign;
    const dep = ofp.origin.icao_code;
    const dst = ofp.destination.icao_code;
    const u   = fuelUnits;
    const acr = ofp.aircraft.reg ?? ofp.aircraft.icaocode;
    const acType = ofp.aircraft.icaocode;
    const etaMin = 90;
    const messages: string[] = [
      ['PAX / LOAD BRIEF', `FLIGHT ${cs}  ${dep}-${dst}`, `AIRCRAFT ${acr}  ${acType}`,
        `PAX               ${ofp.weights.pax_count ?? '—'}`, `BAGS              ${ofp.weights.bag_count ?? '—'}`,
        `PAYLOAD           ${ofp.weights.payload ?? '—'} ${u}`, `EST ZFW           ${ofp.weights.est_zfw ?? '—'} ${u}`,
        `EST TOW           ${ofp.weights.est_tow ?? '—'} ${u}`, `RAMP FUEL         ${ofp.fuel.plan_ramp ?? '—'} ${u}`,
        'LOADSHEET SIGNED — READY FOR BOARDING'].join('\n'),
      ['DEPARTURE INFORMATION', `FLIGHT ${cs}  ${dep}-${dst}`, `AIRCRAFT ${acr}  ${acType}`,
        'SLOT/CTOT AS FILED', 'PRE-DEPARTURE CLEARANCE AVAILABLE ON REQUEST', 'HAVE A SAFE DEPARTURE'].join('\n'),
      ['AIRBORNE NOTIFICATION', `FLIGHT ${cs}  ${dep}-${dst}`,
        `AIRBORNE TIME  ${utcNow()}`, `ETA ${dst}  ${utcPlus(etaMin)}`, 'REPORT WHEN LEVEL'].join('\n'),
      ['CRUISE CHECK REQUEST', `FLIGHT ${cs}  ${dep}-${dst}`, 'PLEASE REPORT:',
        `  FOB (${u})`, '  CURRENT LEVEL', `  ETA ${dst}`, 'THANK YOU'].join('\n'),
      ['CONNEX SCHEDULE', `FLIGHT ${cs}  ${dep}-${dst}`, 'TOTAL CONNEX PAX  18', '',
        `FROM ${cs.replace(/\d.*$/, '')}456  ARR ${utcPlus(etaMin - 8)}   10 PAX`,
        `FROM ${cs.replace(/\d.*$/, '')}789  ARR ${utcPlus(etaMin + 12)}   8 PAX`, '',
        'MIN CONNECT TIME  45 MIN', 'NOTE PRIORITY OFFLOAD RECOMMENDED'].join('\n'),
      ['DESTINATION WEATHER ADVISORY', `FLIGHT ${cs}  APPROACHING ${dst}`,
        'CURRENT CONDITIONS ON REQUEST', 'RECOMMEND REQUEST D-ATIS VIA ACARS',
        'EXPECT ILS APPROACH', 'HAVE A SAFE DESCENT'].join('\n'),
      ['GATE ASSIGNMENT', `FLIGHT ${cs}  ${dep}-${dst}`,
        'ARR GATE/STAND  B14', `ETA             ${utcPlus(20)}`, 'HANDLING TEAM NOTIFIED', `WELCOME TO ${dst}`].join('\n'),
      ['LANDING ACKNOWLEDGEMENT', `FLIGHT ${cs}  LANDED ${dst}`,
        `LANDING TIME  ${utcNow()}`, 'PLEASE REPORT BLOCK IN TIME', 'GROUND HANDLING STANDING BY'].join('\n'),
      ['BLOCK IN / FUEL UPLIFT REQUEST', `FLIGHT ${cs}  ${dep}-${dst}`,
        `BLOCK IN TIME      ${utcNow()}`, '',
        '── FUEL SUMMARY ──────────────────',
        `PLANNED RAMP       ${ofp.fuel.plan_ramp ?? '—'} ${u}`,
        `PLANNED LAND       ${ofp.fuel.plan_land ?? '—'} ${u}`,
        `ENROUTE BURN       ${ofp.fuel.enroute_burn ?? '—'} ${u}`,
        `TAXI BURN          ${ofp.fuel.taxi ?? '—'} ${u}`, '',
        '── UPLIFT REQUEST ────────────────',
        `TARGET RAMP FUEL   ${ofp.fuel.plan_ramp ?? '—'} ${u}`,
        'PLEASE ARRANGE FUEL UPLIFT', 'CONFIRM ACTUAL FOB AND DEFECTS'].join('\n'),
      ['CATERING / CREW MEALS', `FLIGHT ${cs}  ${dep}-${dst}`,
        `TOTAL PAX    ${ofp.weights.pax_count ?? '—'}`,
        'PLEASE CONFIRM CATERING UPLIFT', 'ADVISE ANY SPECIAL MEAL CHANGES'].join('\n'),
    ];
    messages.forEach((pkt, i) => setTimeout(() => injectOps(pkt), i * 400));
  }

  // Phase detection side-effect — call this as a useEffect dependency in the page
  function runPhaseDetection(simPosition: SimPosition) {
    if (!ofp) return;
    const { altFt, groundspeedKts, verticalSpeedFpm } = simPosition;
    const dep  = ofp.origin;
    const dest = ofp.destination;
    const depLat   = parseFloat(dep.pos_lat);
    const depLon   = parseFloat(dep.pos_long);
    const destLat  = parseFloat(dest.pos_lat);
    const destLon  = parseFloat(dest.pos_long);
    const distToDest   = isFinite(destLat) ? nmBetween(simPosition.lat, simPosition.lon, destLat, destLon) : 999;
    const distToOrigin = isFinite(depLat)  ? nmBetween(simPosition.lat, simPosition.lon, depLat, depLon)   : 999;

    let phase: string;
    if (altFt < 800 && groundspeedKts < 5)               phase = distToOrigin < distToDest ? 'preflight' : 'on_block';
    else if (altFt < 800 && groundspeedKts >= 5 && groundspeedKts < 80) phase = distToOrigin < distToDest ? 'taxi_out' : 'taxi_in';
    else if (altFt < 800 && groundspeedKts >= 80)         phase = 'takeoff_roll';
    else if (altFt >= 800 && verticalSpeedFpm > 300)      phase = 'climb';
    else if (altFt >= 800 && verticalSpeedFpm < -500 && distToDest > 80) phase = 'descent';
    else if (altFt >= 800 && distToDest <= 80)            phase = 'approach';
    else if (altFt >= 10000 && Math.abs(verticalSpeedFpm) <= 300 && groundspeedKts > 150) phase = 'cruise';
    else phase = phaseRef.current;

    const prev = phaseRef.current;
    if (phase === prev) return;
    phaseRef.current = phase;

    // Update logbook
    if (activeLogbookEntryId) {
      const s = useEFBStore.getState();
      const entry = s.logbookEntries.find(e => e.id === activeLogbookEntryId);
      if (entry) {
        const phaseHistory = [...entry.phaseHistory, { phase, time: utcNow() }];
        updateLogbookEntry(activeLogbookEntryId, { phaseHistory });
        if (phase === 'taxi_out') updateLogbookEntry(activeLogbookEntryId, { offBlockUtc: utcNow() });
        if (phase === 'on_block') {
          updateLogbookEntry(activeLogbookEntryId, {
            onBlockUtc: utcNow(),
            simulator: (simPosition as { source?: 'msfs' | 'p3d' | 'xplane' }).source ?? null,
          });
          closeLogbookEntry();
        }
      }
    }

    const cs  = ofp.atc.callsign;
    const depCode = ofp.origin.icao_code;
    const dst = ofp.destination.icao_code;
    const u   = fuelUnits;
    const acr = ofp.aircraft.reg ?? ofp.aircraft.icaocode;
    const acType = ofp.aircraft.icaocode;

    const fire = (key: string, msg: string) => {
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);
      injectOps(msg);
    };

    if (phase === 'preflight') {
      fire('pax_brief', ['PAX / LOAD BRIEF', `FLIGHT ${cs}  ${depCode}-${dst}`, `AIRCRAFT ${acr}  ${acType}`,
        `PAX               ${ofp.weights.pax_count ?? '—'}`, `BAGS              ${ofp.weights.bag_count ?? '—'}`,
        `PAYLOAD           ${ofp.weights.payload ?? '—'} ${u}`, `EST ZFW           ${ofp.weights.est_zfw ?? '—'} ${u}`,
        `EST TOW           ${ofp.weights.est_tow ?? '—'} ${u}`, `RAMP FUEL         ${ofp.fuel.plan_ramp ?? '—'} ${u}`,
        'LOADSHEET SIGNED — READY FOR BOARDING'].join('\n'));
    }
    if (phase === 'taxi_out') {
      fire('taxi_out', ['DEPARTURE INFORMATION', `FLIGHT ${cs}  ${depCode}-${dst}`, `AIRCRAFT ${acr}  ${acType}`,
        'SLOT/CTOT AS FILED', 'PRE-DEPARTURE CLEARANCE AVAILABLE ON REQUEST', 'HAVE A SAFE DEPARTURE'].join('\n'));
    }
    if (phase === 'climb') {
      fire('airborne', ['AIRBORNE NOTIFICATION', `FLIGHT ${cs}  ${depCode}-${dst}`,
        `AIRBORNE TIME  ${utcNow()}`,
        `ETA ${dst}  ${utcPlus(parseInt(ofp.times.est_time_enroute || '7200') / 60 - (Date.now() / 60000 % 10))}`,
        'REPORT WHEN LEVEL'].join('\n'));
    }
    if (phase === 'cruise') {
      fire('cruise_check', ['CRUISE CHECK REQUEST', `FLIGHT ${cs}  ${depCode}-${dst}`, 'PLEASE REPORT:',
        `  FOB (${u})`, '  CURRENT LEVEL', `  ETA ${dst}`, 'THANK YOU'].join('\n'));
      const etaMin   = groundspeedKts > 0 ? Math.round(distToDest / groundspeedKts * 60) : 90;
      const totalPax = Math.floor(Math.random() * 25 + 3);
      const pax1 = Math.floor(totalPax * 0.55);
      const pax2 = totalPax - pax1;
      const airline = cs.replace(/\d.*$/, '');
      fire('connex', ['CONNEX SCHEDULE', `FLIGHT ${cs}  ${depCode}-${dst}`, `TOTAL CONNEX PAX  ${totalPax}`, '',
        `FROM ${airline}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin - 8)}   ${pax1} PAX`,
        `FROM ${airline}${Math.floor(Math.random() * 900 + 100)}  ARR ${utcPlus(etaMin + 12)}  ${pax2} PAX`, '',
        'MIN CONNECT TIME  45 MIN', ...(pax2 > 8 ? ['NOTE PRIORITY OFFLOAD RECOMMENDED'] : [])].join('\n'));
    }
    if (phase === 'descent') {
      fire('descent_wx', ['DESTINATION WEATHER ADVISORY', `FLIGHT ${cs}  APPROACHING ${dst}`,
        'CURRENT CONDITIONS ON REQUEST', 'RECOMMEND REQUEST D-ATIS VIA ACARS',
        'EXPECT ILS APPROACH', 'HAVE A SAFE DESCENT'].join('\n'));
    }
    if (phase === 'approach') {
      const gates  = ['A', 'B', 'C', 'D', 'E'];
      const arrGate = `${gates[Math.floor(Math.random() * gates.length)]}${Math.floor(Math.random() * 40 + 1)}`;
      fire('gate_approach', ['GATE ASSIGNMENT', `FLIGHT ${cs}  ${depCode}-${dst}`,
        `ARR GATE/STAND  ${arrGate}`, `ETA             ${utcPlus(Math.round(distToDest / (groundspeedKts || 250) * 60))}`,
        'HANDLING TEAM NOTIFIED', 'WELCOME TO ' + dst].join('\n'));
    }
    if (phase === 'taxi_in') {
      fire('landed', ['LANDING ACKNOWLEDGEMENT', `FLIGHT ${cs}  LANDED ${dst}`,
        `LANDING TIME  ${utcNow()}`, 'PLEASE REPORT BLOCK IN TIME', 'GROUND HANDLING STANDING BY'].join('\n'));
    }
    if (phase === 'on_block' && distToDest < 15) {
      fire('on_block', ['BLOCK IN / FUEL UPLIFT REQUEST', `FLIGHT ${cs}  ${depCode}-${dst}`,
        `BLOCK IN TIME      ${utcNow()}`, '', '── FUEL SUMMARY ──────────────────',
        `PLANNED RAMP       ${ofp.fuel.plan_ramp ?? '—'} ${u}`,
        `PLANNED LAND       ${ofp.fuel.plan_land ?? '—'} ${u}`,
        `ENROUTE BURN       ${ofp.fuel.enroute_burn ?? '—'} ${u}`,
        `TAXI BURN          ${ofp.fuel.taxi ?? '—'} ${u}`, '',
        '── UPLIFT REQUEST ────────────────',
        `TARGET RAMP FUEL   ${ofp.fuel.plan_ramp ?? '—'} ${u}`,
        'PLEASE ARRANGE FUEL UPLIFT', 'CONFIRM ACTUAL FOB AND DEFECTS'].join('\n'));
      fire('meals_reminder', ['CATERING / CREW MEALS', `FLIGHT ${cs}  ${depCode}-${dst}`,
        `TOTAL PAX    ${ofp.weights.pax_count ?? '—'}`,
        'PLEASE CONFIRM CATERING UPLIFT', 'ADVISE ANY SPECIAL MEAL CHANGES'].join('\n'));
    }
  }

  function runAutoAtis(simPosition: SimPosition) {
    if (!ofp) return;
    const destLat = parseFloat(ofp.destination.pos_lat);
    const destLon = parseFloat(ofp.destination.pos_long);
    if (!isFinite(destLat) || !isFinite(destLon)) return;
    const distNm = nmBetween(simPosition.lat, simPosition.lon, destLat, destLon);
    const destIcao = ofp.destination.icao_code;
    if (distNm < 200 && !autoAtisRef.current.has(destIcao)) {
      autoAtisRef.current.add(destIcao);
      const fetchFn = atisNetwork === 'ivao' ? fetchIvaoATIS : fetchVatsimATIS;
      fetchFn(destIcao).then(result => {
        if (result && result.lines.length > 0) {
          const infoLine = result.code ? `INFORMATION ${result.code}\n` : '';
          const packet = `[AUTO D-ATIS]\n${infoLine}${result.lines.join('\n')}`;
          addAcarsMessage({ from: `${destIcao}_ATIS`, type: 'telex', packet, receivedAt: new Date() });
          incrementAcarsUnread();
          if (soundEnabled) playOpsBeep();
          if (hoppieLogon && callsign) {
            hoppieSend(hoppieLogon, `${destIcao}_ATIS`, callsign, 'telex', packet).catch(() => {});
          }
        }
      }).catch(() => {});
    }
  }

  return {
    sendMsg, injectOps, replyToMsg, poll, testAllPhaseMessages,
    runPhaseDetection, runAutoAtis,
    respondedIdx, setRespondedIdx,
    inlineReply, setInlineReply,
    fuelUnits,
  };
}
```

- [ ] **Step 2: Update `AcarsPage` to use `useMessageActions`**

In `src/pages/Acars/index.tsx`:

Add import at the top:
```ts
import { useMessageActions, utcNow, utcPlus } from './hooks/useMessageActions';
```

Remove `utcNow` and `utcPlus` function definitions from `index.tsx` (they are now exported from the hook file).

Remove `nmBetween` function definition from `index.tsx`.

Remove `phaseRef`, `firedRef`, `opsCallsign`, `autoAtisRef` refs from `AcarsPage`.

Remove `respondedIdx`, `setRespondedIdx`, `inlineReply`, `setInlineReply` from `AcarsPage`.

Remove `sendMsg`, `injectOps`, `replyToMsg`, `poll`, `testAllPhaseMessages` function definitions from `AcarsPage`.

Add after the existing state/store destructuring in `AcarsPage`:
```ts
  const {
    sendMsg, injectOps, replyToMsg, poll, testAllPhaseMessages,
    runPhaseDetection, runAutoAtis,
    respondedIdx, setRespondedIdx,
    inlineReply, setInlineReply,
    fuelUnits,
  } = useMessageActions();
```

Replace the two `useEffect` hooks that referenced `simPosition` for phase detection and auto-ATIS (the eslint-disable blocks around lines 1159-1188 and 1215-1411) with:
```ts
  useEffect(() => {
    if (!simPosition) return;
    runAutoAtis(simPosition);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPosition]);

  useEffect(() => {
    if (!simPosition) return;
    runPhaseDetection(simPosition);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPosition]);
```

Remove the `fuelUnits` calculation from `AcarsPage` (it's now returned from the hook).

- [ ] **Step 3: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Acars/hooks/useMessageActions.ts src/pages/Acars/index.tsx
git commit -m "refactor: extract useMessageActions hook from AcarsPage"
```

---

## Task 6: ACARS — Extract `useCpdlc` hook

**Files:**
- Create: `src/pages/Acars/hooks/useCpdlc.ts`
- Modify: `src/pages/Acars/index.tsx`

- [ ] **Step 1: Create `useCpdlc.ts`**

Create `src/pages/Acars/hooks/useCpdlc.ts`:

```ts
import { useEffect } from 'react';
import { useEFBStore } from '../../../store/efbStore';
import { buildCpdlcPacket } from '../../../services/hoppie';

export function useCpdlc(
  sendMsg: (to: string, type: string, packet: string) => Promise<void>,
  setMode: (mode: string) => void,
) {
  const { cpdlcStation, nextCpdlcMsgId, pendingCpdlcLogon } = useEFBStore();

  // Auto-switch to CPDLC mode when triggered from Map page
  useEffect(() => {
    if (pendingCpdlcLogon) setMode('cpdlc');
  }, [pendingCpdlcLogon, setMode]);

  async function respondCpdlc(refMsgId: string, response: string) {
    const id = nextCpdlcMsgId();
    await sendMsg(cpdlcStation, 'cpdlc', buildCpdlcPacket(id, refMsgId, response));
  }

  return { respondCpdlc };
}
```

- [ ] **Step 2: Update `AcarsPage` to use `useCpdlc`**

Add import to `src/pages/Acars/index.tsx`:
```ts
import { useCpdlc } from './hooks/useCpdlc';
```

Remove the `respondCpdlc` function definition from `AcarsPage`.

Remove the `useEffect` for `pendingCpdlcLogon` from `AcarsPage`.

Add after `useMessageActions()` call:
```ts
  const { respondCpdlc } = useCpdlc(sendMsg, setMode);
```

- [ ] **Step 3: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Acars/hooks/useCpdlc.ts src/pages/Acars/index.tsx
git commit -m "refactor: extract useCpdlc hook from AcarsPage"
```

---

## Task 7: ACARS — Extract `MessageBubble` and `MessageList` components

**Files:**
- Create: `src/pages/Acars/components/MessageBubble.tsx`
- Create: `src/pages/Acars/components/MessageList.tsx`
- Modify: `src/pages/Acars/index.tsx`

- [ ] **Step 1: Create `MessageBubble.tsx`**

Create `src/pages/Acars/components/MessageBubble.tsx`. This contains the rendering of a single message. Extract the inner `<div>` from the `filteredMessages.map` in `AcarsPage` (lines ~1550–1712):

```tsx
import clsx from 'clsx';
import { useEFBStore } from '../../../store/efbStore';
import { parseCpdlc, cpdlcNeedsResponse } from '../../../services/hoppie';
import type { HoppieMessage } from '../../../services/hoppie';
import { utcNow } from '../hooks/useMessageActions';

function msgAccent(packet: string): 'clearance' | 'unable' | 'wilco' | 'none' {
  const up = packet.toUpperCase();
  if (up.includes('UNABLE') || up.includes('NEGATIVE')) return 'unable';
  if (up.includes('WILCO') || up.includes('ROGER'))     return 'wilco';
  if (up.includes('CLEARED') || up.includes('CLEARANCE') || up.includes('APPROVED')) return 'clearance';
  return 'none';
}

function parsePDCMessage(packet: string): { squawk?: string; sid?: string; initialClimb?: string } | null {
  const up = packet.toUpperCase();
  if (!up.includes('PREDEP') && !up.includes('CLEARANCE') && !up.includes('SQUAWK')) return null;
  const squawk    = up.match(/SQUAWK\s+(\d{4})/)?.[1];
  const sid       = up.match(/(?:SID|DEPARTURE)\s+([A-Z]{2,6}\d[A-Z]?)/)?.[1];
  const initClimb = up.match(/(?:CLIMB TO|INITIAL CLIMB|CLB TO|CLIMB)\s+(FL\d+|\d{4,5})/)?.[1];
  return (squawk || sid || initClimb) ? { squawk, sid, initialClimb: initClimb } : null;
}

const ACCENT: Record<string, string> = {
  clearance: 'border-green-500/40 bg-green-500/5',
  unable:    'border-red-500/40 bg-red-500/5',
  wilco:     'border-amber-500/40 bg-amber-500/5',
  none:      'border-[var(--c-border)] bg-[var(--c-surface)]',
};

interface MessageBubbleProps {
  msg: HoppieMessage;
  idx: number;
  callsign: string;
  fuelUnits: string;
  responded: boolean;
  inlineReply: { idx: number; fob: string; fl: string; eta: string } | null;
  onSetInlineReply: (v: { idx: number; fob: string; fl: string; eta: string } | null) => void;
  onReply: (to: string) => void;
  onReplyMsg: (idx: number, to: string, packet: string) => void;
  onRespondCpdlc: (refMsgId: string, response: string) => void;
}

export function MessageBubble({
  msg, idx, callsign, fuelUnits, responded,
  inlineReply, onSetInlineReply, onReply, onReplyMsg, onRespondCpdlc,
}: MessageBubbleProps) {
  const simPosition = useEFBStore(s => s.simPosition);
  const cpdlc = msg.cpdlc ?? (msg.type === 'cpdlc' ? parseCpdlc(msg.packet) ?? undefined : undefined);
  const displayText = (msg.type === 'cpdlc' && cpdlc) ? cpdlc.content : msg.packet;
  const accent = msg.isSent ? 'none' : msgAccent(displayText);
  const receivedAt = new Date(msg.receivedAt);
  const pdcParsed = !msg.isSent ? parsePDCMessage(msg.packet) : null;

  return (
    <div className={clsx('flex', msg.isSent ? 'justify-end' : 'justify-start')}>
      <div className={clsx(
        'max-w-[92%] rounded-xl p-2.5 text-xs font-mono border',
        msg.isSent
          ? 'bg-blue-600/10 border-blue-500/20 rounded-br-sm'
          : `${ACCENT[accent]} rounded-bl-sm`
      )}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className={clsx('font-semibold text-[10px] uppercase', msg.isSent ? 'text-blue-400' : 'text-green-400')}>
            {msg.isSent ? `▲ ${msg.to}` : `▼ ${msg.from}`}
            <span className="text-gray-600"> · {msg.type.toUpperCase()}</span>
            {!msg.isSent && (
              <button onClick={() => onReply(msg.from ?? '')}
                className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors ml-1" title="Reply">
                ↩
              </button>
            )}
          </span>
          <span className="text-gray-600 text-[10px] shrink-0">{receivedAt.toUTCString().slice(17, 22)}Z</span>
        </div>
        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap break-words">{displayText}</div>

        {pdcParsed && (pdcParsed.squawk || pdcParsed.sid || pdcParsed.initialClimb) && (
          <div className="mt-2 border border-blue-500/30 bg-blue-500/5 rounded p-2">
            <div className="text-[9px] text-blue-400 uppercase tracking-wider mb-1">PDC Parsed</div>
            <div className="flex gap-4 font-mono text-[10px]">
              {pdcParsed.squawk    && <span><span className="text-gray-500">SQK </span><span className="text-white">{pdcParsed.squawk}</span></span>}
              {pdcParsed.sid       && <span><span className="text-gray-500">SID </span><span className="text-white">{pdcParsed.sid}</span></span>}
              {pdcParsed.initialClimb && <span><span className="text-gray-500">CLB </span><span className="text-white">{pdcParsed.initialClimb}</span></span>}
            </div>
          </div>
        )}

        {!msg.isSent && accent !== 'none' && (
          <div className={clsx('mt-1.5 text-[10px] font-medium uppercase', {
            'text-green-400': accent === 'clearance',
            'text-red-400':   accent === 'unable',
            'text-amber-400': accent === 'wilco',
          })}>
            {accent === 'clearance' ? '✓ Clearance received' : accent === 'unable' ? '✗ Unable' : '✓ Acknowledged'}
          </div>
        )}

        {!msg.isSent && msg.type === 'cpdlc' && cpdlc && cpdlcNeedsResponse(cpdlc) && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {['WILCO', 'UNABLE', 'ROGER', 'STANDBY'].map(resp => (
              <button key={resp} onClick={() => onRespondCpdlc(cpdlc.msgId, resp)}
                className={clsx('px-2.5 py-1 rounded text-[10px] font-mono border transition-colors',
                  resp === 'WILCO' ? 'border-green-500/40 text-green-400 hover:bg-green-500/10' :
                  resp === 'UNABLE' ? 'border-red-500/40 text-red-400 hover:bg-red-500/10' :
                  'border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'
                )}>
                {resp}
              </button>
            ))}
          </div>
        )}

        {!msg.isSent && msg.packet.includes('REPLY ACPT') && !responded && (
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `ACPT\nFLIGHT ${callsign}\nLOADSHEET ACKNOWLEDGED ${utcNow()}`)}
              className="px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">✓ ACPT</button>
            <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `REJECT\nFLIGHT ${callsign}\nLOADSHEET REJECTED — PLEASE REVISE`)}
              className="px-3 py-1 rounded text-[10px] font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">✗ REJECT</button>
          </div>
        )}

        {!msg.isSent && msg.packet.includes('REPORT WHEN LEVEL') && !responded && (
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `WILCO\nFLIGHT ${callsign}\nWILL REPORT WHEN LEVEL`)}
              className="px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">✓ WILCO</button>
            <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `UNABLE\nFLIGHT ${callsign}`)}
              className="px-3 py-1 rounded text-[10px] font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">✗ UNABLE</button>
          </div>
        )}

        {!msg.isSent && msg.packet.includes('PLEASE REPORT:') && msg.packet.includes('FOB') && !responded && (
          inlineReply?.idx === idx ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1.5 flex-wrap">
                <input value={inlineReply.fob} onChange={e => onSetInlineReply({ ...inlineReply, fob: e.target.value })}
                  placeholder={`FOB (${fuelUnits})`}
                  className="flex-1 min-w-[80px] bg-[var(--c-bg)] border border-[var(--c-border)] rounded px-2 py-1 text-[10px] font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-[var(--c-border2)]" />
                <input value={inlineReply.fl} onChange={e => onSetInlineReply({ ...inlineReply, fl: e.target.value })}
                  placeholder="FL e.g. 350"
                  className="flex-1 min-w-[80px] bg-[var(--c-bg)] border border-[var(--c-border)] rounded px-2 py-1 text-[10px] font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-[var(--c-border2)]" />
                <input value={inlineReply.eta} onChange={e => onSetInlineReply({ ...inlineReply, eta: e.target.value })}
                  placeholder="ETA e.g. 1430Z"
                  className="flex-1 min-w-[80px] bg-[var(--c-bg)] border border-[var(--c-border)] rounded px-2 py-1 text-[10px] font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-[var(--c-border2)]" />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS',
                  `CRUISE REPORT\nFLIGHT ${callsign}\nFOB         ${inlineReply.fob || '—'} ${fuelUnits}\nCURRENT FL  ${inlineReply.fl || '—'}\nETA         ${inlineReply.eta || '—'}`)}
                  className="px-3 py-1 rounded text-[10px] font-mono border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors">▲ SEND REPORT</button>
                <button onClick={() => onSetInlineReply(null)}
                  className="px-2 py-1 rounded text-[10px] font-mono border border-[var(--c-border)] text-gray-500 hover:text-gray-300 transition-colors">✕</button>
              </div>
            </div>
          ) : (
            <button onClick={() => onSetInlineReply({ idx, fob: '', fl: simPosition ? `${Math.round(simPosition.altFt / 100)}` : '', eta: '' })}
              className="mt-2 px-3 py-1 rounded text-[10px] font-mono border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors">
              ↩ SEND CRUISE REPORT
            </button>
          )
        )}

        {!msg.isSent && msg.packet.includes('PLEASE REPORT BLOCK IN TIME') && !responded && (
          <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `BLOCK IN\nFLIGHT ${callsign}\nBLOCK IN TIME  ${utcNow()}`)}
            className="mt-2 px-3 py-1 rounded text-[10px] font-mono border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors">⏱ BLOCK IN NOW</button>
        )}

        {!msg.isSent && msg.packet.includes('CONFIRM ACTUAL FOB AND DEFECTS') && !responded && (
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `CONFIRMED\nFLIGHT ${callsign}\nFOB AS PLANNED — NO DEFECTS`)}
              className="px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">✓ CONFIRM</button>
            <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `DEFECTS NOTED\nFLIGHT ${callsign}\nDEFECTS TO FOLLOW — STAND BY`)}
              className="px-3 py-1 rounded text-[10px] font-mono border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors">⚠ ADVISE DEFECTS</button>
          </div>
        )}

        {!msg.isSent && msg.packet.includes('PLEASE CONFIRM CATERING UPLIFT') && !responded && (
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `CONFIRMED\nFLIGHT ${callsign}\nCATERING UPLIFT CONFIRMED`)}
              className="px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">✓ CONFIRMED</button>
            <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `UNABLE\nFLIGHT ${callsign}\nCATERING ISSUE — PLEASE ADVISE`)}
              className="px-3 py-1 rounded text-[10px] font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">✗ UNABLE</button>
          </div>
        )}

        {!msg.isSent && msg.packet.includes('ACKNOWLEDGE WHEN READY') && !responded && (
          <button onClick={() => onReplyMsg(idx, msg.from ?? 'OPSLINKOPS', `ACKNOWLEDGED\nFLIGHT ${callsign}\nGATE INFO RECEIVED ${utcNow()}`)}
            className="mt-2 px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">✓ ACKNOWLEDGED</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `MessageList.tsx`**

Create `src/pages/Acars/components/MessageList.tsx`:

```tsx
import { useRef, useEffect } from 'react';
import type { HoppieMessage } from '../../../services/hoppie';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: { m: HoppieMessage; i: number }[];
  allCount: number;
  searchQuery: string;
  callsign: string;
  fuelUnits: string;
  respondedIdx: Set<number>;
  inlineReply: { idx: number; fob: string; fl: string; eta: string } | null;
  onSetInlineReply: (v: { idx: number; fob: string; fl: string; eta: string } | null) => void;
  onReply: (to: string) => void;
  onReplyMsg: (idx: number, to: string, packet: string) => void;
  onRespondCpdlc: (refMsgId: string, response: string) => void;
}

export function MessageList({
  messages, allCount, searchQuery, callsign, fuelUnits,
  respondedIdx, inlineReply, onSetInlineReply, onReply, onReplyMsg, onRespondCpdlc,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allCount]);

  return (
    <div className="flex-1 overflow-auto p-4 space-y-2 min-h-0">
      {allCount === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-600 text-xs">
          No messages yet — polling every 30s
        </div>
      ) : messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-600 text-xs">
          No messages match "{searchQuery}"
        </div>
      ) : messages.map(({ m, i }) => (
        <MessageBubble
          key={i}
          msg={m}
          idx={i}
          callsign={callsign}
          fuelUnits={fuelUnits}
          responded={respondedIdx.has(i)}
          inlineReply={inlineReply?.idx === i ? inlineReply : null}
          onSetInlineReply={onSetInlineReply}
          onReply={onReply}
          onReplyMsg={onReplyMsg}
          onRespondCpdlc={onRespondCpdlc}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 3: Update `AcarsPage` to use `MessageList`**

Add import to `src/pages/Acars/index.tsx`:
```ts
import { MessageList } from './components/MessageList';
```

Remove `msgAccent`, `parsePDCMessage`, and `ACCENT` constant definitions from `index.tsx` (now in MessageBubble.tsx).

Remove the `messagesEndRef` ref and its `useEffect` from `AcarsPage`.

Replace the entire `{/* Message thread */}` section (from `<div className="flex-1 overflow-auto...">` to the closing `</div>` including `<div ref={messagesEndRef} />`) with:

```tsx
      <MessageList
        messages={filteredMessages}
        allCount={acarsMessages.length}
        searchQuery={searchQuery}
        callsign={callsign}
        fuelUnits={fuelUnits}
        respondedIdx={respondedIdx}
        inlineReply={inlineReply}
        onSetInlineReply={setInlineReply}
        onReply={(to) => { setReplyTo(to); setMode('telex'); }}
        onReplyMsg={replyToMsg}
        onRespondCpdlc={respondCpdlc}
      />
```

- [ ] **Step 4: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Acars/components/MessageBubble.tsx src/pages/Acars/components/MessageList.tsx src/pages/Acars/index.tsx
git commit -m "refactor: extract MessageBubble and MessageList components from AcarsPage"
```

---

## Task 8: ACARS — Extract `CpdlcWindow` component

**Files:**
- Create: `src/pages/Acars/components/CpdlcWindow.tsx`
- Modify: `src/pages/Acars/index.tsx`

- [ ] **Step 1: Move `CpdlcForm` to `CpdlcWindow.tsx`**

In `src/pages/Acars/index.tsx`, find the `function CpdlcForm(...)` definition. Cut the entire function (it spans from approximately line 900 to line 1044). Create `src/pages/Acars/components/CpdlcWindow.tsx` and paste it there with these additions:

```tsx
import { useEffect, useState } from 'react';
import { useEFBStore } from '../../../store/efbStore';
import { hoppiePing } from '../../../services/hoppie';
import { Radio, Loader2, Send } from 'lucide-react';
import clsx from 'clsx';

// Paste the CpdlcForm function here, renamed to CpdlcWindow

// Then add:
export { CpdlcForm as CpdlcWindow };
// OR rename the function to CpdlcWindow and export it
```

The exact content of `CpdlcForm` is in `src/pages/Acars/index.tsx` starting around line 900. The function signature is:
```ts
function CpdlcForm({ callsign, onSend }: {
  callsign: string;
  onSend: (to: string, type: string, pkt: string) => Promise<void>;
})
```

Move the entire function body to `CpdlcWindow.tsx`, rename to `CpdlcWindow`, and export it. Ensure all imports used by the function are at the top of the new file (check what `CpdlcForm` uses: `useState`, `useEffect`, `useEFBStore`, `hoppiePing`, `hoppieOnlineStations`, `Radio`, `Loader2`, `Send`, `LogIn`, `Inp`, `clsx`).

Since `Inp` is defined in `index.tsx`, either:
- Move `Inp` to a shared file `src/pages/Acars/components/Inp.tsx` and import it, or
- Duplicate the `Inp` component in `CpdlcWindow.tsx`

**Recommended:** Move `Inp` to `src/pages/Acars/components/Inp.tsx`:
```tsx
import clsx from 'clsx';

export function Inp({ value, onChange, placeholder, className = '', maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; maxLength?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      onChange={e => onChange(e.target.value.toUpperCase())}
      placeholder={placeholder}
      className={clsx(
        'bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded-lg px-3 py-2 text-xs font-mono focus:outline-none uppercase',
        className,
      )}
    />
  );
}
```

Then update `index.tsx` to import `Inp` from `./components/Inp` instead of defining it inline.

- [ ] **Step 2: Update `AcarsPage` to use `CpdlcWindow`**

Add import to `src/pages/Acars/index.tsx`:
```ts
import { CpdlcWindow } from './components/CpdlcWindow';
import { Inp } from './components/Inp';
```

Remove the `CpdlcForm` function definition and `Inp` function definition from `index.tsx`.

Replace `{mode === 'cpdlc' && (<CpdlcForm callsign={callsign} onSend={...} />)}` with:
```tsx
          {mode === 'cpdlc' && (
            <CpdlcWindow callsign={callsign} onSend={async (to, type, pkt) => { await sendMsg(to, type, pkt); }} />
          )}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Acars/components/CpdlcWindow.tsx src/pages/Acars/components/Inp.tsx src/pages/Acars/index.tsx
git commit -m "refactor: extract CpdlcWindow component and shared Inp component"
```

---

## Task 9: ACARS — Extract `TemplateManager` and remaining form components

**Files:**
- Create: `src/pages/Acars/components/TemplateManager.tsx`
- Create: `src/pages/Acars/components/TelexForm.tsx`
- Modify: `src/pages/Acars/index.tsx`

- [ ] **Step 1: Create `TemplateManager.tsx`**

Extract the template UI from `TelexForm` (the `acarsTemplates` chips and save panel) into its own component:

Create `src/pages/Acars/components/TemplateManager.tsx`:

```tsx
import { useState } from 'react';
import { useEFBStore } from '../../../store/efbStore';
import { BookmarkPlus, X } from 'lucide-react';

interface TemplateManagerProps {
  currentMessage: string;
  onSelectTemplate: (text: string) => void;
}

export function TemplateManager({ currentMessage, onSelectTemplate }: TemplateManagerProps) {
  const { acarsTemplates, addAcarsTemplate, removeAcarsTemplate } = useEFBStore();
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  function saveTemplate() {
    if (!saveName.trim() || !currentMessage.trim()) return;
    addAcarsTemplate({ name: saveName.trim(), text: currentMessage });
    setSaveName('');
    setShowSave(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <button
          onClick={() => setShowSave(s => !s)}
          title="Save as template"
          className="p-2 text-gray-500 hover:text-blue-400 border border-[var(--c-border)] hover:border-blue-500/50 rounded-lg transition-colors shrink-0"
        >
          <BookmarkPlus size={12} />
        </button>
      </div>
      {showSave && (
        <div className="flex gap-2">
          <input
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Template name…"
            className="flex-1 bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none"
          />
          <button onClick={saveTemplate} disabled={!saveName.trim() || !currentMessage.trim()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            Save
          </button>
          <button onClick={() => setShowSave(false)}
            className="px-2 py-1.5 border border-[var(--c-border)] text-gray-500 hover:text-gray-300 rounded-lg text-xs transition-colors">
            <X size={11} />
          </button>
        </div>
      )}
      {acarsTemplates.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {acarsTemplates.map(t => (
            <div key={t.id} className="flex items-center gap-0 rounded border border-[var(--c-border)] overflow-hidden">
              <button
                onClick={() => onSelectTemplate(t.text)}
                className="px-2 py-0.5 text-[10px] font-mono text-gray-400 hover:text-white hover:bg-[var(--c-border)] transition-colors"
                title={t.text}
              >
                {t.name}
              </button>
              <button
                onClick={() => removeAcarsTemplate(t.id)}
                className="px-1 py-0.5 text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Move `TelexForm` to its own file**

Create `src/pages/Acars/components/TelexForm.tsx`. Move the `TelexForm` function from `index.tsx` into this file. Update it to use `TemplateManager` instead of the inline template code:

```tsx
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, Send } from 'lucide-react';
import { Inp } from './Inp';
import { TemplateManager } from './TemplateManager';

export function TelexForm({ onSend, defaultTo = '' }: {
  onSend: (to: string, pkt: string) => Promise<void>;
  defaultTo?: string;
}) {
  const [to, setTo] = useState(defaultTo);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (defaultTo) setTo(defaultTo); }, [defaultTo]);

  async function submit() {
    if (!to || !msg) return;
    setSending(true);
    setErr('');
    try {
      await onSend(to, msg);
      setMsg('');
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Inp value={to} onChange={setTo} placeholder="TO  e.g. EDDF_APP" className="w-40 shrink-0" />
        <Inp value={msg} onChange={setMsg} placeholder="Message…" className="flex-1" />
        <button
          onClick={submit}
          disabled={sending || !to || !msg}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : ok ? <CheckCircle size={12} /> : <Send size={12} />}
          Send
        </button>
      </div>
      <TemplateManager currentMessage={msg} onSelectTemplate={setMsg} />
      {err && <p className="text-[10px] text-red-400 font-mono">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Update `index.tsx` to import form components**

Add imports:
```ts
import { TelexForm } from './components/TelexForm';
import { TemplateManager } from './components/TemplateManager';
```

Remove `TelexForm` function definition from `index.tsx`.

The other forms (`PDCForm`, `OceanicForm`, `PositionForm`, `LoadsheetForm`, `OpsForm`) can remain in `index.tsx` for now — they are already scoped below the main component and don't block further refactoring.

- [ ] **Step 4: Build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Acars/components/TemplateManager.tsx src/pages/Acars/components/TelexForm.tsx src/pages/Acars/index.tsx
git commit -m "refactor: extract TemplateManager and TelexForm components from AcarsPage"
```

---

## Task 10: ACARS — Extract `ComposeBar` and verify final state

**Files:**
- Create: `src/pages/Acars/components/ComposeBar.tsx`
- Modify: `src/pages/Acars/index.tsx`

- [ ] **Step 1: Create `ComposeBar.tsx`**

Create `src/pages/Acars/components/ComposeBar.tsx` containing the entire compose panel (mode pills + form switch), extracted from the bottom of `AcarsPage`.

The compose panel in `index.tsx` starts at `{/* Compose panel */}` (line ~1716) and runs to the end of the JSX. Move it to `ComposeBar.tsx`:

```tsx
import type { ElementType } from 'react';
import { useEFBStore } from '../../../store/efbStore';
import {
  MessageSquare, Send, Wifi, Globe, MapPin, Plane, Building2, ClipboardList, Radio,
} from 'lucide-react';
import clsx from 'clsx';
import { TelexForm } from './TelexForm';
import { CpdlcWindow } from './CpdlcWindow';
import type { HoppieMessage } from '../../../services/hoppie';
// Import all other forms directly from the parent index.tsx until they are extracted:
// PDCForm, DAtisForm, OceanicForm, PositionForm, LoadsheetForm, OpsForm

type ComposeMode = 'telex' | 'pdc' | 'datis' | 'oceanic' | 'cpdlc' | 'position' | 'ops' | 'loadsheet';

const COMPOSE_MODES: { id: ComposeMode; label: string; icon: ElementType }[] = [
  { id: 'cpdlc',      label: 'CPDLC',      icon: Radio },
  { id: 'pdc',        label: 'PDC',        icon: MessageSquare },
  { id: 'datis',      label: 'D-ATIS',     icon: Wifi },
  { id: 'loadsheet',  label: 'Loadsheet',  icon: ClipboardList },
  { id: 'position',   label: 'Position',   icon: MapPin },
  { id: 'oceanic',    label: 'Oceanic',    icon: Globe },
  { id: 'ops',        label: 'OPS',        icon: Building2 },
  { id: 'telex',      label: 'Telex',      icon: Send },
];
```

Due to the remaining forms (`PDCForm`, etc.) still living in `index.tsx`, the cleanest approach for this step is:
- Move mode pill rendering + `COMPOSE_MODES` to `ComposeBar.tsx`
- Keep the form switch in `index.tsx` as a `renderForm()` function
- Pass `renderForm` as a render-prop to `ComposeBar`

Full `ComposeBar.tsx`:

```tsx
import type { ElementType, ReactNode } from 'react';
import {
  MessageSquare, Send, Wifi, Globe, MapPin, Plane, Building2, ClipboardList, Radio,
} from 'lucide-react';
import clsx from 'clsx';

type ComposeMode = 'telex' | 'pdc' | 'datis' | 'oceanic' | 'cpdlc' | 'position' | 'ops' | 'loadsheet';
export type { ComposeMode };

export const COMPOSE_MODES: { id: ComposeMode; label: string; icon: ElementType }[] = [
  { id: 'cpdlc',      label: 'CPDLC',      icon: Radio },
  { id: 'pdc',        label: 'PDC',        icon: MessageSquare },
  { id: 'datis',      label: 'D-ATIS',     icon: Wifi },
  { id: 'loadsheet',  label: 'Loadsheet',  icon: ClipboardList },
  { id: 'position',   label: 'Position',   icon: MapPin },
  { id: 'oceanic',    label: 'Oceanic',    icon: Globe },
  { id: 'ops',        label: 'OPS',        icon: Building2 },
  { id: 'telex',      label: 'Telex',      icon: Send },
];

interface ComposeBarProps {
  mode: ComposeMode;
  onModeChange: (mode: ComposeMode) => void;
  children: ReactNode;
}

export function ComposeBar({ mode, onModeChange, children }: ComposeBarProps) {
  return (
    <div className="border-t border-[var(--c-border)] shrink-0">
      <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-[var(--c-border)] scrollbar-none">
        {COMPOSE_MODES.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => onModeChange(id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors shrink-0',
              mode === id
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-gray-200 bg-[var(--c-surface)] border border-[var(--c-border)] hover:border-[var(--c-border2)]'
            )}>
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>
      <div className="px-4 py-3">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `AcarsPage` to use `ComposeBar`**

Add import:
```ts
import { ComposeBar, type ComposeMode } from './components/ComposeBar';
```

Remove `ComposeMode` type and `COMPOSE_MODES` constant from `index.tsx`.

Replace the `{/* Compose panel */}` section with:
```tsx
      <ComposeBar mode={mode} onModeChange={setMode}>
        {mode === 'telex' && (
          <TelexForm defaultTo={replyTo ?? ''} onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); setReplyTo(null); }} />
        )}
        {mode === 'pdc' && (
          <PDCForm depIcao={depIcao} destIcao={destIcao} atcCallsign={atcCs}
            acType={acType} route={route}
            onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }} />
        )}
        {mode === 'datis' && (
          <DAtisForm airports={airports} hoppieLogon={hoppieLogon} callsign={callsign}
            onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
            onInject={(msg) => {
              addAcarsMessage(msg);
              if (hoppieLogon && callsign && msg.from) {
                hoppieSend(hoppieLogon, msg.from, callsign, msg.type, msg.packet).catch(() => {});
              }
            }} />
        )}
        {mode === 'oceanic' && (
          <OceanicForm atcCallsign={atcCs} acType={acType} destIcao={destIcao}
            cruiseFl={cruiseFl} defaultMach={defMach}
            hoppieLogon={hoppieLogon} callsign={callsign}
            onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }} />
        )}
        {mode === 'cpdlc' && (
          <CpdlcWindow callsign={callsign} onSend={async (to, type, pkt) => { await sendMsg(to, type, pkt); }} />
        )}
        {mode === 'position' && (
          <PositionForm callsign={callsign} destIcao={destIcao} cruiseFl={cruiseFl}
            onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }} />
        )}
        {mode === 'loadsheet' && (
          <LoadsheetForm callsign={callsign} depIcao={depIcao} destIcao={destIcao}
            acReg={ofp.aircraft.reg ?? ''} acType={acType} units={fuelUnits}
            estZfw={ofp.weights.est_zfw ?? ''} maxZfw={ofp.weights.max_zfw ?? ''}
            estTow={ofp.weights.est_tow ?? ''} maxTow={ofp.weights.max_tow ?? ''}
            estLdw={ofp.weights.est_ldw ?? ''} maxLdw={ofp.weights.max_ldw ?? ''}
            paxCount={ofp.weights.pax_count ?? ''} bagCount={ofp.weights.bag_count ?? ''}
            planRamp={ofp.fuel.plan_ramp ?? ''} planTakeoff={ofp.fuel.plan_takeoff ?? ''}
            onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
            onInject={(msg) => {
              addAcarsMessage(msg);
              if (hoppieLogon && callsign) {
                hoppieSend(hoppieLogon, msg.from, callsign, msg.type, msg.packet).catch(() => {});
              }
            }} />
        )}
        {mode === 'ops' && (
          <OpsForm callsign={callsign} depIcao={depIcao} destIcao={destIcao}
            acReg={ofp.aircraft.reg ?? ''} acType={acType}
            units={fuelUnits} fuelOnboard={ofp.fuel.plan_ramp ?? ''}
            onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
            onInject={(msg) => {
              addAcarsMessage(msg);
              if (hoppieLogon && callsign) {
                hoppieSend(hoppieLogon, msg.from, callsign, msg.type, msg.packet).catch(() => {});
              }
            }} />
        )}
      </ComposeBar>
```

- [ ] **Step 3: Final build check**

```bash
cd /Users/msoehl/Documents/VSCode/OpsLink && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. With an OFP loaded, verify:
1. ACARS page loads and shows messages.
2. All compose modes work (switch tabs, verify form renders).
3. CPDLC tab works (CpdlcWindow).
4. Templates save/load in Telex mode.
5. Phase messages fire when sim is connected and position changes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Acars/components/ComposeBar.tsx src/pages/Acars/index.tsx
git commit -m "refactor: extract ComposeBar, complete ACARS component split"
```

---

## Final: Stop visual companion server

```bash
/Users/msoehl/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.6/skills/brainstorming/scripts/stop-server.sh /Users/msoehl/Documents/VSCode/OpsLink/.superpowers/brainstorm/5229-1774692211
```

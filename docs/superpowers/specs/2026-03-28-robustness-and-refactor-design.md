# OpsLink — Robustness & Refactor Design

**Date:** 2026-03-28
**Scope:** 5 independent improvements across services, state, and UI

---

## 1. VatGlasses-Fetch absichern

### Problem
`fetchControllerSectors` in `src/services/livetraffic/vatglasses.ts` macht mehrere Fetch-Aufrufe (VatSpy GeoJSON, GitHub API für TRACON-Polygone) ohne Timeout. Bei GitHub-Ratelimiting (HTTP 403/429) schlägt der Fetch still fehl — der Aufrufer sieht nur leere Polygone ohne Erklärung.

### Design
- Jeden `fetch`-Aufruf in `vatglasses.ts` mit einem `AbortController` + 10-Sekunden-Timeout wrappen.
- GitHub-Antworten mit Status 403 oder 429 werfen einen eigenen `RateLimitError` (extends `Error`), der als `cause` den HTTP-Status trägt.
- `fetchControllerSectors` fängt diesen Fehler und wirft ihn weiter (nicht schlucken).
- Aufrufer in `Map/index.tsx` (`loadAtc`): bei `RateLimitError` wird ein nicht-blockierender Warnhinweis in der Statusleiste gesetzt (lokaler `useState`: `sectorError: string | null` — kein Store-State). Die ATC-Marker werden trotzdem angezeigt, nur ohne Sektorpolygone.

### Interfaces
```ts
// vatglasses.ts
export class RateLimitError extends Error {
  constructor(public status: number) {
    super(`GitHub API rate limited (HTTP ${status})`);
  }
}
```

### Error-Handling-Verhalten
| Fehlertyp | Verhalten |
|---|---|
| Timeout (10s) | Polygone = leer, kein Warnhinweis (transienter Fehler) |
| RateLimitError | Warnhinweis in Statusleiste, Polygone = leer |
| Sonstige Netzwerkfehler | Silent fail wie bisher |

---

## 2. Hoppie Rate Limiting

### Problem
`hoppiePoll()` in `src/services/hoppie.ts` hat keinen internen Schutz gegen zu schnelle Aufrufe. Wenn das Polling-Intervall versehentlich sehr klein gesetzt wird, könnte der Hoppie-Server gespammt werden.

### Design
- `hoppie.ts` bekommt eine modulare Variable `let _lastPollAt = 0`.
- Vor jedem Poll-Request: wenn `Date.now() - _lastPollAt < 10_000`, Aufruf sofort mit leerem Array beenden (kein Netzwerkrequest, kein Error).
- `_lastPollAt` wird nur bei erfolgreichem oder fehlgeschlagenem Request gesetzt (nicht beim vorzeitigen Skip).
- Kein Store-State, kein UI-Feedback — rein intern.

---

## 3. ATIS-Netzwerk deduplizieren

### Problem
`atisNetwork` ist korrekt im Zustand-Store (`useEFBStore`) als Single Source of Truth definiert. `RouteMap` erhält `atisNetwork` aber als Prop von `Map/index.tsx`, was eine unnötige Durchleitung ist und bei künftigen Änderungen zu Inkonsistenz führen kann.

### Design
- `RouteMap` liest `atisNetwork` direkt aus dem Store via `useEFBStore(s => s.atisNetwork)`.
- Die `atisNetwork`-Prop in `RouteMap`'s Props-Interface entfällt.
- `Map/index.tsx` übergibt diese Prop nicht mehr.
- Keine sonstigen Änderungen am Store oder an den Werten.

---

## 4. ACARS-Komponente aufteilen

### Problem
`src/pages/Acars/index.tsx` ist ~1800 Zeilen lang und enthält UI-Rendering, Polling-Logik, CPDLC-State, Reply-Handling und Template-Verwaltung in einer einzigen Datei. Das macht Änderungen fehleranfällig und schwer zu navigieren.

### Neue Dateistruktur

```
src/pages/Acars/
  index.tsx                  — Orchestrator: verdrahtet Hooks, rendert Layout (~100 Zeilen)
  hooks/
    useCpdlc.ts              — CPDLC State: Logon/Logoff, pending Logon, eingehende CPDLC-Messages
    useMessageActions.ts     — reply handlers (ACPT, WILCO, FOB-Form etc.), injectOps, send
  components/
    MessageList.tsx          — scrollbare, gefilterte Nachrichtenliste
    MessageBubble.tsx        — einzelne Nachricht inkl. Reply-Buttons
    CpdlcWindow.tsx          — CPDLC-Panel (Verbindungsstatus + Nachrichtenlog)
    TemplateManager.tsx      — Templates anlegen, bearbeiten, löschen
    ComposeBar.tsx           — Freitexteingabe + Senden-Button
```

### Grundprinzipien
- **Kein Store-Umbau.** Alle Werte kommen weiterhin aus `useEFBStore`.
- **Kein Verhaltens-Refactor.** Nur Datei-/Modul-Grenzen werden neu gezogen.
- Der bestehende `useAcarsPolling`-Hook in `src/hooks/` bleibt unverändert.
- `index.tsx` ist nach dem Refactor primär ein Compose-Root: Hooks aufrufen, State zusammenführen, Layout rendern.

### Hook-Verantwortlichkeiten
| Hook | Verantwortlich für |
|---|---|
| `useCpdlc` | `cpdlcLogon`, `pendingCpdlcLogon`, eingehende CPDLC-Nachrichten parsen/klassifizieren |
| `useMessageActions` | `injectOps`, `handleReply`, `sendFreetext`, `sendTemplate` |

---

## 5. Karte: Toolbar + Center-Button

### Problem
- `FitBounds` springt die Karte bei jedem Render (z.B. Sim-Position-Update) auf die Routenbounds zurück — man kann nicht frei navigieren.
- Es gibt keinen manuellen Center-Button um zurückzuspringen.

### FitBounds-Verhalten
- `FitBounds` bekommt ein `firedRef = useRef(false)`.
- Beim ersten Mount wird `fitBounds` einmalig ausgelöst und `firedRef.current = true` gesetzt. Danach keine automatischen Bounds-Updates mehr.
- Wenn Origin oder Destination des OFP wechselt (Prop `routeKey: string` = `"${originIcao}-${destIcao}"`), wird `firedRef.current = false` zurückgesetzt → einmaliges Re-Fit für die neue Route.

### Center-Button
- `MapPage` hält `mapRef = useRef<L.Map | null>(null)`.
- `RouteMap` bekommt eine neue Prop `onMapReady: (map: L.Map) => void`, die beim Leaflet `whenReady`-Event gefeuert wird.
- Center-Button in der Toolbar: `mapRef.current?.fitBounds(routeBounds, { padding: [40, 40] })`.
- Button ist immer sichtbar (links von Trail/ATC/Traffic-Buttons), keine Conditional-Rendering-Logik.

### Toolbar-Layout (Option A — flat)
```
[Globe] EDDF → EDDM  313 NM · 47 fixes   |   ● 12 acft · 14:22Z  |  [⊕ Center]  [🗑]  [Trail]  [ATC]  [VATSIM Live]
```

---

## Keine Änderungen an
- Store-Struktur (`efbStore.ts`) — `sectorError` ist lokaler Component-State, kein Store-Eintrag
- Hoppie-Store-State oder UI
- Logbuch, Dashboard, FlightPlan, Weather-Seiten
- Build-Konfiguration

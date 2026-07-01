# Design: v0.7.1-ui-dropdown

> Begleitend zu `proposal.md` und `tasks.md`. Diese Datei ist die technische Quelle der Wahrheit für die nicht-trivialen Entscheidungen in diesem Change: visuelle Layout-Mockups, der genaue `formatDescription()`-Algorithmus, das Time-Picker-Decision-Rationale, das localStorage-Key-Schema und die data-testid-Vertragsoberfläche. Behandle sie als `sdd-verify`-Checkliste.

---

## 1. Visueller Layout-Mockup

### 1.1 Schedule-Modal — Gesamtansicht (Preset: „Daily")

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Schedule                                              ↻ Reset              │
│ Timezone: Europe/Berlin                                                       │
│                                                                                │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐                   │
│ │ 🕐             │ │ ⌛             │ │ 📅             │  <- Active (Daily)  │
│ │ Every minute   │ │ Hourly         │ │ Daily          │   border-primary   │
│ │ Runs every N   │ │ Minute of every│ │ Once per day at│   bg-primary/10    │
│ │ minutes        │ │ Nth hour       │ │ a specific time│   shadow-md        │
│ └────────────────┘ └────────────────┘ └────────────────┘                   │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐                   │
│ │ 📆             │ │ 📅             │ │ </>            │                   │
│ │ Weekly         │ │ Monthly        │ │ Custom         │                   │
│ │ Selected week- │ │ A specific day │ │ Raw 5-field    │                   │
│ │ days at a time │ │ -of-month      │ │ cron expression│                   │
│ └────────────────┘ └────────────────┘ └────────────────┘                   │
│                                                                                │
│ Fires at 09:00 every day                       <- formatDescription inline  │
│                                                                                │
│ ▶ Schedule details                                       <- <details> closed │
│ ┌────────────────────────────────────────────────────────────────────────┐   │
│ │                                                                        │   │
│ │   At     ┌──────┐  24-hour clock                                        │   │
│ │          │ 09:00│                                                        │   │
│ │          └──────┘                                                        │   │
│ │                                                                        │   │
│ └────────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
│ PREVIEW  Every day at 09:00                  <- api.cron.describe (kept)     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────┐│
│ │ Tue, 1 Jul   │ │ Wed, 2 Jul   │ │ Thu, 3 Jul   │ │ Fri, 4 Jul   │ │ ... ││
│ │ 09:00        │ │ 09:00        │ │ 09:00        │ │ 09:00        │ │     ││
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └─────┘│
│                                                                                │
│                                              [ Cancel ]  [ Save schedule ]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Schedule-Modal — Detail offen (Preset: „Weekly")

```
... (Cards oben unverändert) ...

Fires at 09:00 on weekdays

▼ Schedule details
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   At  ┌──────┐  24-hour clock                                          │
│       │09:00 │                                                          │
│       └──────┘                                                          │
│                                                                        │
│   Active weekdays:   [Mo] [Tu] [We] [Th] [Fr]                         │
│   Tap a date in the calendar below to toggle its weekday              │
│   ┌────────────────────────────────────────────────────────────────┐  │
│   │   Mon  Tue  Wed  Thu  Fri  Sat  Sun                            │  │
│   │     1    2    3    4    5    6    7                            │  │
│   │     8    9   10   11   12   13   14                            │  │
│   │   ...                                                         │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

... (Preview + Footer unverändert) ...
```

### 1.3 Schedule-Modal — Detail offen (Preset: „Monthly")

```
... (Cards oben unverändert) ...

Fires at 09:00 on day 15 of every month

▼ Schedule details
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   At  ┌──────┐  24-hour clock                                          │
│       │09:00 │                                                          │
│       └──────┘                                                          │
│                                                                        │
│   Active day-of-month:   ┌────┐                                         │
│                           │ 15 │   <- 48x48 px tile                     │
│                           └────┘      bg-primary text-primary-content   │
│   Pick a date — its day-of-month is the trigger                        │
│   ┌────────────────────────────────────────────────────────────────┐  │
│   │   Mon  Tue  Wed  Thu  Fri  Sat  Sun                            │  │
│   │     1    2    3    4    5    6    7                            │  │
│   │    ...   ... ... ... [15]  ...  ...                            │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Schedule-Modal — Detail offen (Preset: „Hourly")

```
... (Cards oben unverändert) ...

Fires at minute 30 of every 2 hours

▼ Schedule details
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   At  ┌──────┐  24-hour clock                                          │
│       │09:30 │                                                          │
│       └──────┘                                                          │
│                                                                        │
│   Every  ┌────────┐                                                     │
│          │ 2 hours│                                                     │
│          └────────┘                                                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.5 Layout-Specs (DaisyUI 5 + Tailwind 4)

| Element | Class | data-testid |
|---|---|---|
| Modal-Box | `modal-box max-w-3xl bg-base-200 border border-base-300/60` | — |
| Reset-Button | `btn btn-outline btn-sm gap-1` | — |
| Preset-Grid | `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4` | `preset-grid` |
| Preset-Card (active) | `border-primary bg-primary/10 shadow-md` | `preset-card`, `data-active="true"` |
| Preset-Card (inactive) | `border-base-300/40 bg-base-100/40 hover:bg-base-100/60 hover:border-base-300/60` | `preset-card`, `data-active="false"` |
| Preset-Card-Icon-Box (active) | `bg-primary/20 text-primary` | (inside card) |
| Preset-Card-Icon-Box (inactive) | `bg-base-300/40 text-base-content/70` | (inside card) |
| Inline-Beschreibung | `mb-3 px-4 py-2 rounded-md bg-base-100/40 border border-base-300/30 text-sm` | `cron-description` |
| `<details>`-Wrapper | `bg-base-100/40 border border-base-300/40 rounded-box mb-3` | `preset-details` |
| `<details>`-Summary | `cursor-pointer select-none px-4 py-2 text-xs uppercase text-base-content/60` | — |
| Time-Picker | `input input-bordered input-lg bg-base-100/60 font-mono w-40` | `time-picker` |
| Intervall-Picker | `select select-bordered select-md bg-base-100/60` | `interval-picker` |
| Weekday-Chip-Row | (Flex-Row) | `weekday-summary` |
| Weekday-Chip (active) | `badge badge-primary badge-md font-mono` | — |
| Day-of-Month-Tile | `w-12 h-12 rounded-xl bg-primary text-primary-content font-bold text-2xl font-mono shadow-md` | `day-of-month-tile` |
| Custom-Cron-Input | `input input-bordered input-md w-full bg-base-100/60 font-mono` | `custom-cron-input` |
| Preview-Tile-Container | `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3` | `preview-tiles` |
| Preview-Tile | `flex flex-col gap-1 px-3 py-3 rounded-box bg-base-100/60 border border-base-300/40` | `preview-tile` |
| Weekend-Indicator | `badge badge-warning badge-xs` | `weekend-indicator` |

---

## 2. Pure-Function-Spec für `formatDescription(state)`

### 2.1 Algorithmus

```ts
import type { CronExpressionState } from "@cronboard/core/scheduler/cronExpr.js";

const WEEKDAY_NAMES_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function timeString(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const set = new Set(sorted);
  // Special cases (D13)
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "weekends";
  if (sorted.length === 0) return "every day";
  return sorted.map((d) => WEEKDAY_NAMES_LONG[d]).join(", ");
}

export function formatDescription(state: CronExpressionState): string {
  const t = timeString(state.hour, state.minute);
  switch (state.kind) {
    case "minute":
      return state.minuteInterval === 1
        ? "Every minute"
        : `Every ${state.minuteInterval} minutes`;
    case "hour":
      return `Fires at minute ${state.minute} of every ${state.hourInterval === 1 ? "hour" : `${state.hourInterval} hours`}`;
    case "day":
      return `Fires at ${t} every day`;
    case "week":
      return `Fires at ${t} on ${describeDays(state.days)}`;
    case "month":
      return `Fires at ${t} on day ${state.dayOfMonth} of every month`;
    case "custom": {
      const trimmed = state.custom.trim();
      if (!trimmed) return "Custom: (empty)";
      return `Custom: ${trimmed}`;
    }
  }
}
```

### 2.2 Vollständige Beispiele (alle 6 Kinds × mehrere Varianten)

| `kind` | State | Output |
|---|---|---|
| `minute` | `{ minuteInterval: 1 }` | `"Every minute"` |
| `minute` | `{ minuteInterval: 5 }` | `"Every 5 minutes"` |
| `minute` | `{ minuteInterval: 30 }` | `"Every 30 minutes"` |
| `hour` | `{ minute: 0, hourInterval: 1 }` | `"Fires at minute 0 of every hour"` |
| `hour` | `{ minute: 30, hourInterval: 2 }` | `"Fires at minute 30 of every 2 hours"` |
| `hour` | `{ minute: 15, hourInterval: 4 }` | `"Fires at minute 15 of every 4 hours"` |
| `day` | `{ hour: 0, minute: 0 }` | `"Fires at 00:00 every day"` |
| `day` | `{ hour: 9, minute: 0 }` | `"Fires at 09:00 every day"` |
| `day` | `{ hour: 17, minute: 30 }` | `"Fires at 17:30 every day"` |
| `week` | `{ hour: 9, minute: 0, days: [1,2,3,4,5] }` | `"Fires at 09:00 on weekdays"` |
| `week` | `{ hour: 10, minute: 30, days: [0,6] }` | `"Fires at 10:30 on weekends"` |
| `week` | `{ hour: 14, minute: 15, days: [1,3,5] }` | `"Fires at 14:15 on Mon, Wed, Fri"` |
| `week` | `{ hour: 9, minute: 0, days: [] }` | `"Fires at 09:00 every day"` (Fallback) |
| `month` | `{ dayOfMonth: 1, hour: 8, minute: 30 }` | `"Fires at 08:30 on day 1 of every month"` |
| `month` | `{ dayOfMonth: 15, hour: 9, minute: 0 }` | `"Fires at 09:00 on day 15 of every month"` |
| `month` | `{ dayOfMonth: 31, hour: 23, minute: 59 }` | `"Fires at 23:59 on day 31 of every month"` |
| `custom` | `{ custom: "*/5 * * * *" }` | `"Custom: */5 * * * *"` |
| `custom` | `{ custom: "0 9 * * 1-5" }` | `"Custom: 0 9 * * 1-5"` |
| `custom` | `{ custom: "" }` | `"Custom: (empty)"` |

### 2.3 Edge-Cases

- **`days.length === 0` bei `week`-Kind**: `describeDays` returnt `"every day"`; Output ist `"Fires at HH:MM every day"` (siehe Test `week` empty).
- **`minuteInterval === 1`**: Sonderfall-Singular, Output `"Every minute"` (siehe Test `minute` singular).
- **`hourInterval === 1`**: Sonderfall-Singular, Output `"... of every hour"` (siehe Test `hour` singular).
- **`hour: 0` und `minute: 0`**: `pad2(0)` → `"00"`, Output `"Fires at 00:00 every day"` (siehe Test `day` midnight).
- **`dayOfMonth > 28` in Februar**: wir behandeln das nicht — `formatDescription` zeigt einfach den Tag, der User sieht die Vorschau unten und erkennt, dass Februar-Runs am 28./29. enden.
- **`custom: "  "` (nur Whitespace)**: `state.custom.trim()` → `""`, Output `"Custom: (empty)"`.
- **`custom: "*/5 * * * *"`**: wird unverändert zurückgegeben (kein Sanitization).

### 2.4 Bewusste Entscheidung — divergierende Beschreibungen (R9)

Die **inline**-Beschreibung (lokal, instant) ist nicht identisch mit der **Preview-Badge**-Beschreibung (Server-side `cronstrue`). Beispiele:

| Zustand | Lokal (`formatDescription`) | Server (`cronstrue`) |
|---|---|---|
| `*/5 * * * *` | (custom) `"Custom: */5 * * * *"` | `"Every 5 minutes"` |
| `30 */2 * * *` | (hour) `"Fires at minute 30 of every 2 hours"` | `"Every 2 hours"` |
| `0 9 * * 1-5` | (week) `"Fires at 09:00 on weekdays"` | `"At 09:00 AM, Monday through Friday"` |

**Begründung**: die inline-Beschreibung ist **deterministisch** (immer dieselbe Eingabe → dieselbe Ausgabe) und nutzt die `kind`-Information, die der User gerade ausgewählt hat. Die Preview-Badge kommt vom Server, der die Cron-Syntax mit `cronstrue` parst. Die zwei Repräsentationen sind **konsistent genug**, dass der User die Bedeutung versteht. Eine Vereinheitlichung würde entweder die lokale Funktion komplexer machen (mit `cronstrue`-Port) oder einen API-Roundtrip für jeden State-Change bedeuten. Wir akzeptieren die Divergenz.

---

## 3. Time-Picker-Entscheidung (D1)

### 3.1 Drei Optionen aus dem Briefing

| Option | Vorteile | Nachteile | Entscheidung |
|---|---|---|---|
| **A: Custom 2-Segment-Stepper** (`−` / Wert / `+` pro Hour und Minute) | Volle UI-Kontrolle, konsistentes UX, ARIA-Live-Updates für Screenreader, 60×60 px Tap-Targets | ~80 Zeilen Code, eigene State-Maschine, manuelle Validation, kein nativer Mobile-Keyboard-Support | ✗ verworfen |
| **B: 12/24h Clock-Face Visual** (Kreis mit Stunden/Minuten) | Sehr „designed", visuell ansprechend | ~200 Zeilen Code, komplexe Geometrie, Mobile-Probleme (Drag), Accessibility schwierig | ✗ verworfen |
| **C: Native `<input type="time">`** | Built-in, Accessibility out-of-the-box, Mobile-Keyboard-Free, kein Code, DaisyUI-stylbar | Browser-Picker-UI variiert OS-spezifisch (akzeptabel) | ✓ **gewählt** |

### 3.2 Implementierung

```tsx
<input
  id={`time-${draft.kind}`}
  data-testid="time-picker"
  type="time"
  lang="en-GB"          // Erzwingt 24h-Format in den meisten Browsern
  step={60}             // 60-Sekunden-Schritt, kein Sekunden-Feld
  className="input input-bordered input-lg bg-base-100/60 font-mono w-40"
  value={`${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`}
  onChange={(e) => {
    const [h, m] = e.target.value.split(":").map((x) => parseInt(x, 10));
    if (!isNaN(h) && !isNaN(m)) {
      setDraft((cur) => ({ ...cur, hour: h, minute: m }));
    }
  }}
/>
```

### 3.3 Browser-Verhalten (R2, R4, R10)

| Browser | Picker-UI | 24h? | Accessibility |
|---|---|---|---|
| Chrome 120+ | Native Dropdown (Spinner) | Erzwingbar via `lang="en-GB"` | Keyboard, Screenreader ✓ |
| Firefox 120+ | Native Scroll-Wheel | Erzwingbar via `lang="en-GB"` | Keyboard, Screenreader ✓ |
| Safari 17+ | Native Wheel-Popover | OS-Locale-abhängig (kann 12h sein) | Keyboard, Screenreader ✓ |
| Edge 120+ | Wie Chrome | Wie Chrome | Wie Chrome |

**Akzeptierte Variation**: Safari auf `de-DE`-System kann 12h anzeigen, obwohl `lang="en-GB"` gesetzt ist. Das ist ein Browser-Bug, nicht unser Bug. Test S7 prüft nur das `type="time"`-Attribut, nicht das Popup-Format.

### 3.4 `step={60}` Begründung

- **Default**: `step={60}` (60 Sekunden). Versteckt das Sekunden-Feld im nativen Picker.
- **Cronboard ist 5-Feld**: Cron-Syntax hat keine Sekunden. `step=60` matched das mentale Modell.
- **Alternative**: `step={1}` würde Sekunden-Spinner zeigen, was den User verwirrt (erwartet 60 Sekunden-Schritt).

---

## 4. localStorage-Key-Schema (D5)

### 4.1 Schema

```
localStorage["cb-details-opened-${kind}"]
```

Wobei `kind` einen der 6 Werte aus `CronKind` annimmt: `minute`, `hour`, `day`, `week`, `month`, `custom`.

### 4.2 Werte

| Wert | Bedeutung |
|---|---|
| **nicht gesetzt** (Key existiert nicht) | User hat das `<details>` für diesen Kind noch nie zugeklappt → `defaultOpen = true` |
| **`"1"`** | User hat das `<details>` mindestens einmal zugeklappt → `defaultOpen = false` |
| **`"0"`** | (nicht verwendet) |

### 4.3 Lebenszyklus

```
┌──────────────────────────┐
│ Modal wird zum ersten    │
│ Mal geöffnet             │
├──────────────────────────┤
│ readDetailsOpened(kind): │
│   key existiert nicht    │
│   → return false         │
│                          │
│ detailsOpenedByKind[kind]│
│   = !false               │
│   = true                 │
│                          │
│ <details open={true}>    │
└──────────────────────────┘
            │
            ▼ (User klappt zu)
┌──────────────────────────┐
│ toggleDetails(kind):     │
│   next = false           │
│   writeDetailsOpened:    │
│     localStorage.setItem │
│       ("cb-details-      │
│        opened-week", "1")│
│                          │
│ detailsOpenedByKind[kind]│
│   = false                │
│                          │
│ <details open={false}>   │
└──────────────────────────┘
            │
            ▼ (User klappt wieder auf)
┌──────────────────────────┐
│ toggleDetails(kind):     │
│   next = true            │
│   writeDetailsOpened:    │
│     localStorage.remove  │
│       Item(key)          │
│                          │
│ detailsOpenedByKind[kind]│
│   = true                 │
│                          │
│ <details open={true}>    │
└──────────────────────────┘
```

**Vereinfachung**: `setItem(key, "1")` beim Zuklappen, `removeItem(key)` beim Aufklappen. Damit ist der **Key** das Signal (gesetzt → war mal zu), nicht der Wert.

### 4.4 Privacy-Implikation (R3)

- **Was gespeichert wird**: 6 mögliche Boolean-Keys (`cb-details-opened-minute`, `cb-details-opened-hour`, …).
- **Was NICHT gespeichert wird**: keine Cron-Strings, keine User-Identifikation, keine PII, keine Telemetrie.
- **Fingerprinting-Risiko**: minimal — die Keys zeigen nur, **welche Preset-Typen** der User schon mal verwendet hat. Ein Fingerprinting-Skript würde dieselben Keys aus einem leeren localStorage ableiten können.
- **Mitigation**: try/catch um alle localStorage-Calls (private mode, quota exceeded). Keine Daten landen auf dem Server.
- **Opt-out**: kein UI-Toggle in v0.7.1; der User kann die Keys in DevTools löschen.

### 4.5 Reset-Verhalten

Der „Reset"-Button setzt den `CronExpressionState` zurück, aber **nicht** die localStorage-Keys. Das ist gewollt: ein Reset bedeutet „setze die Cron-Konfiguration zurück", nicht „vergiss meine UI-Präferenzen".

---

## 5. Iconographie

### 5.1 Preset-Cards (Briefing: Clock / Hourglass / Calendar / CalendarDays / CalendarRange / Code)

| Preset | `@radix-ui/react-icons` | Visuelle Bedeutung |
|---|---|---|
| `minute` | `ClockIcon` (Kreis mit Zeigern) | „Clock" — Zeit-basiert |
| `hour` | `HourglassIcon` (Sanduhr) | „Hour" — längere Intervalle |
| `day` | `CalendarIcon` (Kalender mit einem Tag) | „Daily" — einmal pro Tag |
| `week` | `CalendarDaysIcon` (Kalender mit mehreren Tagen) | „Weekly" — mehrmals pro Woche |
| `month` | `CalendarRangeIcon` (Kalender mit Range) | „Monthly" — einmal pro Monat |
| `custom` | `CodeIcon` (`</>`) | „Custom" — rohe Cron-Syntax |

### 5.2 Reset-Button

`ResetIcon` (kreisförmiger Pfeil) — semantisch „Reset", nicht „Refresh".

### 5.3 Active-Highlight-Farben (DaisyUI 5 / Gruvbox-Theme)

- **Active Card Border**: `border-primary` (Gruvbox soft-green-blue).
- **Active Card Background**: `bg-primary/10` (10% opacity primary tint).
- **Active Card Icon-Box**: `bg-primary/20 text-primary` (20% opacity).
- **Inactive Card Border**: `border-base-300/40`.
- **Inactive Card Background**: `bg-base-100/40 hover:bg-base-100/60`.
- **Inactive Card Icon-Box**: `bg-base-300/40 text-base-content/70`.

---

## 6. data-testid-Vertragsoberfläche

Dies ist die **kanonische Liste** aller `data-testid`-Hooks, die in v0.7.1 gepflegt werden. Reviewer können sie für visuelle Smoke-Tests / Snapshot-Diffs nutzen.

| Hook | Element | Anzahl pro Render |
|---|---|---|
| `preset-grid` | Grid-Container | 1 im Modal |
| `preset-card` | Eine Preset-Card | 6 im Grid |
| `cron-description` | Inline-Beschreibung | 1 im Modal |
| `preset-details` | `<details>`-Wrapper | 1 im Modal |
| `time-picker` | `<input type="time">` | 1 (nur bei day/week/month/hour) |
| `interval-picker` | Intervall-`<select>` | 1 (nur bei minute/hour) |
| `weekday-summary` | Weekday-Chip-Row | 1 (nur bei week) |
| `day-of-month-tile` | Day-of-Month-Tile | 1 (nur bei month) |
| `custom-cron-input` | Custom-`<input>` | 1 (nur bei custom) |
| `preview-tiles` | Preview-Grid-Container | 1 im Modal |
| `preview-tile` | Ein Preview-Tile | 5 max |
| `weekend-indicator` | Wochenend-Badge | 0–5 pro Render |

**Zusätzliche data-Attribute** (semantisch):
- `data-kind="minute|hour|day|week|month|custom"` auf jeder `preset-card`.
- `data-active="true|false"` auf jeder `preset-card`.

**Reviewer-Blick**: alle 12 Hooks müssen in der gerenderten HTML vorhanden sein, wenn die jeweilige Komponente gerendert wird. S1–S6 sind gegen diese Hooks formuliert.

---

## 7. Acceptance-Criteria → Test-Mapping

| S# | Criterion | Wo geprüft |
|---|---|---|
| S1 | Preset-Cards im Grid mit Icon + Label + Hint | `preset-grid` + 6× `preset-card` + DOM-Assertion auf Hint-Text |
| S2 | Aktive Card visuell abgehoben | `data-active="true"` vs. `data-active="false"` computed-style-diff |
| S3 | Time-Picker = `<input type="time">` (kein `<select>`) | `data-testid="time-picker"` + kein `<select name="hour\|minute">` im Tree |
| S4 | Intervall-Picker ist größer als `select-sm` | `data-testid="interval-picker"` + computed height ≥ 36 px |
| S5 | Preview = 5 Tiles mit Datum oben + Zeit unten | `data-testid="preview-tile"` 5× + Text-Pattern-Match |
| S6 | Inline-Beschreibung (`formatDescription`) zeigt Klartext | `data-testid="cron-description"` + Text-Pattern + `cronDescription.test.ts` |
| S7 | typecheck + test:web + test grün | `npm run typecheck && npm run test:web && npm test` |
| S8 | Keine neuen Deps + Bundle ≤ 4 kB | Lockfile-Diff + Build-Output |

**Total Tests (T1+T2)**: 14 neue (`cronDescription.test.ts`). Plus 58 bestehende aus v0.7.0 = **72 total**.

---

## 8. State-Management-Übersicht

```
┌──────────────────────────────────────────────────────────────────────────┐
│ CronBuilder (packages/web/src/components/CronBuilder.tsx)                │
│                                                                          │
│  useState:                                                                │
│    open: boolean                                            (modal-vis)   │
│    draft: CronExpressionState                               (form-data)  │
│    detailsOpenedByKind: Record<Kind, boolean>   (NEU, <details>-open)   │
│                                                                          │
│  useEffect:                                                              │
│    [value] → re-parse cron into draft                                    │
│    [] → none (modal cleanup handled by DaisyUI)                           │
│                                                                          │
│  Helpers (pure, in lib/):                                                │
│    formatDescription(state)                                  (NEU, helper)│
│    buildCron, parseCron, defaultCronState (from cronExpr.ts)             │
│                                                                          │
│  localStorage (browser):                                                  │
│    cb-details-opened-${kind}  →  "1" if details was collapsed (NEU)      │
│                                                                          │
│  Sub-Components:                                                          │
│    Preview ({ cron, timezone }) → 5 Tiles mit Wochenend-Indikator (NEU)  │
│                                                                          │
│  PRESETS: 6 Cards (Icon + Label + Hint), click → updates draft.kind      │
└──────────────────────────────────────────────────────────────────────────┘
```

`CronBuilder` hält **keinen** zusätzlichen State außer den drei `useState`. Die `<details>`-Persistenz ist die einzige UX-Erweiterung gegenüber v0.7.0.

---

## 9. Reviewer-Checkliste (für `sdd-verify`)

### 9.1 Acceptance Criteria

- [ ] **S1**: `data-testid="preset-grid"` mit 6× `data-testid="preset-card"`. Jede Card hat Icon + Label + Hint-Text (≠ leer).
- [ ] **S2**: Genau eine Card hat `data-active="true"`, fünf haben `data-active="false"`. Active-Card hat `border-primary` (computed).
- [ ] **S3**: Genau ein `<input type="time">` mit `data-testid="time-picker"`. Keine `<select>`-Dropdowns für Hour/Minute mehr im Modal-Tree.
- [ ] **S4**: Bei `kind === "minute"` oder `"hour"` rendert ein `data-testid="interval-picker"` mit Klasse `select-md` (kein `select-sm`).
- [ ] **S5**: Bei nicht-leerem Preview 5 `data-testid="preview-tile"`. Erste Zeile hat `text-base font-semibold`, zweite Zeile `font-mono`.
- [ ] **S6**: `data-testid="cron-description"` enthält Text matching `formatDescription`-Test-Pattern.
- [ ] **S7**: `npm run typecheck`, `npm run test:web`, `npm test` alle grün.
- [ ] **S8**: Keine neuen Deps; Bundle-Diff ≤ 4 kB gzip.

### 9.2 Code-Qualität

- [ ] **Keine `any`-Cast-Erweiterungen** außer den bestehenden.
- [ ] **`useState`-lazy-init** für `detailsOpenedByKind` (vermeidet Re-Render-Loop).
- [ ] **Pure-Function-Disziplin**: `formatDescription` hat keine Side-Effects.
- [ ] **LocalStorage try/catch**: alle localStorage-Calls sind defensive (R3).
- [ ] **Stable Keys**: `key={p.id}` in `PRESETS.map`.
- [ ] **ARIA-Labels**: Reset-Button hat `title`; Time-Picker hat `<label htmlFor>`; Day-of-Month-Tile hat `aria-label`.

### 9.3 UX

- [ ] **Visuelle Konsistenz**: Tint-Farben passen zur bestehenden Gruvbox-DaisyUI-Theme.
- [ ] **Responsive Layout**: Preset-Grid ist auf Mobile (`< sm`) einspaltig.
- [ ] **Tastatur-Navigation**: alle interaktiven Elemente sind via Tab erreichbar.
- [ ] **Fokus-Ring**: Standard-DaisyUI-Fokus-Ring auf allen interaktiven Elementen.

### 9.4 Build / Smoke

- [ ] **`npm run typecheck`**: exit 0.
- [ ] **`npm run test:web`**: exit 0; ≥ 72 Tests, 0 Failures.
- [ ] **`npm test`**: exit 0; unverändert (Core-Suite).
- [ ] **`npm run build`**: exit 0; Bundle-Plus ≤ 4 kB gzip.
- [ ] **`scripts/smoke.ps1`**: exit 0; alle Endpoints antworten.
- [ ] **Lockfile-Diff**: keine Änderung (keine neuen Deps).
- [ ] **`git diff packages/*/src/`**: nur die in T6 `git add`-eten Dateien.

### 9.5 Doku

- [ ] **`README.md`**: Status-Line aktualisiert; Feature-Bullet hinzugefügt.
- [ ] **`CHANGELOG.md`**: `[0.7.1]`-Sektion hinzugefügt.
- [ ] **`openspec/config.yaml`**: `project.version: 0.7.1`.
- [ ] **`package.json` (root + beide packages)**: Version `0.7.1`.
- [ ] **`packages/core/src/cli.ts`**: `.version("0.7.1")`.
- [ ] **`packages/core/src/server.ts`**: `/api/health` antwortet mit `"version": "0.7.1"`.

### 9.6 Git / Commit

- [ ] **Einziger Commit**: ja (T6).
- [ ] **Subject**: `feat(v0.7.1): ui-dropdown - preset cards, native time picker, inline description, preview tiles`.
- [ ] **`git diff master@{1} master --stat`**: zeigt nur die in T6 `git add`-eten Pfade.

---

## 10. Glossar

- **Schedule-Modal:** das DaisyUI-Modal in `CronBuilder.tsx`, das nach Klick auf den Trigger-Button im JobEditor erscheint.
- **Preset:** einer der 6 vordefinierten Cron-Typen (`minute`, `hour`, `day`, `week`, `month`, `custom`).
- **Preset-Card:** die v0.7.1-Kachel im Grid (Icon + Label + Hint + Active-Highlight). Ersetzt den v0.7.0-`btn-sm`-Chip.
- **`<details>`-Persistenz:** Heuristik, dass das Browser-native `<details>`-Element seinen `open`-State pro `kind` in localStorage behält.
- **`formatDescription(state)`:** neue Pure-Function in `packages/web/src/lib/cronDescription.ts`. Nimmt `CronExpressionState` entgegen, gibt einen englischen Klartext-Satz zurück.
- **Native Time-Picker:** `<input type="time">` (HTML5). Browser-spezifisches UI; Accessibility out-of-the-box.
- **Skill resolution:** Status-Reporting dieses Sub-Agents an den Parent. `none` = keine Skill-Pfade vom Parent injiziert, keine `.atl/skill-registry.md` im Repo, kein Fallback-Loading versucht.

---

## 11. Offene Punkte (für Folge-Changes, nicht hier)

| Punkt | Begründung für OUT |
|---|---|
| Custom-Stepper-Komponente für Time-Picker | Briefing D1 wählt Native; Custom ist v0.8+, falls Browser-Inkonsistenz beobachtet wird. |
| i18n für `formatDescription` | Englisch only; deutsche Beschreibung ist v0.8+. |
| User-definierbare Custom-Presets | Briefing OUT; v0.8+. |
| Drag-and-Drop-Reordering für Presets | Presets sind fest definiert; v0.8+ (eigener Change). |
| Cron-Syntax-Spickzettel im Modal | Briefing OUT; v0.8+. |
| Multi-Timezone-Editor | Briefing OUT; v0.8+. |
| 6-Feld-Cron-Support (mit Sekunden) | Cronboard ist 5-Feld; v0.8+. |
| Tab-Navigation innerhalb des Modals | Cards sind auf einen Blick sichtbar (D9); v0.8+. |
| Bundle-Analyse-Tooling | Briefing nennt ≤ 4 kB als Soft-Limit; Hard-Cutoff ist v0.8+. |
| Light-Theme-spezifische Card-Tints | Das Gruvbox-Theme deckt beide Modi ab; v0.8+, falls Light jemals Default wird. |

Diese Punkte sind bewusst **außerhalb** dieses Changes.
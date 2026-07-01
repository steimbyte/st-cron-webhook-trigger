# Tasks: v0.7.1-ui-dropdown

> **Reihenfolge:** T0 → T1 → T2 → T3 → T4 → T5 → T6. Jeder Task endet mit einem Gate, das vor dem nächsten Task grün sein muss.
> **TDD-Postur:** Web hat seit v0.7.0 eine Pure-Function-Test-Suite (`npm run test:web`, siehe `openspec/config.yaml`). v0.7.1 setzt das fort: zuerst Test (RED), dann Implementierung (GREEN), dann UI.
> **Datei-Konvention:** jeder Task listet die Dateien, die er anfasst (R = lesen, M = schreiben, C = anlegen). Diese Tasks sind für **`sdd-apply`**, nicht für `sdd-propose` — `sdd-propose` ist mit dem Schreiben dieser Datei fertig.

---

## T0 — Pre-flight: Baseline-Messung & Code-Audit

> **Status:** Vom Parent bereits angestoßen (Briefing). Dieser Task misst einmalig den heutigen Stand, damit `sdd-apply` eine reproduzierbare Vergleichsbasis hat.

- **R** `packages/web/src/components/CronBuilder.tsx`:
  - Aktueller Trigger-Button: Zeile 73–80 (`btn btn-outline btn-block`).
  - Modal-Box: Zeile 84–94 (`max-w-3xl bg-base-200 border border-base-300/60`).
  - Header mit Reset-Button: Zeile 96–111 (`↺` als `btn btn-ghost btn-sm btn-square`).
  - Preset-Chips: Zeile 114–125 (`flex gap-2 flex-wrap mb-4`, 6 `btn btn-sm`-Buttons).
  - Inline detail block: Zeile 128–220 (`bg-base-100/40 border border-base-300/40 rounded-box p-4 space-y-3`).
  - Time-Picker: Zeile 161–183 (zwei separate `<select className="select select-bordered select-sm">` für Stunde und Minute).
  - Weekday-Selector: Zeile 184–206 (Calendar + Chip-Row mit `text-xs`).
  - Month-Selector: Zeile 207–220 (Calendar + `badge badge-primary badge-sm`).
  - Custom-Editor: Zeile 221–232 (`input input-bordered w-full`).
  - Live-Preview: Zeile 236–272 (Preview-Komponente).
  - Save/Cancel-Footer: Zeile 274–284.
- **R** `packages/core/src/scheduler/cronExpr.ts`:
  - `CronKind = "minute" | "hour" | "day" | "week" | "month" | "custom"` — alle 6 Kinds vorhanden.
  - `CronExpressionState` hat `kind`, `minuteInterval`, `hourInterval`, `hour`, `minute`, `days`, `dayOfMonth`, `custom`.
  - `defaultCronState()` setzt `kind: "day"`, `hour: 12`, `minute: 0`, `days: [1,2,3,4,5]` (Mo–Fr).
  - `MINUTE_INTERVAL_OPTIONS = [1, 2, 5, 10, 15, 20, 30]`, `HOUR_INTERVAL_OPTIONS = [1, 2, 3, 4, 6, 8, 12]`.
  - `buildCron`, `parseCron`, `weekdayInTimezone`, `datesForWeekdaysInMonth`, `dateForDayOfMonth` — alle unverändert nutzbar.
- **R** `packages/web/src/lib/api.ts`:
  - `api.cron.describe(expr, tz?)` (Zeile 49) — gibt `{ ok, text, error }` zurück. Wird in `Preview` für die Description-Badge genutzt.
  - `api.cron.next(expr, tz?, count=5)` (Zeile 54) — gibt `{ ok, runs: string[] }` zurück. Liefert ISO-Strings.
- **R** `packages/web/src/lib/relativeTime.ts`:
  - `formatRelative(ms: number, nowMs: number = now())` — bereits v0.7.0. Wird für die Preview-`description`-Badge und potenziell für `formatDescription` nicht direkt gebraucht, aber verfügbar.
- **R** `@radix-ui/react-icons` (v0.7.0-Liste):
  - `ClockIcon`, `HourglassIcon`, `CalendarIcon`, `CalendarDaysIcon`, `CalendarRangeIcon`, `CodeIcon` für die 6 Preset-Cards.
  - `ResetIcon` für den Reset-Button (alternativ zum `↺`-Text).
- **R** `docs/API.md` Zeile 14: `/api/health` Response enthält `"version": "0.7.0"` — wird auf `"0.7.1"` geändert.
- **R** `package.json` (Root): `version: "0.7.0"`, `packages/web/package.json`: `version: "0.7.0"`, `packages/core/package.json`: `version: "0.7.0"`. Alle drei müssen auf `0.7.1`.
- **R** `packages/core/src/cli.ts` Zeile ~28: `.version("0.7.0")` muss auf `.version("0.7.1")`.
- **R** `openspec/config.yaml` Zeile ~14: `project.version: 0.7.0` muss auf `0.7.1`.
- Ausführen (nicht von `sdd-propose`, sondern Hinweis für `sdd-apply`):
  ```powershell
  # Bundle-Größe Baseline (vor T-Endzustand):
  npm run build 2>&1 | Select-String "dist"
  # Aktuelle CronBuilder-Zeilenzahl:
  (Get-Content packages/web/src/components/CronBuilder.tsx).Count
  # Aktuelle CronBuilder-Test-Coverage:
  Select-String -Path packages/web/src/components/CronBuilder.tsx -Pattern "test"
  # Icon-Inventar im Web:
  Select-String -Path packages/web/src/**/*.tsx -Pattern "from \"@radix-ui/react-icons\""
  # Existierende test:web-Suites:
  npm run test:web 2>&1 | Select-String "tests"
  ```
- **Gate 0.1:** Notiz mit Bundle-Größe (vor T-Endzustand), Versions-Treffern (mind. 5 für `0.7.0`), Icon-Import-Liste.
- **Gate 0.2:** Bestätigung, dass `formatDescription(state)` als neuer Pure-Helper die einzige nennenswerte neue Logik ist (UX ist Markup).

---

## T1 — Tests-first für `formatDescription` (RED)

> **Eine** neue Pure-Helper-Funktion. Vor jeder Produktiv-Zeile in `packages/web/src/lib/cronDescription.ts` steht ein Test, der fehlschlägt. Erfüllt `rule: test-coverage-gap-disclosed` für die neue Surface.

### T1.1 — `cronDescription.test.ts`

- **C** `packages/web/src/lib/cronDescription.test.ts`
- Imports:
  ```ts
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { formatDescription } from "./cronDescription.js";
  import type { CronExpressionState } from "@cronboard/core/scheduler/cronExpr.js";
  ```
- **Mindestens 12 Test-Fälle**:

  | Block | Test | Erwartung |
  |---|---|---|
  | `minute` standard | `formatDescription({ kind: "minute", minuteInterval: 5, … })` | `"Every 5 minutes"` |
  | `minute` singular | `{ kind: "minute", minuteInterval: 1, … }` | `"Every minute"` |
  | `hour` standard | `{ kind: "hour", minute: 30, hourInterval: 2, … }` | `"Fires at minute 30 of every 2 hours"` |
  | `hour` singular | `{ kind: "hour", minute: 0, hourInterval: 1, … }` | `"Fires at minute 0 of every hour"` |
  | `day` standard | `{ kind: "day", hour: 9, minute: 0, … }` | `"Fires at 09:00 every day"` |
  | `day` midnight | `{ kind: "day", hour: 0, minute: 0, … }` | `"Fires at 00:00 every day"` |
  | `week` weekdays | `{ kind: "week", days: [1,2,3,4,5], hour: 9, minute: 0, … }` | `"Fires at 09:00 on weekdays"` |
  | `week` weekends | `{ kind: "week", days: [0,6], hour: 10, minute: 30, … }` | `"Fires at 10:30 on weekends"` |
  | `week` custom | `{ kind: "week", days: [1,3,5], hour: 14, minute: 15, … }` | `"Fires at 14:15 on Mon, Wed, Fri"` |
  | `week` empty | `{ kind: "week", days: [], hour: 9, minute: 0, … }` | `"Fires at 09:00 every day"` (Fallback) |
  | `month` standard | `{ kind: "month", dayOfMonth: 15, hour: 9, minute: 0, … }` | `"Fires at 09:00 on day 15 of every month"` |
  | `month` day-1 | `{ kind: "month", dayOfMonth: 1, hour: 8, minute: 30, … }` | `"Fires at 08:30 on day 1 of every month"` |
  | `custom` standard | `{ kind: "custom", custom: "*/5 * * * *", … }` | startsWith `"Custom: "`, contains `"*/5 * * * *"` |
  | `custom` empty | `{ kind: "custom", custom: "", … }` | `"Custom: (empty)"` oder `"Invalid cron expression"` |

- **Gate 1.1 (RED erwartet):** `node --test --import tsx packages/web/src/lib/cronDescription.test.ts` → ImportError (Datei `cronDescription.js` existiert noch nicht). Ausgabe in den Log.

> Hinweis: Alle 14 Tests werden in T1 fehlschlagen, weil das `cronDescription.ts`-Modul noch nicht existiert. Das ist beabsichtigt (RED-Phase).

---

## T2 — Implementierung des Pure-Helpers (GREEN)

### T2.1 — `cronDescription.ts`

- **C** `packages/web/src/lib/cronDescription.ts`
- Vollständige Funktion (siehe `design.md §2.1` für die Algorithmus-Begründung):

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
    // Special cases
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

- **Gate 2.1 (GREEN):** `node --test --import tsx packages/web/src/lib/cronDescription.test.ts` exit 0; alle 14 Tests grün.

### T2.2 — Skript-Erweiterung `package.json` (root)

- **M** `package.json` (Root) — `test:web`-Skript um die neue Suite ergänzen:

  ```json
  "test:web": "node --test --import tsx packages/web/src/lib/actionSummary.test.ts packages/web/src/lib/relativeTime.test.ts packages/web/src/lib/runStatus.test.ts packages/web/src/lib/reorderActions.test.ts packages/web/src/lib/cronDescription.test.ts"
  ```

- **Gate 2.2:** `npm run test:web` exit 0; alle 5 Suites grün (4 alte + 1 neue).

> Hinweis: `npm test` (root) bleibt unverändert (`packages/core/src/**/*.test.ts` only). Web-Tests sind ein separates `test:web`-Skript, konsistent mit v0.7.0.

---

## T3 — `CronBuilder`-Layout-Redesign: Preset-Cards + Time-Picker + Reset

> **Der eigentliche UI-Refactor.** Diese Task modifiziert `packages/web/src/components/CronBuilder.tsx` substanziell. `formatDescription` ist die kanonische Logik; das Modal ist dünnes Markup darüber.

### T3.1 — Neue Imports

- **M** `packages/web/src/components/CronBuilder.tsx` — am File-Anfang (zu den bestehenden `@radix-ui/react-icons`-Imports hinzufügen):

  ```tsx
  import {
    ClockIcon, HourglassIcon, CalendarIcon, CalendarDaysIcon, CalendarRangeIcon, CodeIcon,
    ResetIcon,
  } from "@radix-ui/react-icons";
  import { formatDescription } from "../lib/cronDescription.js";
  ```

### T3.2 — PRESETS-Definition erweitern

- **M** `packages/web/src/components/CronBuilder.tsx` — die `PRESETS`-Konstante erweitern um `icon`-Komponente:

  ```tsx
  import type { ComponentType } from "react";

  interface Preset {
    id: Kind;
    label: string;
    hint: string;
    Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  }

  const PRESETS: Preset[] = [
    { id: "minute", label: "Every minute", hint: "Runs every N minutes",           Icon: ClockIcon },
    { id: "hour",   label: "Hourly",       hint: "Minute of every Nth hour",        Icon: HourglassIcon },
    { id: "day",    label: "Daily",        hint: "Once per day at a specific time", Icon: CalendarIcon },
    { id: "week",   label: "Weekly",       hint: "Selected weekdays at a time",     Icon: CalendarDaysIcon },
    { id: "month",  label: "Monthly",      hint: "A specific day-of-month",         Icon: CalendarRangeIcon },
    { id: "custom", label: "Custom",       hint: "Raw 5-field cron expression",     Icon: CodeIcon },
  ];
  ```

### T3.3 — localStorage-Heuristik-Helper

- **M** `packages/web/src/components/CronBuilder.tsx` — neue Helper-Funktion am File-Anfang (vor `CronBuilder`):

  ```tsx
  const DETAILS_OPENED_KEY_PREFIX = "cb-details-opened-";

  function readDetailsOpened(kind: Kind): boolean {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(DETAILS_OPENED_KEY_PREFIX + kind) === "1";
    } catch {
      return false;
    }
  }

  function writeDetailsOpened(kind: Kind, open: boolean) {
    try {
      if (typeof window === "undefined") return;
      if (open) {
        window.localStorage.setItem(DETAILS_OPENED_KEY_PREFIX + kind, "1");
      } else {
        window.localStorage.removeItem(DETAILS_OPENED_KEY_PREFIX + kind);
      }
    } catch {
      // Quota exceeded or private mode — silently ignore (D5, R3).
    }
  }
  ```

### T3.4 — `defaultOpen`-State pro Kind

- **M** `packages/web/src/components/CronBuilder.tsx` — innerhalb der `CronBuilder`-Komponente:

  ```tsx
  // Erste Öffnung: defaultOpen=true (D10). Nachdem der User das <details> zu-klappt,
  // wird der State in localStorage gemerkt; beim nächsten Render ist defaultOpen=false
  // bis der User es wieder auf-klappt.
  const [detailsOpenedByKind, setDetailsOpenedByKind] = useState<Record<Kind, boolean>>(() => {
    const out = {} as Record<Kind, boolean>;
    for (const p of PRESETS) out[p.id] = !readDetailsOpened(p.id);
    return out;
  });

  function toggleDetails(kind: Kind) {
    setDetailsOpenedByKind((prev) => {
      const next = !prev[kind];
      writeDetailsOpened(kind, next);
      return { ...prev, [kind]: next };
    });
  }
  ```

### T3.5 — Preset-Card-Grid

- **M** `packages/web/src/components/CronBuilder.tsx` — ersetzt die Chip-Reihe (Zeile 114–125):

  ```tsx
  {/* Preset-Cards in einem 3x2-Grid (D2) */}
  <div
    data-testid="preset-grid"
    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4"
  >
    {PRESETS.map((p) => {
      const isActive = draft.kind === p.id;
      const Icon = p.Icon;
      return (
        <button
          key={p.id}
          type="button"
          data-testid="preset-card"
          data-kind={p.id}
          data-active={isActive ? "true" : "false"}
          className={`flex flex-col items-start gap-2 p-3 rounded-box text-left transition-colors border ${
            isActive
              ? "border-primary bg-primary/10 shadow-md"
              : "border-base-300/40 bg-base-100/40 hover:bg-base-100/60 hover:border-base-300/60"
          }`}
          onClick={() => update("kind", p.id)}
          aria-pressed={isActive}
        >
          <span
            className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
              isActive ? "bg-primary/20 text-primary" : "bg-base-300/40 text-base-content/70"
            }`}
            aria-hidden="true"
          >
            <Icon className="w-5 h-5" />
          </span>
          <span className="font-semibold text-sm">{p.label}</span>
          <span className="text-xs text-base-content/60 leading-tight">{p.hint}</span>
        </button>
      );
    })}
  </div>
  ```

### T3.6 — Header-Reset-Button

- **M** `packages/web/src/components/CronBuilder.tsx` — Reset-Button ersetzen (Zeile 105–110):

  ```tsx
  <button
    type="button"
    className="btn btn-outline btn-sm gap-1"
    onClick={reset}
    title="Reset to defaults"
  >
    <ResetIcon className="w-4 h-4" aria-hidden="true" />
    <span>Reset</span>
  </button>
  ```

### T3.7 — Inline-Beschreibung

- **M** `packages/web/src/components/CronBuilder.tsx` — direkt nach dem Preset-Grid, vor dem Detail-Block:

  ```tsx
  <div
    data-testid="cron-description"
    className="mb-3 px-4 py-2 rounded-md bg-base-100/40 border border-base-300/30 text-sm text-base-content/80"
  >
    {formatDescription(draft)}
  </div>
  ```

### T3.8 — Detail-Block: `<details>`-Wrapper mit Persistenz

- **M** `packages/web/src/components/CronBuilder.tsx` — der bestehende `<div className="bg-base-100/40 border border-base-300/40 rounded-box p-4 space-y-3">` (Zeile 128) wird in ein `<details>` verpackt:

  ```tsx
  <details
    data-testid="preset-details"
    className="bg-base-100/40 border border-base-300/40 rounded-box mb-3"
    open={detailsOpenedByKind[draft.kind]}
    onToggle={(e) => toggleDetails(draft.kind)}
  >
    <summary className="cursor-pointer select-none px-4 py-2 text-xs uppercase text-base-content/60 hover:text-base-content/90">
      {draft.kind === "custom" ? "Custom expression" : "Schedule details"}
    </summary>
    <div className="p-4 pt-2 space-y-3">
      {/* Alle bestehenden Preset-Felder (Minute-Intervall, Hour-Intervall,
          Time-Picker, Weekdays, Day-of-Month, Custom-Input) bleiben drin,
          aber mit dem neuen Layout pro Sub-Task. */}
    </div>
  </details>
  ```

### T3.9 — Time-Picker für `day`/`week`/`month`-Presets

- **M** `packages/web/src/components/CronBuilder.tsx` — ersetzt die zwei `<select>`-Dropdowns für Stunde und Minute (Zeile 161–183):

  ```tsx
  <div className="flex items-center gap-3 flex-wrap">
    <label htmlFor={`time-${draft.kind}`} className="text-sm text-base-content/70">
      At
    </label>
    <input
      id={`time-${draft.kind}`}
      data-testid="time-picker"
      type="time"
      lang="en-GB"
      step={60}
      className="input input-bordered input-lg bg-base-100/60 font-mono w-40"
      value={`${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`}
      onChange={(e) => {
        const [h, m] = e.target.value.split(":").map((x) => parseInt(x, 10));
        if (!isNaN(h) && !isNaN(m)) {
          setDraft((cur) => ({ ...cur, hour: h, minute: m }));
        }
      }}
    />
    <span className="text-xs text-base-content/50">24-hour clock</span>
  </div>
  ```

> Hinweis: für `hour`-Preset wird ein zusätzliches Intervall-Field gerendert (T3.10); das Time-Picker-Feld bleibt gleich, aber mit dem Hinweis "at this minute of every N hours".

### T3.10 — Intervall-Picker für `hour`/`minute`-Presets

- **M** `packages/web/src/components/CronBuilder.tsx` — innerhalb des `hour`- und `minute`-Branches:

  ```tsx
  {draft.kind === "hour" && (
    <div className="flex items-center gap-3 flex-wrap">
      <label htmlFor="hour-interval" className="text-sm text-base-content/70">
        Every
      </label>
      <select
        id="hour-interval"
        data-testid="interval-picker"
        className="select select-bordered select-md bg-base-100/60"
        value={String(draft.hourInterval)}
        onChange={(e) => update("hourInterval", parseInt(e.target.value, 10))}
      >
        {HOUR_INTERVAL_OPTIONS.map((n) => (
          <option key={n} value={String(n)}>{n} hour{n > 1 ? "s" : ""}</option>
        ))}
      </select>
    </div>
  )}

  {draft.kind === "minute" && (
    <div className="flex items-center gap-3 flex-wrap">
      <label htmlFor="minute-interval" className="text-sm text-base-content/70">
        Every
      </label>
      <select
        id="minute-interval"
        data-testid="interval-picker"
        className="select select-bordered select-md bg-base-100/60"
        value={String(draft.minuteInterval)}
        onChange={(e) => update("minuteInterval", parseInt(e.target.value, 10))}
      >
        {MINUTE_INTERVAL_OPTIONS.map((n) => (
          <option key={n} value={String(n)}>{n} minute{n > 1 ? "s" : ""}</option>
        ))}
      </select>
    </div>
  )}
  ```

> Hinweis S4: `select-md` (≈ 48 px hoch) statt `select-sm` (≈ 32 px). `data-testid="interval-picker"` als Hook.

### T3.11 — Weekday-Selector: prominentere Chip-Row (D14)

- **M** `packages/web/src/components/CronBuilder.tsx` — innerhalb des `week`-Branches:

  ```tsx
  {draft.kind === "week" && (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap" data-testid="weekday-summary">
        <span className="text-sm font-semibold text-base-content/80">Active weekdays:</span>
        {draft.days.length === 0 ? (
          <span className="text-sm text-base-content/50 italic">none (will run daily)</span>
        ) : (
          draft.days.map((d) => (
            <span key={d} className="badge badge-primary badge-md font-mono">{DAY_LABELS[d]}</span>
          ))
        )}
      </div>
      <span className="text-xs text-base-content/60">Tap a date in the calendar below to toggle its weekday</span>
      <Calendar
        mode="multiple"
        multiValue={datesForWeekdaysInMonth(draft.days, new Date(), timezone)}
        onMultiChange={(dates: Date[]) => {
          const weekdays = [
            ...new Set(dates.map((d: Date) => weekdayInTimezone(d, timezone))),
          ].sort((a: number, b: number) => a - b);
          update("days", weekdays);
        }}
        triggerLabel="Pick weekdays"
        timezone={timezone}
      />
    </div>
  )}
  ```

> Hinweis D14: die Chip-Row rutscht **vor** den Kalender-Tooltip (vorher nach dem Kalender). `badge badge-md` statt `badge-sm`. `text-sm font-semibold` statt `text-xs text-base-content/50` für das "Active:"-Label.

### T3.12 — Day-of-Month: 48x48-Tile (D15)

- **M** `packages/web/src/components/CronBuilder.tsx` — innerhalb des `month`-Branches:

  ```tsx
  {draft.kind === "month" && (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-base-content/70">Active day-of-month:</span>
        <div
          data-testid="day-of-month-tile"
          className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-content font-bold text-2xl font-mono shadow-md"
          aria-label={`Day ${draft.dayOfMonth} of every month`}
        >
          {draft.dayOfMonth}
        </div>
      </div>
      <span className="text-xs text-base-content/60">Pick a date — its day-of-month is the trigger</span>
      <Calendar
        value={dateForDayOfMonth(draft.dayOfMonth, new Date(), timezone)}
        onChange={(d: Date | null) => {
          if (!d) return;
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone, day: "numeric",
          }).formatToParts(d);
          const dayPart = parts.find((p) => p.type === "day")?.value ?? "1";
          update("dayOfMonth", parseInt(dayPart, 10));
        }}
        triggerLabel={`Day ${draft.dayOfMonth}`}
        timezone={timezone}
      />
    </div>
  )}
  ```

> Hinweis D15: 48x48 px (`w-12 h-12`) statt `badge badge-primary badge-sm`. `bg-primary text-primary-content` für starken visuellen Kontrast. Tile ist prominent, Kalender bleibt darunter als Eingabe-Werkzeug.

### T3.13 — Custom-Input (unverändert)

- **M** `packages/web/src/components/CronBuilder.tsx` — der `custom`-Branch bleibt strukturell gleich; nur Wrapper verbessern:

  ```tsx
  {draft.kind === "custom" && (
    <div className="space-y-2">
      <span className="text-xs text-base-content/60">5-field cron: minute hour day-of-month month day-of-week</span>
      <input
        type="text"
        data-testid="custom-cron-input"
        className="input input-bordered input-md w-full bg-base-100/60 font-mono"
        value={draft.custom}
        onChange={(e) => update("custom", e.target.value)}
        placeholder="* * * * *"
      />
    </div>
  )}
  ```

> Hinweis: `input-md` statt `input-sm` (S4-Konsistenz: kein `*-sm` mehr im Modal).

- **Gate 3.1:** `npm run typecheck -w packages/web` exit 0.
- **Gate 3.2:** `npm run test:web` exit 0 (5 Suites grün, 4 alte + 1 neue).
- **Gate 3.3:** S1–S4, S6 visuell — Reviewer-Auge; siehe `design.md §10` für die `data-testid`-Erwartungen.

---

## T4 — Preview-Tile-Redesign

> **Preview-Block** im Modal bekommt größere Tiles, Datum prominent, Wochenend-Indikator (optional).

- **M** `packages/web/src/components/CronBuilder.tsx` — die `Preview`-Komponente (Zeile 236–272) wird modifiziert.

### T4.1 — Tile-Layout

- **M** `packages/web/src/components/CronBuilder.tsx` — innerhalb der `Preview`-Komponente, der `runs.map((r, i) => …)`-Block wird ersetzt durch:

  ```tsx
  <div
    data-testid="preview-tiles"
    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
  >
    {runs.slice(0, 5).map((r, i) => {
      const d = new Date(r);
      const weekday = d.getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      return (
        <div
          key={i}
          data-testid="preview-tile"
          className="flex flex-col gap-1 px-3 py-3 rounded-box bg-base-100/60 border border-base-300/40"
        >
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-base font-semibold">
              {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            {isWeekend && (
              <span
                className="badge badge-warning badge-xs"
                title="Weekend run"
                data-testid="weekend-indicator"
              >
                wknd
              </span>
            )}
          </div>
          <span className="text-sm text-base-content/60 font-mono">
            {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      );
    })}
  </div>
  ```

> Hinweis D7: Grid mit 1 Spalte (Mobile) bis 5 Spalten (`lg+`). Hinweis D8: Wochenend-Indikator als optionales Feature (S5 bleibt erfüllt, auch wenn er fehlt).

### T4.2 — Description-Badge bleibt

- **M** `packages/web/src/components/CronBuilder.tsx` — die bestehende Description-Badge (`<span className="badge badge-ghost badge-sm">{description}</span>` in Zeile 247) bleibt **unverändert**. Sie kommt weiterhin von `api.cron.describe` (siehe Decision D4 — Server-side description bleibt für die Preview-Badge, lokale `formatDescription` ist eine **zusätzliche** inline-Anzeige).

- **Gate 4.1:** S5 visuell — Reviewer-Auge; `data-testid="preview-tile"` 5× im DOM, Datum oben, Zeit unten, optionaler Wochenend-Badge.
- **Gate 4.2:** S6 funktional — `formatDescription(draft)` rendert im `cron-description`-Element.

---

## T5 — Version-Bump + Doku + README/CHANGELOG

- **M** `package.json` (Root): `"version": "0.7.0"` → `"0.7.1"`.
- **M** `packages/web/package.json`: `"version": "0.7.0"` → `"0.7.1"`.
- **M** `packages/core/package.json`: `"version": "0.7.0"` → `"0.7.1"`.
- **M** `packages/core/src/cli.ts` Zeile ~28: `.version("0.7.0")` → `.version("0.7.1")`.
- **M** `packages/core/src/server.ts`: in der `/api/health`-Route `version: "0.7.0"` → `version: "0.7.1"`.
- **M** `openspec/config.yaml`: `project.version: 0.7.0` → `0.7.1`.
- **M** `README.md` Zeile 5: `> **Status:** v0.7.0 — …` → `> **Status:** v0.7.1 — …, schedule modal shows preset cards, native time picker, and human-readable inline description`.
- **M** `README.md` Feature-Liste: neuer Bullet "**Schedule-Modal mit Preset-Cards** — sechs große Cards (Icon + Label + Hint) ersetzen die Chip-Reihe; nativer `<input type="time">` ersetzt die zwei Dropdowns; inline-Beschreibung ('Fires at 09:00 on weekdays') zeigt die Wirkung der Cron-Regel."
- **M** `CHANGELOG.md`: neue Top-Sektion nach `[Unreleased]` (vollständiger Text im `proposal.md §4.1`).

- Verifikation:
  ```powershell
  Select-String -Path package.json,packages/*/package.json,packages/core/src/cli.ts,packages/core/src/server.ts,openspec/config.yaml -Pattern "0\.7\.0"
  # erwartet: 0 Treffer (oder ausschließlich in CHANGELOG.md / docs/)
  Select-String -Path package.json,packages/*/package.json,packages/core/src/cli.ts,packages/core/src/server.ts,openspec/config.yaml -Pattern "0\.7\.1"
  # erwartet: ≥ 6 Treffer
  ```
- **Gate 5.1:** `grep -RIn "0.7.0" package.json packages/*/package.json packages/core/src/cli.ts packages/core/src/server.ts openspec/config.yaml` → 0 Treffer.
- **Gate 5.2:** gleicher Befehl für `"0.7.1"` → ≥ 6 Treffer.

---

## T6 — Gates: typecheck + tests + build + smoke + commit + push

- **R** Alle Quellen seit T0.
- Ausführen:
  ```powershell
  npm run typecheck
  npm run test:web
  npm test
  npm run build
  powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
  ```
- **Gate 6.1 (S7 typecheck):** `npm run typecheck` exit 0.
- **Gate 6.2 (S7 build):** `npm run build` exit 0; Lockfile-Diff betrifft nur ggf. dokumentierte Deps (sollte leer sein — keine neuen Deps).
- **Gate 6.3 (S7 smoke):** `scripts/smoke.ps1` exit 0; im Smoke-Output `=== done ===` oder etablierte Erfolgsmeldung.
- **Gate 6.4 (S7 test:web):** `npm run test:web` zeigt 5 Suites (actionSummary, relativeTime, runStatus, reorderActions, cronDescription), ≥ 72 Tests total (58 v0.7.0 + 14 neue), 0 Failures.
- **Gate 6.5:** Bundle-Diff vs. v0.7.0 dokumentiert im PR-Body (gzip + raw bytes). Erwartetes Plus: +2 bis +3 kB gzip (innerhalb S8 ≤ 4 kB).
- Commit + Push:
  ```powershell
  git status
  git add \
    openspec/changes/v0.7.1-ui-dropdown/ \
    package.json packages/web/package.json packages/core/package.json \
    packages/web/src/lib/cronDescription.ts \
    packages/web/src/lib/cronDescription.test.ts \
    packages/web/src/components/CronBuilder.tsx \
    packages/core/src/cli.ts packages/core/src/server.ts \
    openspec/config.yaml README.md CHANGELOG.md
  git status
  git commit -m "feat(v0.7.1): ui-dropdown - preset cards, native time picker, inline description, preview tiles"
  git push origin master
  ```
- **Gate 6.6:** `git log -1 --pretty=%s` → exakt der vorgegebene Subject.
- **Gate 6.7:** `git diff master@{1} master --stat` zeigt nur die oben `git add`-eten Pfade.
- **Gate 6.8:** Re-Run `npm run typecheck && npm run test:web && powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1` — alles grün.

> Commit-Message-Konvention: v0.7.0 nutzte `feat(v0.X.Y): …`. v0.7.1 setzt das mit `feat(v0.7.1):` fort.

---

## Cross-Phase-Checkliste (bevor `sdd-apply` als erfolgreich gilt)

- [ ] T0 Baseline-Analyse geschrieben (Bundle-Size, Versions-Hits, Icon-Inventar)
- [ ] T1 `cronDescription.test.ts` **RED** nachweisbar (ImportError)
- [ ] T2 `cronDescription.ts` macht die Tests **GREEN**; `npm run test:web` läuft mit 5 Suites
- [ ] T3 `CronBuilder` ist redesigned: Preset-Card-Grid, nativer Time-Picker, größerer Intervall-Picker, prominenter Weekday-Chip-Row, Day-of-Month-Tile, inline-Beschreibung, Reset-Button mit Label, `<details>`-Persistenz via localStorage
- [ ] T4 Preview-Tile-Redesign: 5 Tiles, Datum prominent, Wochenend-Indikator optional
- [ ] T5 Versionsstrings vollständig von `0.7.0` auf `0.7.1`; README + CHANGELOG aktualisiert
- [ ] T6 Typecheck + Web-Tests + Core-Tests + Build + Smoke + Commit + Push — alle grün
- [ ] **Acceptance Criteria S1–S8** alle erfüllt (Tabelle in `proposal.md §3`)
- [ ] **Decisions D1–D15** aus `proposal.md §8` sind in der Implementierung erkennbar
- [ ] **Risiken R1–R12** aus `proposal.md §6` sind mitigiert (insb. R3, R4, R11)
- [ ] `git diff packages/*/src/` zeigt nur die geplanten Änderungen (T6 `git add`-Liste); sonst nichts Unerwartetes
- [ ] **Keine neuen npm-Dependencies** in `package.json` oder `packages/*/package.json` (Constraint des Parents)
- [ ] **Bundle-Delta ≤ 4 kB gzip** (S8)

---

## Beobachtungen für `sdd-apply` (kein T-Task, Empfehlungen)

1. **Bundle-Delta**: v0.7.1 ist UI-only. Erwartetes Bundle-Plus: +2 bis +3 kB gzip (6 Card-Markups × ~40 Zeilen + Time-Picker-Styling + `formatDescription`-Helper). Im PR-Body dokumentieren.
2. **LocalStorage-Privacy-Hinweis**: Im PR-Body kurz erwähnen, dass die localStorage-Keys (`cb-details-opened-${kind}`) keine PII enthalten. Reviewer-Fokus auf R3.
3. **`<input type="time">`-Browser-Test**: Vor dem Merge in Chrome, Firefox, Safari testen. Akzeptanz ist nur das Vorhandensein des Elements + `step={60}`, nicht das Popup-Verhalten (R2).
4. **Preset-Card-Hover-State**: in T3.5 ist der Hover-State `hover:bg-base-100/60 hover:border-base-300/60` — auf Mobile (Touch) nicht relevant. Kein zusätzlicher Code nötig.
5. **LocalStorage-Quota**: bei 6 möglichen Keys ist das Quota-Risiko null. try/catch um die localStorage-Calls ist trotzdem da (R3).
6. **Test-Runner-Initialisierung**: `npm run test:web` muss `tsx` korrekt laden (siehe v0.7.0-Notes). Falls Web-Tests in einer Windows-Sandbox fehlschlagen: `npm install` muss vorher laufen (nicht Teil von v0.7.1, aber Gate).
7. **Zukünftige Web-Lib-Helpers** (eigene Change-IDs):
   - Custom-Stepper-Komponente für Time-Picker (v0.8+, falls Browser-Inkonsistenz von `<input type="time">` beobachtet wird)
   - i18n für `formatDescription` (v0.8+, deutsche Beschreibung)
   - User-definierbare Custom-Presets (v0.8+)
   - Light-Theme-spezifische Card-Tints (v0.8+, falls Gruvbox-Light jemals Default wird)
8. **Folge-Changes (eigene Change-IDs)**:
   - Drag-and-Drop-Reordering für Presets (v0.8+)
   - Cron-Syntax-Spickzettel im Modal (v0.8+)
   - Multi-Timezone-Editor (v0.8+)
   - 6-Feld-Cron-Support (v0.8+, mit Sekunden)
   - Tab-Navigation innerhalb des Modals (v0.8+, falls Card-Grid zu vertikal wird)
   - Bundle-Analyse-Tooling (v0.8+, Hard-Limit für Bundle-Größe)
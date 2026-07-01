// CronBuilderModal — opens from a trigger button in JobEditor. Lets the user
// pick a recurrence and a specific time/date, then saves the resulting cron
// string back via onChange. Wrapped in a DaisyUI modal.
//
// v0.7.1-ui-dropdown — visual polish over the v0.7.0 chip-row layout:
//   - 6 preset CARDS in a 3x2 grid (icon + label + visible hint + active highlight).
//     Replaces the cramped `btn-sm` chip row.
//   - Single native `<input type="time" step=60>` replaces the two time
//     `<select>`s — accessibility + mobile keyboard out-of-the-box.
//   - Inline human-readable description ({formatDescription(draft)}) sits under
//     the card grid so the user can sanity-check what the cron does before saving.
//   - Interval picker uses `select-md` (not `select-sm`).
//   - Per-preset detail block lives inside a browser-native `<details>` whose
//     open-state is persisted per `kind` in localStorage (no PII).
//   - Reset button is a labeled outline button, not a hidden `↺` icon.
//   - Preview block renders 5 prominent tiles (date prominent, time secondary)
//     with an optional weekend indicator.
//
// Design goals (kept):
//   - One screen, no nested tabs.
//   - Always-visible live preview of the next 5 runs at the bottom.
//   - Single "Save" button — never silently commits.

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  ClockIcon,
  TimerIcon,
  CalendarIcon,
  RowsIcon,
  LayersIcon,
  CodeIcon,
  ResetIcon,
} from "@radix-ui/react-icons";
import {
  buildCron,
  parseCron,
  defaultCronState,
  MINUTE_INTERVAL_OPTIONS,
  HOUR_INTERVAL_OPTIONS,
  weekdayInTimezone,
  datesForWeekdaysInMonth,
  dateForDayOfMonth,
  type CronExpressionState,
} from "../../../core/src/scheduler/cronExpr";
import { Calendar } from "./Calendar";
import { api } from "../lib/api";
import { formatDescription } from "../lib/cronDescription";

type Kind = CronExpressionState["kind"];

interface Preset {
  id: Kind;
  label: string;
  hint: string;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
}

const PRESETS: Preset[] = [
  { id: "minute", label: "Every minute", hint: "Runs every N minutes",          Icon: ClockIcon },
  { id: "hour",   label: "Hourly",       hint: "Minute of every Nth hour",      Icon: TimerIcon },
  { id: "day",    label: "Daily",        hint: "Once per day at a specific time", Icon: CalendarIcon },
  { id: "week",   label: "Weekly",       hint: "Selected weekdays at a time",   Icon: RowsIcon },
  { id: "month",  label: "Monthly",      hint: "A specific day-of-month",       Icon: LayersIcon },
  { id: "custom", label: "Custom",       hint: "Raw 5-field cron expression",   Icon: CodeIcon },
];

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// localStorage key for the <details>-open-state per kind (D5 / R3). The key
// is the signal: presence means "user collapsed this once", absence (or "0")
// means "leave it open". Only one key per `kind`, no PII, value is the
// literal string "1".
const DETAILS_OPENED_KEY_PREFIX = "cb-details-opened-";

function readDetailsOpened(kind: Kind): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DETAILS_OPENED_KEY_PREFIX + kind) === "1";
  } catch {
    return false;
  }
}

function writeDetailsOpened(kind: Kind, open: boolean): void {
  try {
    if (typeof window === "undefined") return;
    const key = DETAILS_OPENED_KEY_PREFIX + kind;
    if (open) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, "1");
  } catch {
    // Quota exceeded / private mode → swallow (D5, R3).
  }
}

interface Props {
  value: string;
  onChange: (cron: string) => void;
  timezone: string;
}

export default function CronBuilder({ value, onChange, timezone }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CronExpressionState>(defaultCronState);

  // Per-kind `<details>` open-state. Seeded from localStorage on first mount;
  // toggle handler writes back. Defaults to open so a fresh modal isn't blank
  // (D10).
  const [detailsOpenedByKind, setDetailsOpenedByKind] = useState<Record<Kind, boolean>>(
    () => {
      const out = {} as Record<Kind, boolean>;
      for (const p of PRESETS) out[p.id] = !readDetailsOpened(p.id);
      return out;
    },
  );

  // Re-parse the current cron every time the modal opens or value changes —
  // we DO NOT cache the parse result: that was the bug that caused every
  // `*/N` to fall back to `*/5` when the user picked a smaller N.
  useEffect(() => {
    const parsed = parseCron(value);
    if (parsed && parsed.kind) {
      setDraft((cur) => ({ ...cur, ...parsed, custom: value }));
    } else {
      setDraft((cur) => ({ ...cur, kind: "custom", custom: value }));
    }
  }, [value]);

  function update<K extends keyof CronExpressionState>(k: K, v: CronExpressionState[K]) {
    setDraft((cur) => ({ ...cur, [k]: v }));
  }

  function toggleDetails(kind: Kind) {
    setDetailsOpenedByKind((prev) => {
      const next = !prev[kind];
      writeDetailsOpened(kind, next);
      return { ...prev, [kind]: next };
    });
  }

  function commit() {
    const next = draft.kind === "custom" ? draft.custom.trim() : buildCron(draft);
    if (next && next !== value) onChange(next);
    setOpen(false);
  }

  function reset() {
    const parsed = parseCron(value);
    if (parsed && parsed.kind) setDraft({ ...defaultCronState(), ...parsed });
    else setDraft(defaultCronState());
  }

  // Build the live cron string for the preview (without committing).
  const liveCron = draft.kind === "custom" ? draft.custom.trim() : buildCron(draft);

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        className="btn btn-outline btn-block justify-between font-mono normal-case"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{liveCron || "* * * * *"}</span>
        <span className="badge badge-primary badge-sm">edit</span>
      </button>

      {/* Modal */}
      <dialog open={open} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-3xl bg-base-200 border border-base-300/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold">Schedule</h3>
              <p className="text-xs text-base-content/50">Timezone: {timezone}</p>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1"
              onClick={reset}
              title="Reset to defaults"
            >
              <ResetIcon className="w-4 h-4" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>

          {/* Preset cards in a 3x2 grid (D2) */}
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
                  aria-pressed={isActive}
                  className={`flex flex-col items-start gap-2 p-3 rounded-box text-left transition-colors border ${
                    isActive
                      ? "border-primary bg-primary/10 shadow-md"
                      : "border-base-300/40 bg-base-100/40 hover:bg-base-100/60 hover:border-base-300/60"
                  }`}
                  onClick={() => update("kind", p.id)}
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

          {/* Inline human description — uses the formatDescription helper.
              Lets the user sanity-check what the cron does without parsing the
              raw string. (S6) */}
          <div
            data-testid="cron-description"
            className="mb-3 px-4 py-2 rounded-md bg-base-100/40 border border-base-300/30 text-sm text-base-content/80"
          >
            {formatDescription(draft)}
          </div>

          {/* Per-preset details inside a <details> wrapper whose open-state is
              persisted in localStorage per `kind`. Stable `key` prevents the
              subtree from re-mounting when only the surrounding state changes. */}
          <details
            key={`details-${draft.kind}`}
            data-testid="preset-details"
            className="bg-base-100/40 border border-base-300/40 rounded-box mb-3"
            open={detailsOpenedByKind[draft.kind]}
            onToggle={() => toggleDetails(draft.kind)}
          >
            <summary className="cursor-pointer select-none px-4 py-2 text-xs uppercase text-base-content/60 hover:text-base-content/90">
              {draft.kind === "custom" ? "Custom expression" : "Schedule details"}
            </summary>
            <div className="p-4 pt-2 space-y-3">
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
                  <span className="text-xs text-base-content/50">on the clock.</span>
                </div>
              )}

              {draft.kind === "hour" && (
                <div className="space-y-3">
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
                        const parts = e.target.value.split(":").map((x) => parseInt(x, 10));
                        const h = parts[0];
                        const m = parts[1];
                        if (!isNaN(h) && !isNaN(m)) {
                          setDraft((cur) => ({ ...cur, hour: h, minute: m }));
                        }
                      }}
                    />
                    <span className="text-xs text-base-content/50">24-hour clock</span>
                  </div>
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
                </div>
              )}

              {(draft.kind === "day" || draft.kind === "week" || draft.kind === "month") && (
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
                      const parts = e.target.value.split(":").map((x) => parseInt(x, 10));
                      const h = parts[0];
                      const m = parts[1];
                      if (!isNaN(h) && !isNaN(m)) {
                        setDraft((cur) => ({ ...cur, hour: h, minute: m }));
                      }
                    }}
                  />
                  <span className="text-xs text-base-content/50">24-hour clock</span>
                </div>
              )}

              {draft.kind === "week" && (
                <div className="space-y-3" data-testid="weekday-block">
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

              {draft.kind === "month" && (
                <div className="space-y-3" data-testid="month-block">
                  <div className="flex items-center gap-3 flex-wrap">
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
            </div>
          </details>

          {/* Live preview */}
          <Preview cron={liveCron} timezone={timezone} />

          {/* Footer */}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={commit} disabled={!liveCron}>
              Save schedule
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  );
}

function Preview({ cron, timezone }: { cron: string; timezone: string }) {
  const [runs, setRuns] = useState<string[]>([]);
  const [description, setDescription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!cron.trim()) {
      setRuns([]); setDescription(""); setError(null);
      return;
    }
    Promise.all([api.cron.describe(cron, timezone), api.cron.next(cron, timezone, 5)]).then(
      ([d, n]) => {
        if (cancelled) return;
        setDescription(d.ok && d.text ? d.text : "");
        setError(d.ok ? null : d.error || "parse error");
        setRuns(n.ok && n.runs ? n.runs : []);
      },
    );
    return () => { cancelled = true; };
  }, [cron, timezone]);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs uppercase text-base-content/50">Preview</span>
        {description ? (
          <span className="badge badge-ghost badge-sm" data-testid="preview-description">{description}</span>
        ) : null}
      </div>
      {error ? (
        <div className="text-error text-sm">{error}</div>
      ) : runs.length === 0 ? (
        <div className="text-base-content/50 text-sm">No upcoming runs.</div>
      ) : (
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
                      data-testid="weekend-indicator"
                      className="badge badge-warning badge-xs"
                      title="Weekend run"
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
      )}
    </div>
  );
}

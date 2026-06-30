// CronBuilderModal — opens from a trigger button in JobEditor. Lets the user
// pick a recurrence and a specific time/date, then saves the resulting cron
// string back via onChange. Wrapped in a DaisyUI modal.
//
// Design goals:
//   - One screen, no nested tabs.
//   - Presets (Every minute / 5 / 15 / 30 / hour / day / week / month) at the
//     top, inline detail fields below.
//   - Always-visible live preview of the next 5 runs at the bottom.
//   - Single "Save" button — never silently commits.

import { useEffect, useState } from "react";
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
} from "@cronboard/core/scheduler/cronExpr";
import { Calendar } from "./Calendar";
import { api } from "../lib/api";

type Kind = CronExpressionState["kind"];

interface Preset {
  id: Kind;
  label: string;
  hint: string;
}

const PRESETS: Preset[] = [
  { id: "minute", label: "Every minute", hint: "Runs every N minutes" },
  { id: "hour",   label: "Hourly",     hint: "Runs at a specific minute of every Nth hour" },
  { id: "day",    label: "Daily",      hint: "Runs once per day at a specific time" },
  { id: "week",   label: "Weekly",     hint: "Runs on selected weekdays at a specific time" },
  { id: "month",  label: "Monthly",    hint: "Runs on a specific day-of-month" },
  { id: "custom", label: "Custom",     hint: "Raw 5-field cron" },
];

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, "0"));

interface Props {
  value: string;
  onChange: (cron: string) => void;
  timezone: string;
}

export default function CronBuilder({ value, onChange, timezone }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CronExpressionState>(defaultCronState);

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
              className="btn btn-ghost btn-sm btn-square"
              onClick={reset}
              title="Reset to default"
            >
              ↺
            </button>
          </div>

          {/* Preset chips */}
          <div className="flex gap-2 flex-wrap mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${draft.kind === p.id ? "btn-primary" : "btn-ghost"}`}
                onClick={() => update("kind", p.id)}
                title={p.hint}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Inline detail fields (only shown for the active preset) */}
          <div className="bg-base-100/40 border border-base-300/40 rounded-box p-4 space-y-3">
            {draft.kind === "minute" && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-base-content/70">Every</span>
                <select
                  className="select select-bordered select-sm bg-base-100/60"
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
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-base-content/70">At minute</span>
                <select
                  className="select select-bordered select-sm bg-base-100/60 w-20 font-mono"
                  value={String(draft.minute).padStart(2, "0")}
                  onChange={(e) => update("minute", parseInt(e.target.value, 10))}
                >
                  {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <span className="text-sm text-base-content/70">of every</span>
                <select
                  className="select select-bordered select-sm bg-base-100/60"
                  value={String(draft.hourInterval)}
                  onChange={(e) => update("hourInterval", parseInt(e.target.value, 10))}
                >
                  {HOUR_INTERVAL_OPTIONS.map((n) => (
                    <option key={n} value={String(n)}>{n} hour{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            )}

            {(draft.kind === "day" || draft.kind === "week" || draft.kind === "month") && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-base-content/70">At</span>
                <select
                  className="select select-bordered select-sm bg-base-100/60 w-20 font-mono"
                  value={String(draft.hour).padStart(2, "0")}
                  onChange={(e) => update("hour", parseInt(e.target.value, 10))}
                >
                  {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="text-base-content/50">:</span>
                <select
                  className="select select-bordered select-sm bg-base-100/60 w-20 font-mono"
                  value={String(draft.minute).padStart(2, "0")}
                  onChange={(e) => update("minute", parseInt(e.target.value, 10))}
                >
                  {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

            {draft.kind === "week" && (
              <div className="space-y-2">
                <span className="text-sm text-base-content/70">On days (tap a date to toggle its weekday)</span>
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
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-base-content/50">Active:</span>
                  {draft.days.length === 0 ? (
                    <span className="text-xs text-base-content/50">none (will run daily)</span>
                  ) : (
                    draft.days.map((d) => (
                      <span key={d} className="badge badge-primary badge-sm">{DAY_LABELS[d]}</span>
                    ))
                  )}
                </div>
              </div>
            )}

            {draft.kind === "month" && (
              <div className="space-y-2">
                <span className="text-sm text-base-content/70">Pick a date — its day-of-month is the trigger</span>
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/50">Active day-of-month:</span>
                  <span className="badge badge-primary badge-sm">{draft.dayOfMonth}</span>
                </div>
              </div>
            )}

            {draft.kind === "custom" && (
              <div className="space-y-2">
                <span className="text-xs text-base-content/50">5-field cron: minute hour day-of-month month day-of-week</span>
                <input
                  type="text"
                  className="input input-bordered w-full bg-base-100/60 font-mono"
                  value={draft.custom}
                  onChange={(e) => update("custom", e.target.value)}
                  placeholder="* * * * *"
                />
              </div>
            )}
          </div>

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
          <span className="badge badge-ghost badge-sm">{description}</span>
        ) : null}
      </div>
      {error ? (
        <div className="text-error text-sm">{error}</div>
      ) : runs.length === 0 ? (
        <div className="text-base-content/50 text-sm">No upcoming runs.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {runs.map((r, i) => {
            const d = new Date(r);
            return (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md bg-base-300/40">
                <span className="text-sm font-medium">
                  {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span className="text-sm text-base-content/60">{d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
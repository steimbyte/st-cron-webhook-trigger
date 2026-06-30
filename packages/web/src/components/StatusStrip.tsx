// StatusStrip — compact "last N runs" visualisation, one cell per run.
// Used in the JobsPage row to give an at-a-glance sense of recent behaviour.
// Pure SVG/DaisyUI; no new dependencies.

import type { Run, RunStatus } from "../types";

interface Props {
  runs: Run[];        // any length, 0..N
  cellSize?: number;  // default 10 px
  count?: number;     // default 20 (D6)
  emptyLabel?: string; // default "No runs yet"
}

const COLOR: Record<RunStatus, string> = {
  success: "bg-success",
  failed: "bg-error",
  partial: "bg-warning",
  timeout: "bg-warning",
  running: "bg-info",
};

export function StatusStrip({
  runs,
  cellSize = 10,
  count = 20,
  emptyLabel = "No runs yet",
}: Props) {
  // Newest first; pad to `count` cells.
  const cells = Array.from({ length: count }, (_, i) => runs[i] ?? null);
  return (
    <div
      className="flex gap-[2px] items-center"
      role="list"
      aria-label={`Last ${count} runs`}
    >
      {cells.map((r, i) => (
        <span
          key={i}
          role="listitem"
          aria-label={
            r
              ? `Run ${runs.length - i}: ${r.status} at ${r.startedAt}` +
                (r.durationMs != null ? ` (${r.durationMs} ms)` : "")
              : emptyLabel
          }
          title={
            r
              ? `${r.status} · ${new Date(r.startedAt).toLocaleString()}` +
                (r.durationMs != null ? ` · ${r.durationMs}ms` : "")
              : emptyLabel
          }
          className={`inline-block rounded-sm ${
            r ? COLOR[r.status] : "bg-base-300/40"
          }`}
          style={{ width: cellSize, height: cellSize }}
        />
      ))}
    </div>
  );
}

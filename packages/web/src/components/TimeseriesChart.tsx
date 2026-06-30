// TimeseriesChart — minimal native-SVG area chart for the dashboard's
// 24-bucket "runs per hour" view. No npm dependencies (D8).
// Renders an empty-state hint when every bucket is zero (S7-adjacent honesty).

interface Props {
  values: number[];        // length 24 for the dashboard
  width?: number;          // default 120
  height?: number;         // default 32
  color?: string;          // default: --color-primary
  emptyMessage?: string;   // default "No runs in window"
}

export function TimeseriesChart({
  values,
  width = 120,
  height = 32,
  color = "var(--color-primary)",
  emptyMessage = "No runs in window",
}: Props) {
  if (values.length === 0 || values.every((v) => v === 0)) {
    return (
      <div
        className="text-[10px] text-base-content/40 italic"
        role="status"
        style={{ width, height }}
      >
        {emptyMessage}
      </div>
    );
  }
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map(
    (v, i) => `${i * stepX},${height - (v / max) * height}`,
  );
  const linePath = `M ${points.join(" L ")}`;
  const lastX = (values.length - 1) * stepX;
  const areaPath = `${linePath} L ${lastX},${height} L 0,${height} Z`;
  const maxIdx = values.indexOf(max);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Hourly run counts over the last ${values.length} hours, max ${max} in hour ${maxIdx}`}
    >
      <path d={areaPath} fill={color} fillOpacity={0.18} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

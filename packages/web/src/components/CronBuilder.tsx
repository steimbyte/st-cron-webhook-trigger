import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Flex,
  Tabs,
  Select,
  TextField,
  Text,
  Card,
  Separator,
  IconButton,
  Heading,
  Badge,
  Tooltip,
  Grid,
  Button,
} from "@radix-ui/themes";
import { CalendarIcon, ClockIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { api } from "../lib/api";

/**
 * CronBuilder — visual recurrence picker.
 *
 * Bidirectional: emits a cron expression on every change, parses an incoming
 * cron expression back into UI state when one is loaded (e.g. editing an
 * existing job). Falls back to a "Custom" tab with a raw cron text input when
 * the expression does not fit one of the supported patterns.
 */

type Kind = "minute" | "hour" | "day" | "week" | "month" | "custom";

interface BuilderState {
  kind: Kind;
  minuteInterval: number;     // for "minute": */N
  hourInterval: number;       // for "hour": */N
  hour: number;               // 0-23
  minute: number;             // 0-59
  days: number[];             // 0=Sun..6=Sat, for "week"
  dayOfMonth: number;         // 1-31, for "month"
  custom: string;             // for "custom"
}

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: String(h).padStart(2, "0") }));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, m) => ({ value: m, label: String(m).padStart(2, "0") }));
const MINUTE_INTERVAL_OPTIONS = [1, 2, 5, 10, 15, 20, 30];
const HOUR_INTERVAL_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

function defaultState(): BuilderState {
  return {
    kind: "day",
    minuteInterval: 5,
    hourInterval: 1,
    hour: 12,
    minute: 0,
    days: [1, 2, 3, 4, 5], // Mon-Fri
    dayOfMonth: 1,
    custom: "",
  };
}

function buildCron(s: BuilderState): string {
  const m = String(s.minute);
  const h = String(s.hour);
  switch (s.kind) {
    case "minute":
      return `*/${s.minuteInterval} * * * *`;
    case "hour":
      return `${m} */${s.hourInterval} * * *`;
    case "day":
      return `${m} ${h} * * *`;
    case "week": {
      const days = s.days.length > 0 ? [...s.days].sort((a, b) => a - b).join(",") : "*";
      return `${m} ${h} * * ${days}`;
    }
    case "month":
      return `${m} ${h} ${s.dayOfMonth} * *`;
    case "custom":
      return s.custom.trim();
  }
}

/**
 * Best-effort reverse-parsing. If the expression doesn't fit one of the
 * well-known patterns, returns null so we can show "Custom" mode.
 */
function parseCron(expr: string): Partial<BuilderState> | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts;
  if (mon !== "*") return null;

  // */N * * * *
  const mMin = m.match(/^\*\/(\d+)$/);
  if (mMin && h === "*" && dom === "*" && dow === "*") {
    return { kind: "minute", minuteInterval: clampInterval(parseInt(mMin[1], 10)) };
  }

  // M */N * * *
  const mMin1 = h.match(/^\*\/(\d+)$/);
  if (mMin1 && dom === "*" && dow === "*" && /^\d+$/.test(m)) {
    return {
      kind: "hour",
      hourInterval: clampInterval(parseInt(mMin1[1], 10), HOUR_INTERVAL_OPTIONS),
      minute: clamp(parseInt(m, 10), 0, 59),
    };
  }

  // M H * * *
  if (
    /^\d+$/.test(m) &&
    /^\d+$/.test(h) &&
    dom === "*" &&
    dow === "*"
  ) {
    return {
      kind: "day",
      minute: clamp(parseInt(m, 10), 0, 59),
      hour: clamp(parseInt(h, 10), 0, 23),
    };
  }

  // M H D * *
  if (
    /^\d+$/.test(m) &&
    /^\d+$/.test(h) &&
    /^\d+$/.test(dom) &&
    dow === "*"
  ) {
    return {
      kind: "month",
      minute: clamp(parseInt(m, 10), 0, 59),
      hour: clamp(parseInt(h, 10), 0, 23),
      dayOfMonth: clamp(parseInt(dom, 10), 1, 31),
    };
  }

  // M H * * D...  (single days, comma-list, or ranges like 1-5)
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === "*" && /^[0-6,\-*]+$/.test(dow)) {
    const daySet = new Set<number>();
    for (const part of dow.split(",")) {
      if (part.includes("-")) {
        const [a, b] = part.split("-").map((x) => parseInt(x, 10));
        if (!isNaN(a) && !isNaN(b)) {
          for (let i = a; i <= b; i++) daySet.add(i);
        }
      } else {
        const d = parseInt(part, 10);
        if (!isNaN(d)) daySet.add(d);
      }
    }
    if (daySet.size > 0) {
      return {
        kind: "week",
        minute: clamp(parseInt(m, 10), 0, 59),
        hour: clamp(parseInt(h, 10), 0, 23),
        days: [...daySet].sort((a, b) => a - b),
      };
    }
  }

  return null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function clampInterval(n: number, allowed: number[] = MINUTE_INTERVAL_OPTIONS) {
  return allowed.includes(n) ? n : 5;
}

interface Props {
  value: string;
  onChange: (cron: string) => void;
  timezone: string;
}

export default function CronBuilder({ value, onChange, timezone }: Props) {
  const [state, setState] = useState<BuilderState>(defaultState);

  // Parse incoming value -> state (only when external value changes meaningfully)
  const initialParsed = useMemo(() => parseCron(value), []);
  useEffect(() => {
    if (initialParsed && initialParsed.kind) {
      setState((cur) => ({ ...cur, ...initialParsed }));
    } else if (state.kind !== "custom") {
      setState((cur) => ({ ...cur, kind: "custom", custom: value }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // State -> cron
  useEffect(() => {
    const next = buildCron(state);
    if (next !== value) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function update<K extends keyof BuilderState>(k: K, v: BuilderState[K]) {
    setState((cur) => ({ ...cur, [k]: v }));
  }

  return (
    <Box>
      <Tabs.Root
        value={state.kind}
        onValueChange={(v) => update("kind", v as Kind)}
      >
        <Tabs.List>
          <Tabs.Trigger value="minute">Minute</Tabs.Trigger>
          <Tabs.Trigger value="hour">Hourly</Tabs.Trigger>
          <Tabs.Trigger value="day">Daily</Tabs.Trigger>
          <Tabs.Trigger value="week">Weekly</Tabs.Trigger>
          <Tabs.Trigger value="month">Monthly</Tabs.Trigger>
          <Tabs.Trigger value="custom">Custom</Tabs.Trigger>
        </Tabs.List>

        <Box mt="4">
          {state.kind === "minute" && (
            <Flex gap="3" align="center">
              <Text size="2">Every</Text>
              <Select.Root
                value={String(state.minuteInterval)}
                onValueChange={(v) => update("minuteInterval", parseInt(v, 10))}
              >
                <Select.Trigger />
                <Select.Content>
                  {MINUTE_INTERVAL_OPTIONS.map((n) => (
                    <Select.Item key={n} value={String(n)}>
                      {n} minute{n > 1 ? "s" : ""}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
          )}

          {state.kind === "hour" && (
            <Flex gap="3" align="center" wrap="wrap">
              <Text size="2">At minute</Text>
              <Select.Root
                value={String(state.minute)}
                onValueChange={(v) => update("minute", parseInt(v, 10))}
              >
                <Select.Trigger />
                <Select.Content>
                  {MINUTE_OPTIONS.map((m) => (
                    <Select.Item key={m.value} value={String(m.value)}>
                      {m.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <Text size="2">of every</Text>
              <Select.Root
                value={String(state.hourInterval)}
                onValueChange={(v) => update("hourInterval", parseInt(v, 10))}
              >
                <Select.Trigger />
                <Select.Content>
                  {HOUR_INTERVAL_OPTIONS.map((n) => (
                    <Select.Item key={n} value={String(n)}>
                      {n} hour{n > 1 ? "s" : ""}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
          )}

          {(state.kind === "day" || state.kind === "week" || state.kind === "month") && (
            <Flex gap="3" align="center" wrap="wrap" mb={state.kind === "week" ? "3" : undefined}>
              <Flex gap="2" align="center">
                <ClockIcon />
                <Text size="2">At</Text>
                <Select.Root
                  value={String(state.hour)}
                  onValueChange={(v) => update("hour", parseInt(v, 10))}
                >
                  <Select.Trigger style={{ width: 80 }} />
                  <Select.Content>
                    {HOUR_OPTIONS.map((h) => (
                      <Select.Item key={h.value} value={String(h.value)}>
                        {h.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Text size="2">:</Text>
                <Select.Root
                  value={String(state.minute)}
                  onValueChange={(v) => update("minute", parseInt(v, 10))}
                >
                  <Select.Trigger style={{ width: 80 }} />
                  <Select.Content>
                    {MINUTE_OPTIONS.map((m) => (
                      <Select.Item key={m.value} value={String(m.value)}>
                        {m.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Flex>
            </Flex>
          )}

          {state.kind === "week" && (
            <Flex direction="column" gap="2">
              <Text size="2" color="gray">On days</Text>
              <Flex gap="1" wrap="wrap">
                {DAY_LABELS.map((label, i) => {
                  const active = state.days.includes(i);
                  return (
                    <Button
                      key={i}
                      size="2"
                      variant={active ? "solid" : "soft"}
                      color={active ? undefined : "gray"}
                      onClick={() => {
                        const days = active
                          ? state.days.filter((d) => d !== i)
                          : [...state.days, i];
                        update("days", days);
                      }}
                      aria-pressed={active}
                      aria-label={label}
                    >
                      {label}
                    </Button>
                  );
                })}
              </Flex>
            </Flex>
          )}

          {state.kind === "month" && (
            <Flex gap="3" align="center">
              <Text size="2">On day</Text>
              <Select.Root
                value={String(state.dayOfMonth)}
                onValueChange={(v) => update("dayOfMonth", parseInt(v, 10))}
              >
                <Select.Trigger style={{ width: 80 }} />
                <Select.Content>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <Select.Item key={d} value={String(d)}>{d}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <Text size="2" color="gray">of the month</Text>
            </Flex>
          )}

          {state.kind === "custom" && (
            <Flex direction="column" gap="2">
              <Text size="2" color="gray">Cron expression</Text>
              <TextField.Root
                value={state.custom}
                onChange={(e) => update("custom", e.target.value)}
                placeholder="* * * * *"
                style={{ fontFamily: "monospace" }}
              />
              <Text size="1" color="gray">
                Standard 5-field syntax: <code>minute hour day-of-month month day-of-week</code>.
              </Text>
            </Flex>
          )}
        </Box>
      </Tabs.Root>

      <Box mt="4">
        <CronPreview cron={value} timezone={timezone} />
      </Box>
    </Box>
  );
}

function CronPreview({ cron, timezone }: { cron: string; timezone: string }) {
  const [runs, setRuns] = useState<string[]>([]);
  const [description, setDescription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!cron.trim()) {
      setRuns([]);
      setDescription("");
      setError(null);
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
    return () => {
      cancelled = true;
    };
  }, [cron, timezone]);

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          <Heading size="2">Preview</Heading>
          <Tooltip content="Computed via Croner in your timezone">
            <IconButton size="1" variant="ghost" color="gray" aria-label="info">
              <InfoCircledIcon />
            </IconButton>
          </Tooltip>
          {description ? (
            <Badge color="gray" variant="soft" style={{ marginLeft: "auto" }}>
              {description}
            </Badge>
          ) : null}
        </Flex>
        {error ? (
          <Text size="2" color="red">Invalid: {error}</Text>
        ) : runs.length === 0 ? (
          <Text size="2" color="gray">No upcoming runs.</Text>
        ) : (
          <Grid columns={{ initial: "1", sm: "2" }} gap="2">
            {runs.map((r, i) => {
              const d = new Date(r);
              return (
                <Flex key={i} gap="2" align="center" p="2" style={{ background: "var(--gray-2)", borderRadius: "var(--radius-2)" }}>
                  <Flex gap="2" align="center" style={{ minWidth: 100 }}>
                    <CalendarIcon />
                    <Text size="2" weight="medium">
                      {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                    </Text>
                  </Flex>
                  <Flex gap="2" align="center">
                    <ClockIcon />
                    <Text size="2">{d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</Text>
                  </Flex>
                </Flex>
              );
            })}
          </Grid>
        )}
        <Separator size="4" />
        <Flex gap="2" align="center">
          <Text size="1" color="gray">Cron:</Text>
          <Text size="1" style={{ fontFamily: "monospace" }}>{cron}</Text>
          <Text size="1" color="gray" style={{ marginLeft: "auto" }}>{timezone}</Text>
        </Flex>
      </Flex>
    </Card>
  );
}

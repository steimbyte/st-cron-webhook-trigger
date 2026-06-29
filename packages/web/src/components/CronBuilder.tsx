// CronBuilder — visual recurrence picker.
//
// Architecture (post-Phase-11):
//   - The cron *string* remains the single source of truth on the wire
//     (matches the existing Job.cronExpression contract in `packages/web/src/types.ts`).
//   - The internal state shape is `CronExpressionState` from
//     `@cronboard/core/scheduler/cronExpr` (extracted out of this file in
//     phase 11; behaviour preserved verbatim).
//   - Tabs: Minute / Hourly / Daily / Weekly / Monthly / Custom.
//   - Daily / Weekly / Monthly tabs use the new <Calendar /> + <Clock />
//     primitives for picking; intervals still use Radix Select.
//   - The <CronPreview /> panel at the bottom hits /api/cron/describe and
//     /api/cron/next on every change, just like before.

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
  Callout,
} from "@radix-ui/themes";
import { CalendarIcon, ClockIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { Calendar } from "./Calendar";
import { Clock, type ClockValue } from "./Clock";
import { GlassCard } from "./GlassCard";
import { api } from "../lib/api";
import {
  buildCron,
  parseCron,
  defaultCronState,
  MINUTE_INTERVAL_OPTIONS,
  HOUR_INTERVAL_OPTIONS,
  type CronExpressionState,
} from "@cronboard/core/scheduler/cronExpr";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface Props {
  value: string;
  onChange: (cron: string) => void;
  timezone: string;
}

export default function CronBuilder({ value, onChange, timezone }: Props) {
  const [state, setState] = useState<CronExpressionState>(() => defaultCronState());

  // Parse incoming value -> state (only on mount and when value changes meaningfully).
  useEffect(() => {
    const parsed = parseCron(value);
    if (parsed && parsed.kind) {
      setState((cur) => ({ ...cur, ...parsed, custom: value }));
    } else {
      setState((cur) => ({ ...cur, kind: "custom", custom: value }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State -> cron string (only when on the structural tabs; custom tab is
  // driven directly by the TextField so we don't fight the user's typing).
  useEffect(() => {
    if (state.kind === "custom") return;
    const next = buildCron(state);
    if (next !== value) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function update<K extends keyof CronExpressionState>(k: K, v: CronExpressionState[K]) {
    setState((cur) => ({ ...cur, [k]: v }));
  }

  const timeValue: ClockValue = { hour: state.hour, minute: state.minute };
  const onTimeChange = (t: ClockValue) => {
    setState((cur) => ({ ...cur, hour: t.hour, minute: t.minute }));
  };

  return (
    <GlassCard>
      <Tabs.Root
        value={state.kind}
        onValueChange={(v) => update("kind", v as CronExpressionState["kind"])}
      >
        <Tabs.List className="cb-cronbuilder-tabs">
          <Tabs.Trigger value="minute">Minute</Tabs.Trigger>
          <Tabs.Trigger value="hour">Hourly</Tabs.Trigger>
          <Tabs.Trigger value="day">Daily</Tabs.Trigger>
          <Tabs.Trigger value="week">Weekly</Tabs.Trigger>
          <Tabs.Trigger value="month">Monthly</Tabs.Trigger>
          <Tabs.Trigger value="custom">Custom</Tabs.Trigger>
        </Tabs.List>

        <Box mt="4">
          {state.kind === "minute" && (
            <Flex gap="3" align="center" wrap="wrap">
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
              <Text size="1" color="gray">— every N minutes on the clock.</Text>
            </Flex>
          )}

          {state.kind === "hour" && (
            <Flex gap="3" align="center" wrap="wrap">
              <Text size="2">At</Text>
              <Clock value={{ hour: 0, minute: state.minute }} onChange={(t) => update("minute", t.minute)} label="Pick a minute" />
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
              <Text size="2"><ClockIcon style={{ verticalAlign: "middle" }} /> At</Text>
              <Clock value={timeValue} onChange={onTimeChange} label="Pick a time" timezone={timezone} />
            </Flex>
          )}

          {state.kind === "week" && (
            <Flex direction="column" gap="2">
              <Flex gap="2" align="center" wrap="wrap">
                <Text size="2" color="gray">On days</Text>
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
                          : [...state.days, i].sort((a, b) => a - b);
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
              <Text size="1" color="gray">
                Tap a day to toggle. The Weekly tab also exposes a Calendar below for picking a reference date.
              </Text>
              <Flex gap="2" align="center" wrap="wrap">
                <Text size="2" color="gray">Reference date:</Text>
                <Calendar
                  value={null}
                  onChange={() => {
                    /* Calendar here is informational; weekday selection above is the source of truth. */
                  }}
                  label="Pick a reference date"
                  timezone={timezone}
                />
              </Flex>
            </Flex>
          )}

          {state.kind === "month" && (
            <Flex direction="column" gap="2">
              <Flex gap="3" align="center" wrap="wrap">
                <Text size="2">On day</Text>
                <Select.Root
                  value={String(state.dayOfMonth)}
                  onValueChange={(v) => update("dayOfMonth", parseInt(v, 10))}
                >
                  <Select.Trigger style={{ width: 100 }} />
                  <Select.Content>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <Select.Item key={d} value={String(d)}>{d}</Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Text size="2" color="gray">of the month.</Text>
              </Flex>
              <Flex gap="2" align="center" wrap="wrap">
                <Text size="2" color="gray">Calendar (informational):</Text>
                <Calendar
                  value={null}
                  onChange={() => {
                    /* Calendar here is informational; day-of-month above is the source of truth. */
                  }}
                  label="Pick a day of the month"
                  timezone={timezone}
                />
              </Flex>
            </Flex>
          )}

          {state.kind === "custom" && (
            <Flex direction="column" gap="2">
              <Text size="2" color="gray">Cron expression</Text>
              <TextField.Root
                value={state.custom}
                onChange={(e) => {
                  update("custom", e.target.value);
                  onChange(e.target.value.trim());
                }}
                placeholder="* * * * *"
                style={{ fontFamily: "monospace" }}
              />
              <Callout.Root color="gray" size="1">
                <Callout.Text>
                  Standard 5-field cron: <code>minute hour day-of-month month day-of-week</code>.
                  <br />
                  <code>?</code> is not supported — use <code>*</code>.
                </Callout.Text>
              </Callout.Root>
            </Flex>
          )}
        </Box>
      </Tabs.Root>

      <Box mt="4">
        <CronPreview cron={value} timezone={timezone} />
      </Box>
    </GlassCard>
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
    <Card className="cb-glass">
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

// Keep useMemo import live in case future code paths need it (TS strict).
void useMemo;

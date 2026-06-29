// Clock — controlled HH:MM time picker. Wraps `react-aria-components`
// `TimeField` inside a `@radix-ui/react-popover` so the trigger button is
// the anchor and the segmented input opens in a focus-trapped layer.
//
// `react-aria-components` provides:
//   - Tab/Shift+Tab between hour and minute segments
//   - ArrowUp/ArrowDown to increment by 1
//   - PageUp/PageDown to increment by 10
//   - Home/End to jump to min/max
//   - Direct digit typing
// Plus full screen-reader announcements and `role="spinbutton"` per segment.
//
// The 12/24h toggle persists in `localStorage` per-user; the canonical
// value is always a 24-hour `{ hour: 0..23, minute: 0..59 }` pair so the
// caller (CronBuilder) doesn't have to know the user's display preference.

import { useEffect, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { TimeField, Label, DateInput, DateSegment } from "react-aria-components";
import { Time } from "@internationalized/date";

import { Box, Button, Flex, Text, Switch, IconButton } from "@radix-ui/themes";
import { ClockIcon, Cross2Icon } from "@radix-ui/react-icons";

export interface ClockValue {
  hour: number;   // 0-23
  minute: number; // 0-59
}

export interface ClockProps {
  value: ClockValue;
  onChange: (next: ClockValue) => void;
  hour12?: boolean;          // Optional override; if omitted, persisted user pref.
  label?: string;
  timezone?: string;         // For the footer caption.
}

const STORAGE_KEY = "cronboard:clock-hour12";

function readPref(defaultPref: boolean): boolean {
  if (typeof localStorage === "undefined") return defaultPref;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "1") return true;
  if (v === "0") return false;
  return defaultPref;
}

function writePref(v: boolean) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Convert our flat {hour, minute} to react-aria's `Time`. */
function toTimeValue(v: ClockValue): Time {
  return new Time(v.hour, v.minute);
}

/** Convert react-aria's `Time` back to our flat {hour, minute}. */
function fromTimeValue(t: Time | null | undefined): ClockValue | null {
  if (!t) return null;
  return { hour: t.hour, minute: t.minute };
}

export function Clock({ value, onChange, hour12, label, timezone }: ClockProps) {
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<boolean>(() => readPref(false));
  const resolved = hour12 ?? pref;

  useEffect(() => {
    if (hour12 === undefined) writePref(pref);
  }, [pref, hour12]);

  const displayHour =
    resolved && value.hour > 12
      ? value.hour - 12
      : resolved && value.hour === 0
        ? 12
        : value.hour;
  const ampm = value.hour >= 12 ? "PM" : "AM";
  const triggerLabel = `${pad(displayHour)}:${pad(value.minute)}${resolved ? ` ${ampm}` : ""}`;

  const timeValue = useMemo(() => toTimeValue(value), [value]);

  function handleTimeChange(next: Time | null) {
    const flat = fromTimeValue(next);
    if (flat) onChange(flat);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="soft"
          color="gray"
          aria-label={label ?? "Pick a time"}
          aria-haspopup="dialog"
        >
          <Flex gap="2" align="center">
            <ClockIcon />
            <Text size="2" style={{ fontVariantNumeric: "tabular-nums" }}>
              {triggerLabel}
            </Text>
          </Flex>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          style={{ zIndex: 50 }}
        >
          <Box className="cb-glass-strong" p="4">
            <TimeField
              value={timeValue}
              onChange={handleTimeChange}
              hourCycle={resolved ? 12 : 24}
            >
              <Label style={{ display: "none" }}>{label ?? "Pick a time"}</Label>
              <DateInput className="cb-timefield">
                {(segment) => (
                  <DateSegment segment={segment} className="cb-timefield-segment" />
                )}
              </DateInput>
            </TimeField>
            <Flex justify="between" align="center" mt="3" gap="3">
              <Flex align="center" gap="2">
                <Text size="1" color="gray">24h</Text>
                <Switch
                  checked={resolved}
                  onCheckedChange={(v) => setPref(!!v)}
                  size="1"
                />
                <Text size="1" color="gray">12h</Text>
              </Flex>
              <Flex gap="1">
                <Button
                  size="1"
                  variant="ghost"
                  color="gray"
                  onClick={() => {
                    const now = new Date();
                    const minute = Math.floor(now.getMinutes() / 5) * 5;
                    onChange({ hour: now.getHours(), minute });
                    setOpen(false);
                  }}
                >
                  Now
                </Button>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <Cross2Icon />
                </IconButton>
              </Flex>
            </Flex>
            {timezone ? (
              <Flex justify="end" mt="1">
                <Text size="1" color="gray">{timezone}</Text>
              </Flex>
            ) : null}
          </Box>
          <Popover.Arrow style={{ fill: "var(--cb-glass-border)" }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

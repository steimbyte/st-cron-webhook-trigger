// Calendar — controlled date picker. Wraps `react-day-picker` v9 inside a
// `@radix-ui/react-popover` so the trigger button is the anchor and the
// grid opens in a focus-trapped, dismissable layer.
//
// The component is timezone-aware via an IANA `timezone` prop; the trigger
// label uses `formatInTimeZone` so the same Date renders consistently
// regardless of the user's browser locale. The picked Date is always a
// native `Date` — the caller (CronBuilder) is responsible for any
// timezone-aware math.

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { Box, Button, Flex, Text, IconButton } from "@radix-ui/themes";
import { CalendarIcon, Cross2Icon } from "@radix-ui/react-icons";

/**
 * Format a date in the given IANA timezone using `Intl.DateTimeFormat` so we
 * don't need `date-fns-tz` (or v4's `formatInTimeZone`). The result mirrors
 * "EEE d MMM yyyy" — e.g. "Mon 2 Jun 2026".
 */
function formatInTimeZoneIntl(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: tz,
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export interface CalendarProps {
  /** Selected date in the user's timezone. `null` means "not yet picked". */
  value: Date | null;
  /** Fired with a Date when the user picks (or clears) a date. */
  onChange: (date: Date | null) => void;
  /** Earliest selectable date (inclusive). Optional. */
  minDate?: Date;
  /** Latest selectable date (inclusive). Optional. */
  maxDate?: Date;
  /** Trigger button label override. */
  label?: string;
  /** IANA timezone for the trigger label. Defaults to browser. */
  timezone?: string;
  /** Optional date used as the "initial month" when value is null. */
  defaultMonth?: Date;
}

export function Calendar({
  value,
  onChange,
  minDate,
  maxDate,
  label,
  timezone,
  defaultMonth,
}: CalendarProps) {
  const [open, setOpen] = useState(false);

  const tz = timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
  const displayValue = value
    ? formatInTimeZoneIntl(value, tz)
    : (label ?? "Pick a date");

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="soft"
          color={value ? undefined : "gray"}
          aria-label={label ?? "Pick a date"}
          aria-haspopup="dialog"
        >
          <Flex gap="2" align="center">
            <CalendarIcon />
            <Text size="2">{displayValue}</Text>
          </Flex>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          style={{ zIndex: 50 }}
        >
          <Box className="cb-glass-strong" p="3">
            <DayPicker
              mode="single"
              selected={value ?? undefined}
              onSelect={(d) => {
                onChange(d ?? null);
                setOpen(false);
              }}
              showOutsideDays
              weekStartsOn={1}
              disabled={(d) => {
                if (minDate && d < minDate) return true;
                if (maxDate && d > maxDate) return true;
                return false;
              }}
              defaultMonth={defaultMonth ?? value ?? new Date()}
            />
            <Flex justify="between" align="center" mt="2" gap="2">
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => {
                  onChange(new Date());
                  setOpen(false);
                }}
              >
                Today
              </Button>
              {value ? (
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label="Clear date"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Cross2Icon />
                </IconButton>
              ) : null}
            </Flex>
            <Flex justify="end" mt="1">
              <Text size="1" color="gray">
                {tz}
              </Text>
            </Flex>
          </Box>
          <Popover.Arrow style={{ fill: "var(--cb-glass-border)" }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

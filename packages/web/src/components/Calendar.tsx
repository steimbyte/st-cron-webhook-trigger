// Calendar — controlled date picker. Wraps `react-day-picker` v9 inside a
// `@radix-ui/react-popover` so the trigger button is the anchor and the
// grid opens in a focus-trapped, dismissable layer.
//
// Supports two modes:
//   - "single": pick one date; emits Date | null via onChange.
//   - "multiple": pick N dates (used by the Weekly tab to toggle weekdays
//     by clicking dates); emits Date[] | [] via onMultiChange.
//
// All timezone-aware logic lives in `@cronboard/core/scheduler/cronExpr`
// (`weekdayInTimezone`, `dayOfMonthInTimezone`); this component just
// renders the picker and forwards clicks.

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import "react-day-picker/style.css";

import { Box, Button, Flex, Text, IconButton } from "@radix-ui/themes";
import { CalendarIcon, Cross2Icon } from "@radix-ui/react-icons";

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

export type CalendarMode = "single" | "multiple";

interface CommonProps {
  minDate?: Date;
  maxDate?: Date;
  triggerLabel?: string;
  timezone?: string;
  defaultMonth?: Date;
  disabled?: boolean;
}

export interface CalendarSingleProps extends CommonProps {
  mode?: "single";
  value: Date | null;
  onChange: (date: Date | null) => void;
}

export interface CalendarMultipleProps extends CommonProps {
  mode: "multiple";
  multiValue: Date[];
  onMultiChange: (dates: Date[]) => void;
}

export type CalendarProps = CalendarSingleProps | CalendarMultipleProps;

export function Calendar(props: CalendarProps) {
  const tz =
    props.timezone ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC");
  const isMulti = props.mode === "multiple";

  const [open, setOpen] = useState(false);

  let displayValue: string;
  if (isMulti) {
    const n = props.multiValue.length;
    displayValue = n === 0
      ? (props.triggerLabel ?? "Pick dates")
      : `${n} date${n === 1 ? "" : "s"} selected`;
  } else {
    displayValue = props.value
      ? formatInTimeZoneIntl(props.value, tz)
      : (props.triggerLabel ?? "Pick a date");
  }

  // DayPicker's discriminated props: in multi-mode `selected` is required and
  // typed Date[]; in single-mode it's optional Date. We branch the props so TS
  // narrows correctly without an `any` cast.
  const isDisabled = (d: Date): boolean => {
    if (props.minDate && d < props.minDate) return true;
    if (props.maxDate && d > props.maxDate) return true;
    return false;
  };

  const dayPickerProps: DayPickerProps =
    props.mode === "multiple"
      ? {
          mode: "multiple" as const,
          selected: props.multiValue,
          required: false,
          onSelect: (d: Date[] | undefined) => {
            props.onMultiChange(d ?? []);
          },
          showOutsideDays: true,
          weekStartsOn: 1,
          disabled: isDisabled,
          defaultMonth: props.defaultMonth ?? new Date(),
        }
      : {
          mode: "single" as const,
          selected: props.value ?? undefined,
          onSelect: (d: Date | undefined) => {
            props.onChange(d ?? null);
            setOpen(false);
          },
          showOutsideDays: true,
          weekStartsOn: 1,
          disabled: isDisabled,
          defaultMonth: props.defaultMonth ?? props.value ?? new Date(),
        };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="soft"
          color={(isMulti ? props.multiValue.length > 0 : !!props.value) ? undefined : "gray"}
          aria-label={props.triggerLabel ?? (isMulti ? "Pick dates" : "Pick a date")}
          aria-haspopup="dialog"
          disabled={props.disabled}
        >
          <Flex gap="2" align="center">
            <CalendarIcon />
            <Text size="2">{displayValue}</Text>
          </Flex>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} style={{ zIndex: 50 }}>
          <Box className="cb-glass-strong" p="3">
            <DayPicker {...dayPickerProps} />
            <Flex justify="between" align="center" mt="2" gap="2">
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => {
                  if (props.mode === "multiple") {
                    props.onMultiChange([new Date()]);
                  } else {
                    props.onChange(new Date());
                    setOpen(false);
                  }
                }}
              >
                Today
              </Button>
              {((props.mode === "multiple" && props.multiValue.length > 0) ||
                (props.mode !== "multiple" && props.value)) ? (
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label="Clear"
                  onClick={() => {
                    if (props.mode === "multiple") {
                      props.onMultiChange([]);
                    } else {
                      props.onChange(null);
                      setOpen(false);
                    }
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
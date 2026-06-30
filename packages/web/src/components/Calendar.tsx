// CalendarIcon — controlled date picker. Wraps `react-day-picker` v9 in a small
// inline panel. For the CronBuilder use case we just render the picker
// directly under the trigger button (no popover needed in v0.2 — keeps the
// build smaller and the UX simpler for power users).

import { useState } from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import "react-day-picker/style.css";

interface CommonProps {
  triggerLabel?: string;
  timezone?: string;
  defaultMonth?: Date;
  className?: string;
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

function formatInTimeZoneIntl(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: tz,
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function Calendar(props: CalendarProps) {
  const isMulti = props.mode === "multiple";
  const [open, setOpen] = useState(true); // open by default — popover-less design

  let display: string;
  if (isMulti) {
    const n = props.multiValue.length;
    display = n === 0 ? (props.triggerLabel ?? "Pick dates")
      : `${n} date${n === 1 ? "" : "s"} selected · ${props.timezone ?? "local"}`;
  } else {
    display = props.value ? formatInTimeZoneIntl(props.value, props.timezone ?? "UTC")
      : (props.triggerLabel ?? "Pick a date");
  }

  const isDisabled = (_d: Date) => false;

  const dayPickerProps: DayPickerProps =
    props.mode === "multiple"
      ? {
          mode: "multiple" as const,
          selected: props.multiValue,
          required: false,
          onSelect: (d: Date[] | undefined) => { props.onMultiChange(d ?? []); },
          showOutsideDays: true,
          weekStartsOn: 1,
          disabled: isDisabled,
          defaultMonth: props.defaultMonth ?? new Date(),
        }
      : {
          mode: "single" as const,
          selected: props.value ?? undefined,
          onSelect: (d: Date | undefined) => { props.onChange(d ?? null); setOpen(false); },
          showOutsideDays: true,
          weekStartsOn: 1,
          disabled: isDisabled,
          defaultMonth: props.defaultMonth ?? props.value ?? new Date(),
        };

  return (
    <div className={"space-y-2 " + (props.className ?? "")}>
      <div className="text-sm font-medium text-base-content/80">{display}</div>
      {open && (
        <div className="rdp-wrapper inline-block rounded-box bg-base-200/60 border border-base-300/60 p-2">
          <DayPicker {...dayPickerProps} />
        </div>
      )}
    </div>
  );
}
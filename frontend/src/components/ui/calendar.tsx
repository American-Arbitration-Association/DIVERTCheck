//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import * as React from "react";
import {
  DayPicker,
  type ChevronProps,
  type DayButtonProps,
} from "react-day-picker";

import { cn } from "@/lib/utils";

type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CalendarDayButton(props: DayButtonProps) {
  const { className, modifiers, ...buttonProps } = props;
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) {
      ref.current?.focus();
    }
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      {...buttonProps}
      className={cn(
        className,
        "case-range-day-button",
        modifiers.selected && "case-range-day-button--selected",
      )}
    />
  );
}

function CalendarChevron({
  orientation,
  className,
  ...iconProps
}: ChevronProps) {
  return orientation === "left" ? (
    <IconChevronLeft
      {...iconProps}
      className={cn("size-4 text-[#272423]", className)}
    />
  ) : (
    <IconChevronRight
      {...iconProps}
      className={cn("size-4 text-[#272423]", className)}
    />
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      navLayout="around"
      showOutsideDays={showOutsideDays}
      className={cn("case-range-calendar", className)}
      classNames={{
        months: "case-range-months",
        month: "case-range-month",
        month_caption: "case-range-month-caption",
        caption_label: "case-range-caption-label",
        nav: "case-range-nav",
        button_previous: "case-range-nav-button case-range-nav-button--prev",
        button_next: "case-range-nav-button case-range-nav-button--next",
        month_grid: "case-range-month-grid",
        weekdays: "case-range-weekdays",
        weekday: "case-range-weekday",
        week: "case-range-week",
        day: "case-range-day",
        day_button: "case-range-day-button",
        selected: "",
        range_start: "",
        range_end: "",
        range_middle: "",
        today: "case-range-day--today",
        outside: "case-range-day--outside",
        disabled: "case-range-day--disabled",
        hidden: "case-range-day--hidden",
        ...classNames,
      }}
      components={{
        DayButton: CalendarDayButton,
        Chevron: CalendarChevron,
      }}
      {...props}
    />
  );
}

export { Calendar };

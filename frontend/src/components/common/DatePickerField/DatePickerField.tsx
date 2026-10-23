//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { IconCalendarEvent } from "@tabler/icons-react";
import { format } from "date-fns";
import * as React from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DateIconComponent = React.ComponentType<{
  className?: string;
  size?: number;
}>;

interface DatePickerFieldProps {
  ariaLabel?: string;
  className?: string;
  date?: string;
  disabled?: boolean;
  icon?: DateIconComponent;
  id?: string;
  label?: string;
  onDateChange: (date: string) => void;
  placeholder?: string;
  testId?: string;
}

export default function DatePickerField({
  ariaLabel,
  className,
  date,
  disabled = false,
  icon: Icon = IconCalendarEvent,
  id,
  label,
  onDateChange,
  placeholder = "mm/dd/yyyy",
  testId,
}: DatePickerFieldProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedDate = React.useMemo(
    () => (date ? new Date(`${date}T00:00:00`) : undefined),
    [date],
  );
  const formattedDate = selectedDate
    ? format(selectedDate, "MM/dd/yyyy")
    : placeholder;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          aria-label={ariaLabel ?? label}
          data-qaautomationid={testId}
          className={`flex h-11 w-full items-center justify-start gap-2 rounded-lg border border-[#C1BAB8] bg-white px-3 py-2 text-left text-sm leading-5 text-[#272423] outline-none transition placeholder:text-[#78716C] focus:border-[#01579b] focus:shadow-[0_0_0_1px_rgba(1,87,155,0.12)] disabled:cursor-not-allowed disabled:bg-[#f7f6f5] disabled:text-[#8f8583] ${className ?? ""}`}
          type="button"
          disabled={disabled}
        >
          <Icon size={16} className="shrink-0 text-[#574e4d]" />
          <span className={selectedDate ? "text-[#272423]" : "text-[#78716C]"}>
            {formattedDate}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="case-range-popover w-auto p-0"
        align="start"
        data-qaautomationid={testId ? `${testId}-popover` : undefined}
      >
        <Calendar
          className="case-range-picker"
          mode="single"
          defaultMonth={selectedDate}
          selected={selectedDate}
          onSelect={(selected) => {
            if (!selected) {
              onDateChange("");
              setIsOpen(false);
              return;
            }

            onDateChange(format(selected, "yyyy-MM-dd"));
            setIsOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import * as React from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, toTestIdSegment } from "@/lib/utils";

export interface SelectDropdownOption {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
}

interface SelectDropdownProps {
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  id?: string;
  testId?: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  options: SelectDropdownOption[];
  value: string;
}

export default function SelectDropdown({
  className,
  contentClassName,
  disabled = false,
  id,
  testId,
  onChange,
  onEnter,
  options,
  value,
}: SelectDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0];
  const triggerLabel = selectedOption?.label ?? value;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          data-qaautomationid={testId}
          type="button"
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || isOpen || !onEnter) {
              return;
            }

            event.preventDefault();
            onEnter();
          }}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-3 rounded-[12px] border border-[#c9c2bf] bg-white px-3 text-left text-sm leading-5 text-[#272423] outline-none transition hover:border-[#a89f9d] focus:border-[#01579b] focus:shadow-[0_0_0_1px_rgba(1,87,155,0.12)] disabled:cursor-not-allowed disabled:bg-[#f7f6f5] disabled:text-[#8f8583]",
            className,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <IconChevronDown
            size={16}
            stroke={1.8}
            className="shrink-0 text-[#272423]"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[14px] border border-[#d8d2d0] bg-white p-0 shadow-[0_24px_60px_rgba(39,36,35,0.18)]",
          contentClassName,
        )}
      >
        <div className="max-h-64 overflow-y-auto">
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                data-qaautomationid={
                  testId
                    ? `${testId}-option-${toTestIdSegment(option.value)}`
                    : undefined
                }
                disabled={option.disabled}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm leading-5 transition-colors hover:bg-[#f7f4f3]",
                  isSelected ? "bg-[#f3f1f0]" : "bg-white",
                  option.disabled &&
                    "cursor-not-allowed opacity-50 hover:bg-white",
                )}
                onClick={() => {
                  if (option.disabled) {
                    return;
                  }

                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {isSelected ? <IconCheck size={14} stroke={2.2} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-[#272423]">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

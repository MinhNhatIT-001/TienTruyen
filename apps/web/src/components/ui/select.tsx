"use client";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

type Option = { value: string; label: string; disabled?: boolean };
export function Select({
  value,
  onValueChange,
  options,
  label,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger className="ui-select-trigger" aria-label={label}>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          align="start"
          sideOffset={5}
          collisionPadding={8}
        >
          <SelectPrimitive.ScrollUpButton className="ui-select-scroll">
            <ChevronUp size={16} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                className="ui-select-item"
                value={option.value}
                disabled={option.disabled}
                key={option.value}
              >
                <SelectPrimitive.ItemIndicator className="ui-select-indicator">
                  <Check size={15} />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="ui-select-scroll">
            <ChevronDown size={16} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

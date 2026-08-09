export type SelectValue = string | number;

export interface SelectOption {
  label: string;
  value: SelectValue;
  disabled?: boolean;
}

export type { OptionAccessor, OptionSlotProps } from "@/utils/options";

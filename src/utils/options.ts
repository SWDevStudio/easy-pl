export type OptionAccessor<TOption, TResult> = keyof TOption | ((option: TOption) => TResult);

export interface OptionSlotProps<TOption> {
  value: TOption;
  selected: boolean;
  index: number;
}

const FALLBACK_LABEL_KEYS = ["label", "name", "title", "caption"];

function isPlainRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null;
}

function read<TOption>(option: TOption, accessor: OptionAccessor<TOption, unknown>): unknown {
  return typeof accessor === "function" ? accessor(option) : option[accessor];
}

export function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isPlainRecord(a) || !isPlainRecord(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;

  return keys.every((key) => isSameValue(a[key], b[key]));
}

export function resolveOptionValue<TOption>(
  option: TOption,
  accessor?: OptionAccessor<TOption, unknown>,
): unknown {
  return accessor === undefined ? option : read(option, accessor);
}

export function resolveOptionLabel<TOption>(
  option: TOption,
  accessor?: OptionAccessor<TOption, unknown>,
): string {
  const resolved = accessor === undefined ? findFallbackLabel(option) : read(option, accessor);

  return resolved == null ? "" : String(resolved);
}

export function resolveOptionDisabled<TOption>(
  option: TOption,
  accessor?: OptionAccessor<TOption, unknown>,
): boolean {
  if (accessor !== undefined) return Boolean(read(option, accessor));

  return isPlainRecord(option) && Boolean(option.disabled);
}

function findFallbackLabel(option: unknown): unknown {
  if (!isPlainRecord(option)) return option;

  const key = FALLBACK_LABEL_KEYS.find((candidate) => {
    const found = option[candidate];
    return typeof found === "string" || typeof found === "number";
  });

  return key === undefined ? option : option[key];
}

export interface OptionAccessors<TOption> {
  optionValue?: OptionAccessor<TOption, unknown>;
  optionLabel?: OptionAccessor<TOption, unknown>;
  optionDisabled?: OptionAccessor<TOption, unknown>;
}

export function createOptionResolvers<TOption>(accessors: OptionAccessors<TOption>) {
  return {
    getValue: (option: TOption) => resolveOptionValue(option, accessors.optionValue),
    getLabel: (option: TOption) => resolveOptionLabel(option, accessors.optionLabel),
    isDisabled: (option: TOption) => resolveOptionDisabled(option, accessors.optionDisabled),
  };
}

export function getOptionKey(value: unknown, index: number): string | number {
  return isPlainRecord(value) ? index : String(value);
}

<script setup lang="ts" generic="TOption">
import { computed, ref, useAttrs, useId, useTemplateRef } from "vue";
import { onClickOutside } from "@vueuse/core";
import { useField } from "vee-validate";
import FormField from "./FormField.vue";
import { useDropdownPanel } from "@/composables/useDropdownPanel";
import { cn, omitClass } from "@/utils/cn";
import { createOptionResolvers, getOptionKey, isSameValue, type OptionAccessor } from "@/utils/options";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    name: string;
    options: TOption[];
    label?: string;
    hint?: string;
    placeholder?: string;
    disabled?: boolean;
    fieldClass?: string;
    menuClass?: string;
    badgeClass?: string;
    optionValue?: OptionAccessor<TOption, unknown>;
    optionLabel?: OptionAccessor<TOption, unknown>;
    optionDisabled?: OptionAccessor<TOption, unknown>;
  }>(),
  { placeholder: "Выберите значения" },
);

defineSlots<{
  default?: (props: { value: TOption; selected: boolean; index: number }) => unknown;
  selected?: (props: { value: TOption; index: number }) => unknown;
  placeholder?: () => unknown;
  empty?: () => unknown;
}>();

const attrs = useAttrs();
const controlAttrs = computed(() => omitClass(attrs));

const inputId = useId();
const root = useTemplateRef<HTMLElement>("root");
const panel = useTemplateRef<HTMLElement>("panel");
const isOpen = ref(false);

const { target, style, resolveTarget } = useDropdownPanel(root);

const { value, errorMessage, handleBlur } = useField<unknown[]>(() => props.name, undefined, {
  initialValue: [],
});

const { getValue, getLabel, isDisabled } = createOptionResolvers<TOption>(props);

const selectedOptions = computed(() => props.options.filter(isSelected));

function isSelected(option: TOption) {
  return (value.value ?? []).some((item) => isSameValue(item, getValue(option)));
}

function toggleOption(option: TOption) {
  if (isDisabled(option)) return;

  const current = value.value ?? [];
  const optionValue = getValue(option);

  value.value = isSelected(option)
    ? current.filter((item) => !isSameValue(item, optionValue))
    : [...current, optionValue];
}

function toggle() {
  if (props.disabled) return;

  if (isOpen.value) {
    close();
    return;
  }

  resolveTarget();
  isOpen.value = true;
}

function close() {
  if (!isOpen.value) return;

  isOpen.value = false;
  handleBlur();
}

onClickOutside(root, close, { ignore: [panel] });
</script>

<template>
  <FormField :input-id="inputId" :label="label" :hint="hint" :error="errorMessage" :class="fieldClass">
    <div ref="root" class="relative w-full" @keydown.esc="close">
      <button
        v-bind="controlAttrs"
        :id="inputId"
        type="button"
        :class="
          cn(
            'input h-auto min-h-10 w-full flex-wrap justify-start gap-1 py-1',
            errorMessage && 'input-error',
            attrs.class,
          )
        "
        :disabled="disabled"
        @click="toggle"
      >
        <span
          v-for="(option, index) in selectedOptions"
          :key="getOptionKey(getValue(option), index)"
          :class="cn('badge badge-neutral', badgeClass)"
        >
          <slot name="selected" :value="option" :index="index">
            <slot :value="option" :selected="true" :index="index">
              {{ getLabel(option) }}
            </slot>
          </slot>
        </span>

        <span v-if="!selectedOptions.length" class="text-muted">
          <slot name="placeholder">{{ placeholder }}</slot>
        </span>
      </button>

      <Teleport :to="target">
        <div
          v-if="isOpen"
          ref="panel"
          :style="style"
          :class="
            cn(
              'border-primary/30 bg-base-100 rounded-box z-100 overflow-hidden border shadow-2xl',
              menuClass,
            )
          "
          @keydown.esc="close"
        >
          <ul class="menu divide-primary/10 max-h-full w-full flex-nowrap divide-y overflow-y-auto p-1">
            <li v-for="(option, index) in options" :key="getOptionKey(getValue(option), index)">
              <label class="hover:bg-base-300 cursor-pointer justify-start gap-2 rounded-none">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  :checked="isSelected(option)"
                  :disabled="isDisabled(option)"
                  @change="toggleOption(option)"
                />
                <slot :value="option" :selected="isSelected(option)" :index="index">
                  {{ getLabel(option) }}
                </slot>
              </label>
            </li>

            <li v-if="!options.length" class="text-muted px-3 py-3 text-sm">
              <slot name="empty">Нет доступных значений</slot>
            </li>
          </ul>
        </div>
      </Teleport>
    </div>
  </FormField>
</template>

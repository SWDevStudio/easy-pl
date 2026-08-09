<script setup lang="ts" generic="TOption">
import { computed, useAttrs, useId } from "vue";
import { useField } from "vee-validate";
import FormField from "./FormField.vue";
import UiSelect from "@/components/ui/UiSelect.vue";
import { omitClass } from "@/utils/cn";
import type { OptionAccessor } from "@/utils/options";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    name: string;
    options: TOption[];
    label?: string;
    hint?: string;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    fieldClass?: string;
    menuClass?: string;
    optionValue?: OptionAccessor<TOption, unknown>;
    optionLabel?: OptionAccessor<TOption, unknown>;
    optionDisabled?: OptionAccessor<TOption, unknown>;
  }>(),
  { placeholder: "Выберите значение", searchPlaceholder: "Поиск..." },
);

defineSlots<{
  default?: (props: { value: TOption; selected: boolean; index: number }) => unknown;
  selected?: (props: { value: TOption }) => unknown;
  placeholder?: () => unknown;
  empty?: () => unknown;
}>();

const attrs = useAttrs();
const controlAttrs = computed(() => omitClass(attrs));

const inputId = useId();
const { value, errorMessage, handleBlur } = useField<unknown>(() => props.name);
</script>

<template>
  <FormField :input-id="inputId" :label="label" :hint="hint" :error="errorMessage" :class="fieldClass">
    <UiSelect
      v-bind="controlAttrs"
      :id="inputId"
      v-model="value"
      :options="options"
      :placeholder="placeholder"
      :disabled="disabled"
      :invalid="Boolean(errorMessage)"
      :clearable="clearable"
      :searchable="searchable"
      :search-placeholder="searchPlaceholder"
      :menu-class="menuClass"
      :option-value="optionValue"
      :option-label="optionLabel"
      :option-disabled="optionDisabled"
      :class="attrs.class"
      @blur="handleBlur"
    >
      <template v-if="$slots.default" #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
      <template v-if="$slots.selected" #selected="slotProps">
        <slot name="selected" v-bind="slotProps" />
      </template>
      <template v-if="$slots.placeholder" #placeholder>
        <slot name="placeholder" />
      </template>
      <template v-if="$slots.empty" #empty>
        <slot name="empty" />
      </template>
    </UiSelect>
  </FormField>
</template>

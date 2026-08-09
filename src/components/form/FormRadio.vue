<script setup lang="ts" generic="TOption">
import { computed, useAttrs, useId } from "vue";
import { useField } from "vee-validate";
import FormField from "./FormField.vue";
import { cn, omitClass } from "@/utils/cn";
import { createOptionResolvers, getOptionKey, isSameValue, type OptionAccessor } from "@/utils/options";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  name: string;
  options: TOption[];
  label?: string;
  hint?: string;
  disabled?: boolean;
  inline?: boolean;
  fieldClass?: string;
  optionValue?: OptionAccessor<TOption, unknown>;
  optionLabel?: OptionAccessor<TOption, unknown>;
  optionDisabled?: OptionAccessor<TOption, unknown>;
}>();

defineSlots<{
  default?: (props: { value: TOption; selected: boolean; index: number }) => unknown;
}>();

const attrs = useAttrs();
const controlAttrs = computed(() => omitClass(attrs));

const inputId = useId();
const { value, errorMessage, handleBlur } = useField<unknown>(() => props.name);
const { getValue, getLabel, isDisabled } = createOptionResolvers<TOption>(props);

function isSelected(option: TOption) {
  return isSameValue(getValue(option), value.value);
}

function select(option: TOption) {
  value.value = getValue(option);
}
</script>

<template>
  <FormField :input-id="inputId" :label="label" :hint="hint" :error="errorMessage" :class="fieldClass">
    <div class="flex gap-2" :class="inline ? 'flex-row flex-wrap' : 'flex-col'">
      <label
        v-for="(option, index) in options"
        :key="getOptionKey(getValue(option), index)"
        class="label cursor-pointer justify-start gap-2"
      >
        <input
          v-bind="controlAttrs"
          type="radio"
          :class="cn('radio', errorMessage && 'radio-error', attrs.class)"
          :name="inputId"
          :checked="isSelected(option)"
          :disabled="disabled || isDisabled(option)"
          @change="select(option)"
          @blur="handleBlur"
        />
        <slot :value="option" :selected="isSelected(option)" :index="index">
          {{ getLabel(option) }}
        </slot>
      </label>
    </div>
  </FormField>
</template>

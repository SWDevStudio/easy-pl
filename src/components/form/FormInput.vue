<script setup lang="ts">
import { computed, useAttrs, useId } from "vue";
import { useField } from "vee-validate";
import FormField from "./FormField.vue";
import { cn, omitClass } from "@/utils/cn";

type InputType = "text" | "email" | "password" | "number" | "tel" | "url" | "search" | "date";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    name: string;
    label?: string;
    hint?: string;
    type?: InputType;
    disabled?: boolean;
    fieldClass?: string;
  }>(),
  { type: "text" },
);

const attrs = useAttrs();
const controlAttrs = computed(() => omitClass(attrs));

const inputId = useId();
const { value, errorMessage, handleChange, handleBlur } = useField<string | number | undefined>(() => props.name);

function onInput(event: Event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) return;

  if (props.type !== "number") {
    handleChange(target.value);
    return;
  }

  handleChange(target.value === "" ? undefined : target.valueAsNumber);
}
</script>

<template>
  <FormField :input-id="inputId" :label="label" :hint="hint" :error="errorMessage" :class="fieldClass">
    <input
      v-bind="controlAttrs"
      :id="inputId"
      :class="cn('input w-full', errorMessage && 'input-error', attrs.class)"
      :type="type"
      :value="value"
      :disabled="disabled"
      @input="onInput"
      @blur="handleBlur"
    />
  </FormField>
</template>

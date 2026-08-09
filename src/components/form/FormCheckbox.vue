<script setup lang="ts">
import { computed, useAttrs, useId } from "vue";
import { useField } from "vee-validate";
import FormField from "./FormField.vue";
import { cn, omitClass } from "@/utils/cn";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  name: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  fieldClass?: string;
}>();

const attrs = useAttrs();
const controlAttrs = computed(() => omitClass(attrs));

const inputId = useId();
const { value, errorMessage, handleBlur } = useField<boolean>(() => props.name, undefined, {
  type: "checkbox",
  checkedValue: true,
  uncheckedValue: false,
});
</script>

<template>
  <FormField :input-id="inputId" :hint="hint" :error="errorMessage" :class="fieldClass">
    <label class="label cursor-pointer justify-start gap-2" :for="inputId">
      <input
        v-bind="controlAttrs"
        :id="inputId"
        v-model="value"
        type="checkbox"
        :class="cn('checkbox', errorMessage && 'checkbox-error', attrs.class)"
        :disabled="disabled"
        @blur="handleBlur"
      />
      <slot>{{ label }}</slot>
    </label>
  </FormField>
</template>

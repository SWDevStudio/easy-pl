<script setup lang="ts" generic="TOption">
import { computed, nextTick, ref, useAttrs, useTemplateRef } from "vue";
import { onClickOutside } from "@vueuse/core";
import { useDropdownPanel } from "@/composables/useDropdownPanel";
import { cn, omitClass } from "@/utils/cn";
import { createOptionResolvers, getOptionKey, isSameValue, type OptionAccessor } from "@/utils/options";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    options: TOption[];
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    clearable?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    menuClass?: string;
    optionValue?: OptionAccessor<TOption, unknown>;
    optionLabel?: OptionAccessor<TOption, unknown>;
    optionDisabled?: OptionAccessor<TOption, unknown>;
  }>(),
  { placeholder: "Выберите значение", searchPlaceholder: "Поиск..." },
);

const emit = defineEmits<{ blur: [] }>();

defineSlots<{
  default?: (props: { value: TOption; selected: boolean; index: number }) => unknown;
  selected?: (props: { value: TOption }) => unknown;
  placeholder?: () => unknown;
  empty?: () => unknown;
}>();

const model = defineModel<unknown>();

const attrs = useAttrs();
const controlAttrs = computed(() => omitClass(attrs));

const root = useTemplateRef<HTMLElement>("root");
const panel = useTemplateRef<HTMLElement>("panel");
const search = useTemplateRef<HTMLInputElement>("search");
const isOpen = ref(false);
const query = ref("");

const { target, style, resolveTarget } = useDropdownPanel(root);
const { getValue, getLabel, isDisabled } = createOptionResolvers<TOption>(props);

const selectedOption = computed(() =>
  props.options.find((option) => isSameValue(getValue(option), model.value)),
);

const selectedLabel = computed(() =>
  selectedOption.value === undefined ? "" : getLabel(selectedOption.value),
);

const visibleOptions = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!props.searchable || !needle) return props.options;

  return props.options.filter((option) => getLabel(option).toLowerCase().includes(needle));
});

function isSelected(option: TOption) {
  return isSameValue(getValue(option), model.value);
}

function toggle() {
  if (props.disabled) return;

  isOpen.value ? close() : open();
}

function open() {
  resolveTarget();
  isOpen.value = true;

  if (props.searchable) nextTick(() => search.value?.focus());
}

function select(option: TOption) {
  if (isDisabled(option)) return;

  model.value = getValue(option);
  close();
}

function clear() {
  model.value = undefined;
  close();
}

function close() {
  if (!isOpen.value) return;

  isOpen.value = false;
  query.value = "";
  emit("blur");
}

onClickOutside(root, close, { ignore: [panel] });
</script>

<template>
  <div ref="root" class="relative w-full" @keydown.esc="close">
    <label
      v-if="searchable && isOpen"
      :class="cn('input w-full justify-between gap-2', invalid && 'input-error', attrs.class)"
    >
      <input
        ref="search"
        v-model="query"
        type="text"
        class="grow border-none bg-transparent outline-none"
        :placeholder="selectedLabel || searchPlaceholder"
      />

      <svg class="size-4 shrink-0 rotate-180 opacity-60" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </label>

    <button
      v-else
      v-bind="controlAttrs"
      type="button"
      :class="cn('input w-full justify-between gap-2', invalid && 'input-error', attrs.class)"
      :disabled="disabled"
      @click="toggle"
    >
      <span v-if="selectedOption !== undefined" class="truncate">
        <slot name="selected" :value="selectedOption">
          <slot :value="selectedOption" :selected="true" :index="options.indexOf(selectedOption)">
            {{ getLabel(selectedOption) }}
          </slot>
        </slot>
      </span>
      <span v-else class="text-muted truncate">
        <slot name="placeholder">{{ placeholder }}</slot>
      </span>

      <svg
        class="size-4 shrink-0 opacity-60 transition-transform"
        :class="{ 'rotate-180': isOpen }"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
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
          <li v-if="clearable && selectedOption !== undefined">
            <button type="button" class="text-muted rounded-none" @click="clear">Очистить</button>
          </li>

          <li v-for="(option, index) in visibleOptions" :key="getOptionKey(getValue(option), index)">
            <button
              type="button"
              class="hover:bg-base-300 rounded-none"
              :class="{ 'menu-active': isSelected(option), 'menu-disabled': isDisabled(option) }"
              :disabled="isDisabled(option)"
              @click="select(option)"
            >
              <slot :value="option" :selected="isSelected(option)" :index="index">
                {{ getLabel(option) }}
              </slot>
            </button>
          </li>

          <li v-if="!visibleOptions.length" class="text-muted px-3 py-3 text-sm">
            <slot name="empty">Ничего не найдено</slot>
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

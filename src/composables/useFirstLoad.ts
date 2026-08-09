import { computed, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";

export interface FirstLoadState {
  isFirstLoad: ComputedRef<boolean>;
  isRefreshing: ComputedRef<boolean>;
}

export function useFirstLoad(
  isLoading: MaybeRefOrGetter<boolean | undefined>,
  hasContent: MaybeRefOrGetter<boolean> = () => false,
): FirstLoadState {
  const loading = computed(() => toValue(isLoading) === true);
  const content = computed(() => toValue(hasContent));
  const hasSettled = ref(content.value);

  watch(content, (value) => {
    if (value) hasSettled.value = true;
  });

  watch(loading, (value, previous) => {
    if (previous && !value) hasSettled.value = true;
  });

  return {
    isFirstLoad: computed(() => loading.value && !hasSettled.value),
    isRefreshing: computed(() => loading.value && hasSettled.value),
  };
}

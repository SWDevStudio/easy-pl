import { ref } from "vue";
import { readSettings, writeSetting } from "@/db/repositories/settings";

export interface ThemeOption {
  id: string;
  name: string;
  hint: string;
}

export const THEMES: ThemeOption[] = [
  { id: "bdo", name: "Black Desert", hint: "Золото по тёмному дереву — как в игре" },
  { id: "owl", name: "Owl Coalition", hint: "Экспериментальная, в цветах герба альянса" },
];

const THEME_KEY = "ui.theme";
const DEFAULT_THEME = "bdo";

const current = ref(DEFAULT_THEME);

export function useTheme() {
  async function load(): Promise<void> {
    const settings = await readSettings();

    apply(settings[THEME_KEY] ?? DEFAULT_THEME);
  }

  async function select(id: string): Promise<void> {
    apply(id);
    await writeSetting(THEME_KEY, current.value);
  }

  function apply(id: string): void {
    current.value = THEMES.some((theme) => theme.id === id) ? id : DEFAULT_THEME;
    document.documentElement.dataset.theme = current.value;
  }

  return { current, themes: THEMES, load, select };
}

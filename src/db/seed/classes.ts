export type ClassPath = "succession" | "awakening" | "liberation" | "none";

export interface ClassSeedEntry {
  baseName: string;
  paths: ClassPath[];
}

const SUCCESSION_AWAKENING: ClassPath[] = ["succession", "awakening"];
const AWAKENING_LIBERATION: ClassPath[] = ["awakening", "liberation"];
const SUCCESSION_ONLY: ClassPath[] = ["succession"];

export const CLASS_SEED: ClassSeedEntry[] = [
  { baseName: "Агент", paths: SUCCESSION_ONLY },
  { baseName: "Валькирия", paths: SUCCESSION_AWAKENING },
  { baseName: "Варвар", paths: SUCCESSION_AWAKENING },
  { baseName: "Воин", paths: SUCCESSION_AWAKENING },
  { baseName: "Волшебник", paths: SUCCESSION_AWAKENING },
  { baseName: "Волшебница", paths: SUCCESSION_AWAKENING },
  { baseName: "Вуконг", paths: AWAKENING_LIBERATION },
  { baseName: "Драканиа", paths: SUCCESSION_AWAKENING },
  { baseName: "Колдунья", paths: SUCCESSION_AWAKENING },
  { baseName: "Корсар", paths: SUCCESSION_AWAKENING },
  { baseName: "Куноичи", paths: SUCCESSION_AWAKENING },
  { baseName: "Лан", paths: SUCCESSION_AWAKENING },
  { baseName: "Лучник", paths: AWAKENING_LIBERATION },
  { baseName: "Лучница", paths: SUCCESSION_AWAKENING },
  { baseName: "Мастер меча", paths: SUCCESSION_AWAKENING },
  { baseName: "Маэва", paths: SUCCESSION_AWAKENING },
  { baseName: "Мертвый Глаз", paths: AWAKENING_LIBERATION },
  { baseName: "Мистик", paths: SUCCESSION_AWAKENING },
  { baseName: "Мудрец", paths: SUCCESSION_AWAKENING },
  { baseName: "Мэгу", paths: SUCCESSION_AWAKENING },
  { baseName: "Ниндзя", paths: SUCCESSION_AWAKENING },
  { baseName: "Нова", paths: SUCCESSION_AWAKENING },
  { baseName: "Сераф", paths: AWAKENING_LIBERATION },
  { baseName: "Сколария", paths: AWAKENING_LIBERATION },
  { baseName: "Страж", paths: SUCCESSION_AWAKENING },
  { baseName: "Страйкер", paths: SUCCESSION_AWAKENING },
  { baseName: "Темный рыцарь", paths: SUCCESSION_AWAKENING },
  { baseName: "Тоса", paths: SUCCESSION_AWAKENING },
  { baseName: "Уса", paths: SUCCESSION_AWAKENING },
  { baseName: "Фурия", paths: SUCCESSION_AWAKENING },
  { baseName: "Хассашин", paths: SUCCESSION_AWAKENING },
  { baseName: "Шай", paths: AWAKENING_LIBERATION },
];

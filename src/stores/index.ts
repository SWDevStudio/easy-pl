import { useClassesStore } from "./classes";
import { useEventsStore } from "./events";
import { usePlayersStore } from "./players";
import { useRaidsStore } from "./raids";
import { useStatsStore } from "./stats";

export function reloadAll(): Promise<unknown>[] {
  const players = usePlayersStore();
  const classes = useClassesStore();
  const raids = useRaidsStore();
  const events = useEventsStore();
  const stats = useStatsStore();

  const tasks: Promise<unknown>[] = [];

  if (players.hasLoaded) tasks.push(players.load());
  if (classes.hasLoaded) tasks.push(classes.load());
  if (raids.hasLoaded) tasks.push(raids.load());
  if (stats.hasLoaded) tasks.push(stats.load());

  tasks.push(events.load());

  return tasks;
}

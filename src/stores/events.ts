import { computed, ref } from "vue";
import { defineStore } from "pinia";
import * as repository from "@/db/repositories/events";
import type { EventInput, EventParticipant, GuildEvent } from "@/db/types";

export const useEventsStore = defineStore("events", () => {
  const items = ref<GuildEvent[]>([]);
  const current = ref<GuildEvent | null>(null);
  const participants = ref<EventParticipant[]>([]);
  const isLoading = ref(false);
  const isBusy = ref(false);
  const error = ref<string | null>(null);

  const signedUp = computed(() => participants.value.filter((item) => item.isSignedUp));
  const roster = computed(() =>
    participants.value.filter((item) => item.slotSource !== null && item.reserveRank === null),
  );
  const unmarked = computed(() => roster.value.filter((item) => item.showedUp === null).length);

  async function load() {
    isLoading.value = true;

    try {
      items.value = await repository.listEvents();
      error.value = null;
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      isLoading.value = false;
    }
  }

  async function open(id: number) {
    isLoading.value = true;

    try {
      current.value = await repository.getEvent(id);
      participants.value = await repository.listParticipants(id);
      error.value = null;
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      isLoading.value = false;
    }
  }

  async function create(input: EventInput): Promise<number | null> {
    isBusy.value = true;

    try {
      const id = await repository.createEvent(input);
      error.value = null;
      await load();

      return id;
    } catch (cause) {
      error.value = messageOf(cause);

      return null;
    } finally {
      isBusy.value = false;
    }
  }

  async function update(id: number, input: EventInput) {
    return run(() => repository.updateEvent(id, input), id);
  }

  async function remove(id: number) {
    isBusy.value = true;

    try {
      await repository.deleteEvent(id);
      error.value = null;
      await load();

      return true;
    } catch (cause) {
      error.value = messageOf(cause);

      return false;
    } finally {
      isBusy.value = false;
    }
  }

  async function toggleSignup(item: EventParticipant) {
    if (!current.value) return false;

    return run(() => repository.setSignup(current.value!.id, item.playerId, !item.isSignedUp));
  }

  async function togglePriority(item: EventParticipant) {
    if (!current.value) return false;

    return run(() => repository.setPriority(current.value!.id, item.playerId, !item.isPriority));
  }

  async function signUpEveryone() {
    if (!current.value) return false;

    return run(() => repository.signUpEveryone(current.value!.id));
  }

  async function clearSignups() {
    if (!current.value) return false;

    return run(() => repository.clearSignups(current.value!.id));
  }

  async function runDraw() {
    if (!current.value) return false;

    return run(() => repository.runDraw(current.value!.id));
  }

  async function mark(item: EventParticipant, showedUp: boolean | null) {
    if (!current.value) return false;

    return run(() => repository.setAttendance(current.value!.id, item.playerId, showedUp));
  }

  async function addToRoster(item: EventParticipant) {
    if (!current.value) return false;

    return run(() => repository.addToRoster(current.value!.id, item.playerId));
  }

  async function removeFromRoster(item: EventParticipant) {
    if (!current.value) return false;

    return run(() => repository.removeFromRoster(current.value!.id, item.playerId));
  }

  async function close() {
    if (!current.value) return false;

    return run(() => repository.closeEvent(current.value!.id));
  }

  async function run(action: () => Promise<void>, reloadId?: number): Promise<boolean> {
    isBusy.value = true;

    try {
      await action();
      error.value = null;

      const id = reloadId ?? current.value?.id;
      if (id !== undefined) await open(id);

      return true;
    } catch (cause) {
      error.value = messageOf(cause);

      return false;
    } finally {
      isBusy.value = false;
    }
  }

  return {
    items,
    current,
    participants,
    signedUp,
    roster,
    unmarked,
    isLoading,
    isBusy,
    error,
    load,
    open,
    create,
    update,
    remove,
    toggleSignup,
    togglePriority,
    signUpEveryone,
    clearSignups,
    runDraw,
    mark,
    addToRoster,
    removeFromRoster,
    close,
  };
});

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

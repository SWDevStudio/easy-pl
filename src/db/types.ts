export type ClassPath = "succession" | "awakening" | "liberation" | "none";

export interface GameClass {
  id: number;
  baseName: string;
  path: ClassPath;
  displayName: string;
  isActive: boolean;
  sortOrder: number;
}

export interface GameClassInput {
  baseName: string;
  path: ClassPath;
  displayName: string;
  isActive: boolean;
}

export interface Raid {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface RaidInput {
  name: string;
  isActive: boolean;
}

export interface Player {
  id: number;
  familyName: string;
  classId: number | null;
  className: string | null;
  raidId: number | null;
  raidName: string | null;
  discord: string | null;
  discordId: string | null;
  joinedAt: string;
  debt: number;
  isFavorite: boolean;
  note: string | null;
}

export interface PlayerInput {
  familyName: string;
  classId: number | null;
  raidId: number | null;
  discord: string | null;
  discordId: string | null;
  joinedAt: string;
  note: string | null;
}

export type EventStatus = "draft" | "drawn" | "closed";

export type SlotSource = "priority" | "lottery" | "fallback" | "manual";

export interface GuildEvent {
  id: number;
  title: string;
  eventDate: string;
  slots: number;
  reserveSize: number;
  seed: string | null;
  share: number | null;
  status: EventStatus;
  signedUp: number;
  taken: number;
  attended: number;
}

export interface EventInput {
  title: string;
  eventDate: string;
  slots: number;
}

export interface EventParticipant {
  playerId: number;
  familyName: string;
  className: string | null;
  raidName: string | null;
  debt: number;
  isFavorite: boolean;
  isSignedUp: boolean;
  isPriority: boolean;
  slotSource: SlotSource | null;
  reserveRank: number | null;
  showedUp: boolean | null;
}

export class EventStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventStateError";
  }
}

export class ClassInUseError extends Error {
  constructor(readonly playerCount: number) {
    super(`Класс используют ${playerCount} игроков — его можно только отключить`);
    this.name = "ClassInUseError";
  }
}

export class RaidInUseError extends Error {
  constructor(readonly playerCount: number) {
    super(`Рейд назначен ${playerCount} игрокам — его можно только отключить`);
    this.name = "RaidInUseError";
  }
}

export class DuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateError";
  }
}

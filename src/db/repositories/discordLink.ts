import type { DiscordUser } from "@/services/discord";
import { getDb } from "../client";
import { applyFavoritePriority } from "./events";

export interface LinkedPlayer {
  playerId: number;
  familyName: string;
  user: DiscordUser;
  matchedBy: "id" | "username" | "familyName";
}

export interface ImportResult {
  linked: LinkedPlayer[];
  unknown: DiscordUser[];
  alreadySignedUp: number;
}

interface CandidateRow {
  id: number;
  family_name: string;
  discord: string | null;
  discord_id: string | null;
}

function normalize(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function importSignups(eventId: number, users: DiscordUser[]): Promise<ImportResult> {
  const db = await getDb();
  const players = await db.select<CandidateRow[]>(
    `SELECT id, family_name, discord, discord_id FROM players`,
  );

  const byDiscordId = new Map(
    players.filter((row) => row.discord_id).map((row) => [row.discord_id ?? "", row]),
  );
  const byUsername = new Map(
    players.filter((row) => row.discord).map((row) => [normalize(row.discord), row]),
  );
  const byFamilyName = new Map(players.map((row) => [normalize(row.family_name), row]));

  const linked: LinkedPlayer[] = [];
  const unknown: DiscordUser[] = [];
  let alreadySignedUp = 0;

  for (const user of users) {
    const match = resolve(user);

    if (!match) {
      unknown.push(user);
      continue;
    }

    const existing = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) AS count FROM event_signups WHERE event_id = ? AND player_id = ?`,
      [eventId, match.row.id],
    );

    if ((existing[0]?.count ?? 0) > 0) alreadySignedUp += 1;

    await db.execute(`INSERT OR IGNORE INTO event_signups (event_id, player_id) VALUES (?, ?)`, [
      eventId,
      match.row.id,
    ]);
    await applyFavoritePriority(eventId, match.row.id);

    if (match.matchedBy !== "id") {
      await db.execute(`UPDATE players SET discord_id = ?, discord = ?, updated_at = ? WHERE id = ?`, [
        user.id,
        user.username,
        new Date().toISOString(),
        match.row.id,
      ]);
    }

    linked.push({
      playerId: match.row.id,
      familyName: match.row.family_name,
      user,
      matchedBy: match.matchedBy,
    });
  }

  return { linked, unknown, alreadySignedUp };

  function resolve(user: DiscordUser) {
    const byId = byDiscordId.get(user.id);
    if (byId) return { row: byId, matchedBy: "id" as const };

    const byName = byUsername.get(normalize(user.username));
    if (byName) return { row: byName, matchedBy: "username" as const };

    const byFamily =
      byFamilyName.get(normalize(user.username)) ?? byFamilyName.get(normalize(user.displayName));
    if (byFamily) return { row: byFamily, matchedBy: "familyName" as const };

    return null;
  }
}

export async function linkPlayerToDiscord(
  playerId: number,
  user: DiscordUser,
  eventId: number | null,
): Promise<void> {
  const db = await getDb();

  await db.execute(`UPDATE players SET discord_id = ?, discord = ?, updated_at = ? WHERE id = ?`, [
    user.id,
    user.username,
    new Date().toISOString(),
    playerId,
  ]);

  if (eventId !== null) {
    await db.execute(`INSERT OR IGNORE INTO event_signups (event_id, player_id) VALUES (?, ?)`, [
      eventId,
      playerId,
    ]);
    await applyFavoritePriority(eventId, playerId);
  }
}

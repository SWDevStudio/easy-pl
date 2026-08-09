import { clampDebt } from "@/lottery/fairness";
import { getDb } from "../client";
import { newUid, recordTombstone, uidOf } from "../uid";
import { DuplicateError, type Player, type PlayerInput } from "../types";

interface PlayerRow {
  id: number;
  family_name: string;
  class_id: number | null;
  class_name: string | null;
  raid_id: number | null;
  raid_name: string | null;
  discord: string | null;
  discord_id: string | null;
  joined_at: string;
  debt: number;
  is_favorite: number;
  note: string | null;
}

export async function listPlayers(): Promise<Player[]> {
  const db = await getDb();
  const rows = await db.select<PlayerRow[]>(
    `SELECT p.id, p.family_name, p.class_id, c.display_name AS class_name,
            p.raid_id, r.name AS raid_name,
            p.discord, p.discord_id, p.joined_at, p.debt, p.is_favorite, p.note
     FROM players p
     LEFT JOIN classes c ON c.id = p.class_id
     LEFT JOIN raids r ON r.id = p.raid_id
     ORDER BY p.family_name`,
  );

  return rows.map(toPlayer);
}

export async function createPlayer(input: PlayerInput): Promise<void> {
  const db = await getDb();

  await ensureUniqueName(input.familyName, null);

  await db.execute(
    `INSERT INTO players (family_name, class_id, raid_id, discord, discord_id, joined_at, note,
                          updated_at, uid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.familyName.trim(),
      input.classId,
      input.raidId,
      input.discord,
      input.discordId,
      input.joinedAt,
      input.note,
      now(),
      newUid(),
    ],
  );
}

export async function updatePlayer(id: number, input: PlayerInput): Promise<void> {
  const db = await getDb();

  await ensureUniqueName(input.familyName, id);

  await db.execute(
    `UPDATE players SET family_name = ?, class_id = ?, raid_id = ?, discord = ?, discord_id = ?,
            joined_at = ?, note = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.familyName.trim(),
      input.classId,
      input.raidId,
      input.discord,
      input.discordId,
      input.joinedAt,
      input.note,
      now(),
      id,
    ],
  );
}

export async function setFavorite(id: number, isFavorite: boolean): Promise<void> {
  const db = await getDb();

  await db.execute(`UPDATE players SET is_favorite = ?, updated_at = ? WHERE id = ?`, [
    isFavorite ? 1 : 0,
    now(),
    id,
  ]);
}

export async function setDebt(id: number, debt: number): Promise<number> {
  const db = await getDb();
  const stored = clampDebt(debt);

  await db.execute(`UPDATE players SET debt = ?, updated_at = ? WHERE id = ?`, [stored, now(), id]);

  return stored;
}

export async function deletePlayer(id: number): Promise<void> {
  const db = await getDb();

  await recordTombstone("player", await uidOf("players", id));
  await db.execute(`DELETE FROM attendance WHERE player_id = ?`, [id]);
  await db.execute(`DELETE FROM event_slots WHERE player_id = ?`, [id]);
  await db.execute(`DELETE FROM event_signups WHERE player_id = ?`, [id]);
  await db.execute(`DELETE FROM players WHERE id = ?`, [id]);
}

async function ensureUniqueName(familyName: string, exceptId: number | null): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(`SELECT id FROM players WHERE family_name = ?`, [
    familyName.trim(),
  ]);
  const conflict = rows.find((row) => row.id !== exceptId);

  if (conflict) throw new DuplicateError("Игрок с такой фамилией уже есть");
}

function now(): string {
  return new Date().toISOString();
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    familyName: row.family_name,
    classId: row.class_id,
    className: row.class_name,
    raidId: row.raid_id,
    raidName: row.raid_name,
    discord: row.discord,
    discordId: row.discord_id,
    joinedAt: row.joined_at,
    debt: row.debt,
    isFavorite: row.is_favorite === 1,
    note: row.note,
  };
}

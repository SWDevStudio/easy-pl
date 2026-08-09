import { getDb } from "../client";

export interface EventStat {
  eventId: number;
  title: string;
  eventDate: string;
  slots: number;
  signedUp: number;
  roster: number;
  attended: number;
  noShows: number;
}

export interface PlayerStat {
  playerId: number;
  familyName: string;
  className: string | null;
  isFavorite: boolean;
  debt: number;
  signedUp: number;
  taken: number;
  attended: number;
  noShows: number;
}

interface EventStatRow {
  id: number;
  title: string;
  event_date: string;
  slots: number;
  signed_up: number;
  roster: number;
  attended: number;
  no_shows: number;
}

interface PlayerStatRow {
  id: number;
  family_name: string;
  class_name: string | null;
  is_favorite: number;
  debt: number;
  signed_up: number;
  taken: number;
  attended: number;
  no_shows: number;
}

export interface RaidStat {
  raidId: number;
  name: string;
  members: number;
  signedUp: number;
  taken: number;
  attended: number;
  noShows: number;
}

interface RaidAggregateRow {
  raid_id: number;
  name: string;
  signed_up: number;
  taken: number;
  attended: number;
  no_shows: number;
}

export async function listRaidStats(fromDate: string): Promise<RaidStat[]> {
  const db = await getDb();

  const aggregates = await db.select<RaidAggregateRow[]>(
    `SELECT COALESCE(r.id, 0) AS raid_id,
            COALESCE(r.name, 'Без рейда') AS name,
            COUNT(*) AS signed_up,
            SUM(CASE WHEN t.player_id IS NOT NULL THEN 1 ELSE 0 END) AS taken,
            SUM(CASE WHEN a.showed_up = 1 THEN 1 ELSE 0 END) AS attended,
            SUM(CASE WHEN a.showed_up = 0 THEN 1 ELSE 0 END) AS no_shows
     FROM event_signups s
     JOIN events e ON e.id = s.event_id AND e.status <> 'draft' AND e.event_date >= ?
     JOIN players p ON p.id = s.player_id
     LEFT JOIN raids r ON r.id = p.raid_id
     LEFT JOIN event_slots t ON t.event_id = s.event_id AND t.player_id = s.player_id
     LEFT JOIN attendance a ON a.event_id = s.event_id AND a.player_id = s.player_id
     GROUP BY COALESCE(r.id, 0), COALESCE(r.name, 'Без рейда')`,
    [fromDate],
  );

  const members = await db.select<{ raid_id: number; members: number }[]>(
    `SELECT COALESCE(raid_id, 0) AS raid_id, COUNT(*) AS members FROM players GROUP BY COALESCE(raid_id, 0)`,
  );
  const raids = await db.select<{ id: number; name: string }[]>(`SELECT id, name FROM raids`);

  const byRaid = new Map(aggregates.map((row) => [row.raid_id, row]));
  const memberCount = new Map(members.map((row) => [row.raid_id, row.members]));
  const known = new Map<number, string>(raids.map((row) => [row.id, row.name]));

  if (memberCount.has(0) || byRaid.has(0)) known.set(0, "Без рейда");

  return [...known.entries()]
    .map(([raidId, name]) => {
      const row = byRaid.get(raidId);

      return {
        raidId,
        name,
        members: memberCount.get(raidId) ?? 0,
        signedUp: row?.signed_up ?? 0,
        taken: row?.taken ?? 0,
        attended: row?.attended ?? 0,
        noShows: row?.no_shows ?? 0,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

export interface RaidTimelinePoint {
  eventId: number;
  eventDate: string;
  raidId: number;
  attended: number;
}

export async function listRaidTimeline(fromDate: string): Promise<RaidTimelinePoint[]> {
  const db = await getDb();
  const rows = await db.select<
    { event_id: number; event_date: string; raid_id: number; attended: number }[]
  >(
    `SELECT e.id AS event_id, e.event_date, COALESCE(r.id, 0) AS raid_id,
            SUM(CASE WHEN a.showed_up = 1 THEN 1 ELSE 0 END) AS attended
     FROM events e
     JOIN event_slots t ON t.event_id = e.id
     JOIN players p ON p.id = t.player_id
     LEFT JOIN raids r ON r.id = p.raid_id
     LEFT JOIN attendance a ON a.event_id = e.id AND a.player_id = t.player_id
     WHERE e.status <> 'draft' AND e.event_date >= ?
     GROUP BY e.id, e.event_date, COALESCE(r.id, 0)
     ORDER BY e.event_date, e.id`,
    [fromDate],
  );

  return rows.map((row) => ({
    eventId: row.event_id,
    eventDate: row.event_date,
    raidId: row.raid_id,
    attended: row.attended,
  }));
}

export async function listEventStats(): Promise<EventStat[]> {
  const db = await getDb();
  const rows = await db.select<EventStatRow[]>(
    `SELECT e.id, e.title, e.event_date, e.slots,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id) AS signed_up,
            (SELECT COUNT(*) FROM event_slots t
              WHERE t.event_id = e.id AND t.reserve_rank IS NULL) AS roster,
            (SELECT COUNT(*) FROM attendance a
              WHERE a.event_id = e.id AND a.showed_up = 1) AS attended,
            (SELECT COUNT(*) FROM attendance a
              WHERE a.event_id = e.id AND a.showed_up = 0) AS no_shows
     FROM events e
     WHERE e.status <> 'draft'
     ORDER BY e.event_date, e.id`,
  );

  return rows.map((row) => ({
    eventId: row.id,
    title: row.title,
    eventDate: row.event_date,
    slots: row.slots,
    signedUp: row.signed_up,
    roster: row.roster,
    attended: row.attended,
    noShows: row.no_shows,
  }));
}

export async function listPlayerStats(): Promise<PlayerStat[]> {
  const db = await getDb();
  const rows = await db.select<PlayerStatRow[]>(
    `SELECT p.id, p.family_name, c.display_name AS class_name, p.is_favorite, p.debt,
            (SELECT COUNT(*) FROM event_signups s JOIN events e ON e.id = s.event_id
              WHERE s.player_id = p.id AND e.status <> 'draft') AS signed_up,
            (SELECT COUNT(*) FROM event_slots t JOIN events e ON e.id = t.event_id
              WHERE t.player_id = p.id AND t.reserve_rank IS NULL AND e.status <> 'draft') AS taken,
            (SELECT COUNT(*) FROM attendance a
              WHERE a.player_id = p.id AND a.showed_up = 1) AS attended,
            (SELECT COUNT(*) FROM attendance a
              WHERE a.player_id = p.id AND a.showed_up = 0) AS no_shows
     FROM players p
     LEFT JOIN classes c ON c.id = p.class_id
     ORDER BY p.family_name`,
  );

  return rows.map((row) => ({
    playerId: row.id,
    familyName: row.family_name,
    className: row.class_name,
    isFavorite: row.is_favorite === 1,
    debt: row.debt,
    signedUp: row.signed_up,
    taken: row.taken,
    attended: row.attended,
    noShows: row.no_shows,
  }));
}

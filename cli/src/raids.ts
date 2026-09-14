import { NexusApi } from "./api.js";
import { printJson, printTable } from "./format.js";

interface Guild {
  id: string;
  slug: string;
  name: string;
}

interface Raid {
  id: string;
  name: string;
  startTime: string;
  startedAt: string | null;
  endedAt: string | null;
  canceledAt: string | null;
  signupCounts?: { confirmed: number; notAttending: number };
}

interface Signup {
  id: string;
  characterName: string;
  characterClass: string | null;
  characterLevel: number | null;
  status: string;
  user: { displayName: string };
}

interface AttendanceEvent {
  id: string;
  createdAt: string;
  eventType: string;
  note: string | null;
  records: {
    characterName: string;
    class: string | null;
    level: number | null;
    groupNumber: number | null;
    status: string;
  }[];
}

interface LootEvent {
  id: string;
  itemName: string;
  looterName: string;
  eventTime: string | null;
  createdAt: string;
  note: string | null;
}

async function resolveGuild(api: NexusApi, selector: string): Promise<Guild> {
  const { guilds } = await api.request<{ guilds: Guild[] }>("/api/guilds");
  const value = selector.trim();
  const byId = guilds.find((guild) => guild.id === value);
  if (byId) return byId;

  const normalized = value.toLowerCase();
  const matches = guilds.filter(
    (guild) =>
      guild.slug.toLowerCase() === normalized ||
      guild.name.toLowerCase() === normalized,
  );
  if (matches.length > 1) {
    throw new Error(
      `Guild "${value}" is ambiguous. Use an ID: ${matches.map((guild) => `${guild.name} (${guild.id})`).join(", ")}.`,
    );
  }
  const guild = matches[0];
  if (!guild)
    throw new Error(
      `Guild "${value}" not found. Use its ID, slug, or exact name.`,
    );
  return guild;
}

function encodedRaidId(raidId: string): string {
  if (!raidId.trim() || raidId === "." || raidId === "..") {
    throw new Error("A valid raidId is required.");
  }
  return encodeURIComponent(raidId);
}

function raidStatus(raid: Raid): string {
  if (raid.canceledAt) return "Canceled";
  if (raid.endedAt) return "Ended";
  if (raid.startedAt) return "Active";
  return "Scheduled";
}

export async function listRaids(
  api: NexusApi,
  guildSelector: string,
  options: { all: boolean; json: boolean },
): Promise<void> {
  const guild = await resolveGuild(api, guildSelector);
  const response = await api.request<{ raids: Raid[] }>(
    `/api/raids/guild/${encodeURIComponent(guild.id)}`,
  );
  const now = Date.now();
  const raids = response.raids
    .filter(
      (raid) =>
        options.all ||
        (!raid.canceledAt &&
          !raid.endedAt &&
          (raid.startedAt || Date.parse(raid.startTime) >= now)),
    )
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  if (options.json) return printJson({ ...response, raids });
  if (!raids.length) {
    console.log(
      options.all
        ? "No raids found."
        : "No upcoming or active raids found. Use --all to include past and canceled raids.",
    );
    return;
  }
  printTable(
    ["ID", "Start", "Status", "Confirmed", "Name"],
    raids.map((raid) => [
      raid.id,
      raid.startTime,
      raidStatus(raid),
      String(raid.signupCounts?.confirmed ?? ""),
      raid.name,
    ]),
  );
}

export async function showRaid(api: NexusApi, raidId: string): Promise<void> {
  printJson(await api.request(`/api/raids/${encodedRaidId(raidId)}`));
}

export async function showRaidSignups(
  api: NexusApi,
  raidId: string,
  json: boolean,
): Promise<void> {
  // The existing raid detail response owns signups; there is no signup-list GET route.
  const { raid } = await api.request<{ raid: Raid & { signups: Signup[] } }>(
    `/api/raids/${encodedRaidId(raidId)}`,
  );
  if (json) return printJson({ signups: raid.signups });
  if (!raid.signups.length) return console.log("No signups found.");
  printTable(
    ["ID", "Character", "Class", "Level", "Status", "Player"],
    raid.signups.map((signup) => [
      signup.id,
      signup.characterName,
      signup.characterClass ?? "",
      String(signup.characterLevel ?? ""),
      signup.status,
      signup.user.displayName,
    ]),
  );
}

export async function showAttendance(
  api: NexusApi,
  raidId: string,
  json: boolean,
): Promise<void> {
  const response = await api.request<{ attendanceEvents: AttendanceEvent[] }>(
    `/api/attendance/raid/${encodedRaidId(raidId)}`,
  );
  if (json) return printJson(response);
  if (!response.attendanceEvents.length)
    return console.log("No attendance events found.");
  for (const event of response.attendanceEvents) {
    console.log(`${event.id}  ${event.createdAt}  ${event.eventType}`);
    if (event.note) console.log(event.note);
    if (!event.records.length) {
      console.log("No attendance records.");
      continue;
    }
    printTable(
      ["Character", "Class", "Level", "Group", "Status"],
      event.records.map((record) => [
        record.characterName,
        record.class ?? "",
        String(record.level ?? ""),
        String(record.groupNumber ?? ""),
        record.status,
      ]),
    );
  }
}

export async function listRaidLoot(
  api: NexusApi,
  raidId: string,
  json: boolean,
): Promise<void> {
  const response = await api.request<{ loot: LootEvent[] }>(
    `/api/raids/${encodedRaidId(raidId)}/loot`,
  );
  if (json) return printJson(response);
  if (!response.loot.length) return console.log("No loot found.");
  printTable(
    ["ID", "Time", "Item", "Looter", "Note"],
    response.loot.map((loot) => [
      loot.id,
      loot.eventTime ?? loot.createdAt,
      loot.itemName,
      loot.looterName,
      loot.note ?? "",
    ]),
  );
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface NexusProfile {
  baseUrl: string;
  token: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface NexusCliConfig {
  activeProfile: string;
  profiles: Record<string, NexusProfile>;
}

function defaultConfigPath(): string {
  if (process.env.NEXUS_CONFIG_PATH) {
    return process.env.NEXUS_CONFIG_PATH;
  }

  const appData = process.env.APPDATA;
  if (appData) {
    return join(appData, "Nexus CLI", "config.json");
  }

  return join(homedir(), ".config", "nexus", "config.json");
}

export const CONFIG_PATH = defaultConfigPath();

export async function loadConfig(): Promise<NexusCliConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NexusCliConfig>;
    return {
      activeProfile: parsed.activeProfile || "default",
      profiles:
        parsed.profiles && typeof parsed.profiles === "object"
          ? parsed.profiles
          : {},
    };
  } catch {
    return {
      activeProfile: "default",
      profiles: {},
    };
  }
}

export async function saveConfig(config: NexusCliConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export async function saveProfile(
  name: string,
  profile: NexusProfile,
): Promise<void> {
  const config = await loadConfig();
  config.activeProfile = name;
  config.profiles[name] = profile;
  await saveConfig(config);
}

export async function requireProfile(
  name?: string,
): Promise<{ name: string; profile: NexusProfile }> {
  const config = await loadConfig();
  const profileName = name || config.activeProfile || "default";
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new Error(
      `Profile "${profileName}" is not configured. Run nexus login --url <url>.`,
    );
  }
  return { name: profileName, profile };
}

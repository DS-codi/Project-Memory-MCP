import { SecureStoragePlugin } from "@capacitor-community/secure-storage-plugin";

export interface ServerConfig {
  host: string;
  httpPort: number;
  wsPort: number;
}

const KEYS = {
  API_KEY: "pm_api_key",
  SERVER_CONFIG: "pm_server_config",
} as const;

export async function getApiKey(): Promise<string | null> {
  try {
    const { value } = await SecureStoragePlugin.get({ key: KEYS.API_KEY });
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setApiKey(key: string): Promise<void> {
  await SecureStoragePlugin.set({ key: KEYS.API_KEY, value: key });
}

export async function clearApiKey(): Promise<void> {
  try {
    await SecureStoragePlugin.remove({ key: KEYS.API_KEY });
  } catch {
    // Key may not exist — ignore
  }
}

export async function getServerConfig(): Promise<ServerConfig | null> {
  try {
    const { value } = await SecureStoragePlugin.get({ key: KEYS.SERVER_CONFIG });
    if (!value) return null;
    return JSON.parse(value) as ServerConfig;
  } catch {
    return null;
  }
}

export async function setServerConfig(config: ServerConfig): Promise<void> {
  await SecureStoragePlugin.set({
    key: KEYS.SERVER_CONFIG,
    value: JSON.stringify(config),
  });
}

export async function clearServerConfig(): Promise<void> {
  try {
    await SecureStoragePlugin.remove({ key: KEYS.SERVER_CONFIG });
  } catch {
    // Key may not exist — ignore
  }
}

/** Clear all stored credentials and server config */
export async function clearAll(): Promise<void> {
  await Promise.allSettled([clearApiKey(), clearServerConfig()]);
}

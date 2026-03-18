/**
 * In-memory mock for storage service — use in unit tests.
 * Call reset() in beforeEach to clear state between tests.
 */
import type { ServerConfig } from "../storage";

let store: Record<string, string> = {};

export const reset = (): void => {
  store = {};
};

export const getApiKey = async (): Promise<string | null> =>
  store["pm_api_key"] ?? null;

export const setApiKey = async (key: string): Promise<void> => {
  store["pm_api_key"] = key;
};

export const clearApiKey = async (): Promise<void> => {
  delete store["pm_api_key"];
};

export const getServerConfig = async (): Promise<ServerConfig | null> => {
  const v = store["pm_server_config"];
  return v ? (JSON.parse(v) as ServerConfig) : null;
};

export const setServerConfig = async (config: ServerConfig): Promise<void> => {
  store["pm_server_config"] = JSON.stringify(config);
};

export const clearServerConfig = async (): Promise<void> => {
  delete store["pm_server_config"];
};

export const clearAll = async (): Promise<void> => {
  reset();
};

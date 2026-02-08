export interface DeployDefaults {
  agents: string[];
  prompts: string[];
  instructions: string[];
  updatedAt: string;
}

const STORAGE_KEY = 'pmd-deploy-defaults';

export function getDeployDefaults(): DeployDefaults | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as DeployDefaults;
    if (!parsed || !Array.isArray(parsed.agents) || !Array.isArray(parsed.prompts) || !Array.isArray(parsed.instructions)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setDeployDefaults(defaults: Omit<DeployDefaults, 'updatedAt'>): DeployDefaults {
  const payload: DeployDefaults = {
    ...defaults,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  return payload;
}

// Chat models have a fixed provider. getProvider is the separate helper-provider
// choice used by memory, compression and other helper phases.
// Settings are local (localStorage, per device).

import { accountSettingKey } from "./session";

export type ProviderId = "nearai" | "phala";

export interface ProviderModel {
  name: string;
  region: string;
  tier?: "light" | "heavy";
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;

  description: string;

  tag: string;

  models: ProviderModel[];
  links: string[];
}

// Adding a provider means an entry here and in ALL_PROVIDERS.
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  phala: {
    id: "phala",
    name: "Phala",
    description:
      "Messages are encrypted in your browser to Phala's gateway. Light and Heavy can continue to Tinfoil's enclaves; the Gemma helper runs through NEAR AI's gateway. Your browser checks that Phala's gateway runs on genuine Intel TDX hardware, but doesn't yet pin which release of its code that is.",
    tag: "USA",
    models: [
      { name: "DeepSeek V4.1 Flash", region: "USA", tier: "light" },
      { name: "GLM 5.3", region: "USA", tier: "heavy" },
    ],
    links: ["https://phala.com/", "https://tinfoil.sh/"],
  },
  nearai: {
    id: "nearai",
    name: "NEAR AI",
    description:
      "Each message is encrypted in your browser to the model's own enclave key. Your browser checks that NEAR AI's gateway and the model run on genuine Intel TDX hardware, but doesn't yet pin which release of their code that is.",
    tag: "USA",
    models: [
      { name: "GLM 5.3 Flash", region: "USA", tier: "light" },
    ],
    links: ["https://near.ai/"],
  },
};

export const DEFAULT_PROVIDER: ProviderId = "phala";

export const ALL_PROVIDERS: ProviderId[] = ["phala", "nearai"];

export const PRO_ONLY_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([]);

// Mirror of the backend's offerings. Drift here sends a model to a provider that does not serve it.
export const MODEL_PROVIDERS: Record<string, ProviderId[]> = {
  fast: ["phala"],
  smart: ["phala"],
  "glm-flash": ["nearai"],
};

function providerAllowed(provider: ProviderId): boolean {
  return !PRO_ONLY_PROVIDERS.has(provider);
}

export function getProvider(): ProviderId {
  const chosen = getProviderSettings().provider;
  if (providerAllowed(chosen)) return chosen;
  return ALL_PROVIDERS.find(providerAllowed) ?? chosen;
}

export function getModelProvider(modelId: string): ProviderId | null {
  return (MODEL_PROVIDERS[modelId] ?? []).find(providerAllowed) ?? null;
}

export function isModelAvailable(modelId: string): boolean {
  return getModelProvider(modelId) !== null;
}

const STORAGE_KEY = "karui_provider_settings";

// Legacy keys are read once, on the first read per device, so existing settings are not lost.
const LEGACY_PRIORITY_KEY = "karui_provider_priority";
const LEGACY_AUTO_SEARCH_KEY = "karui_auto_websearch";

export interface ProviderSettings {
  provider: ProviderId;
  autoWebSearch: boolean;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  provider: DEFAULT_PROVIDER,
  autoWebSearch: true,
};

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

function readLegacySettings(): Partial<ProviderSettings> {
  const out: Partial<ProviderSettings> = {};
  try {
    const rawPriority = window.localStorage.getItem(LEGACY_PRIORITY_KEY);
    if (rawPriority) {
      const parsed: unknown = JSON.parse(rawPriority);
      if (Array.isArray(parsed)) {
        const first = parsed.find(isProviderId);
        if (first) out.provider = first;
      }
    }
  } catch {}

  try {
    const rawAuto = window.localStorage.getItem(LEGACY_AUTO_SEARCH_KEY);
    if (rawAuto !== null) out.autoWebSearch = rawAuto === "1";
  } catch {}

  return out;
}

function normalizeSettings(raw: unknown): ProviderSettings {
  const s = { ...DEFAULT_PROVIDER_SETTINGS };
  if (raw && typeof raw === "object") {
    const r = raw as Partial<ProviderSettings>;
    // A stored provider outside the pool falls back to the default; otherwise every turn would go to an enclave that does not exist.
    if (isProviderId(r.provider)) s.provider = r.provider;
    if (typeof r.autoWebSearch === "boolean") s.autoWebSearch = r.autoWebSearch;
  }
  return s;
}

export function getProviderSettings(): ProviderSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PROVIDER_SETTINGS };
  try {
    const raw = window.localStorage.getItem(accountSettingKey(STORAGE_KEY));
    if (raw) return normalizeSettings(JSON.parse(raw));
    return normalizeSettings({ ...DEFAULT_PROVIDER_SETTINGS, ...readLegacySettings() });
  } catch {
    return { ...DEFAULT_PROVIDER_SETTINGS };
  }
}

export function setProviderSettings(patch: Partial<ProviderSettings>): ProviderSettings {
  const next = normalizeSettings({ ...getProviderSettings(), ...patch });
  try {
    window.localStorage.setItem(accountSettingKey(STORAGE_KEY), JSON.stringify(next));
  } catch {
  }
  return next;
}

import fs from 'node:fs';
import type { AppConfig } from '@shared/types';
import { CONFIG_DIR, CONFIG_FILE } from './paths';

export const DEFAULT_CONFIG: Readonly<AppConfig> = Object.freeze({
  standbyTimeoutMs: 10 * 60 * 1000,
});

export const MIN_STANDBY_MS = 60 * 1000;
export const MAX_STANDBY_MS = 24 * 60 * 60 * 1000;

export function validateConfig(partial: Record<string, unknown>): Partial<AppConfig> {
  const out: Partial<AppConfig> = {};
  if (partial.standbyTimeoutMs !== undefined) {
    const v = Number(partial.standbyTimeoutMs);
    if (!Number.isFinite(v) || v < MIN_STANDBY_MS || v > MAX_STANDBY_MS) {
      throw new Error(`standbyTimeoutMs must be between ${MIN_STANDBY_MS} and ${MAX_STANDBY_MS}`);
    }
    out.standbyTimeoutMs = Math.round(v);
  }
  return out;
}

export function loadConfig(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const validated = validateConfig(raw);
    return { ...DEFAULT_CONFIG, ...validated };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: AppConfig): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.warn(`[config] save failed: ${(err as Error).message}`);
  }
}

let currentConfig = loadConfig();

export function getConfig(): AppConfig {
  return currentConfig;
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  currentConfig = { ...currentConfig, ...partial };
  saveConfig(currentConfig);
  return currentConfig;
}

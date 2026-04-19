const fs = require('node:fs');
const { CONFIG_DIR, CONFIG_FILE } = require('./paths');

const DEFAULT_CONFIG = Object.freeze({
  standbyTimeoutMs: 10 * 60 * 1000,
});

const MIN_STANDBY_MS = 60 * 1000;
const MAX_STANDBY_MS = 24 * 60 * 60 * 1000;

function validateConfig(partial) {
  const out = {};
  if (partial.standbyTimeoutMs !== undefined) {
    const v = Number(partial.standbyTimeoutMs);
    if (!Number.isFinite(v) || v < MIN_STANDBY_MS || v > MAX_STANDBY_MS) {
      throw new Error(`standbyTimeoutMs must be between ${MIN_STANDBY_MS} and ${MAX_STANDBY_MS}`);
    }
    out.standbyTimeoutMs = Math.round(v);
  }
  return out;
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const validated = validateConfig(raw);
    return { ...DEFAULT_CONFIG, ...validated };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.warn(`[config] save failed: ${err.message}`);
  }
}

let currentConfig = loadConfig();

function getConfig() {
  return currentConfig;
}

function updateConfig(partial) {
  currentConfig = { ...currentConfig, ...partial };
  saveConfig(currentConfig);
  return currentConfig;
}

module.exports = {
  DEFAULT_CONFIG,
  MIN_STANDBY_MS,
  MAX_STANDBY_MS,
  validateConfig,
  loadConfig,
  saveConfig,
  getConfig,
  updateConfig,
};

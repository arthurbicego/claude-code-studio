const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { STATUSLINE_CACHE_DIR, STATUSLINE_GLOBAL_META } = require('./paths');
const { FOOTER_ID_RE } = require('./validators');
const { gitInfo, uncommittedLineStats } = require('./git');
const { detectWorktree } = require('./worktrees');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function removeFooterCacheFor(id) {
  if (!FOOTER_ID_RE.test(id)) return;
  try {
    fs.unlinkSync(path.join(STATUSLINE_CACHE_DIR, `${id}.json`));
  } catch {}
}

function buildFooterPayload(id) {
  const cache = readJsonSafe(path.join(STATUSLINE_CACHE_DIR, `${id}.json`));
  const global = readJsonSafe(STATUSLINE_GLOBAL_META);
  const cwd = cache?.workspace?.current_dir || cache?.cwd || null;
  const { branch, dirty } = gitInfo(cwd);
  const { added: linesAdded, removed: linesRemoved } = uncommittedLineStats(cwd);
  const worktree = detectWorktree(cwd);

  const ctxPct = cache?.context_window?.used_percentage;
  const exceeds200k = cache?.exceeds_200k_tokens === true;

  const five = cache?.rate_limits?.five_hour || global?.rate_limits?.five_hour || null;
  const seven = cache?.rate_limits?.seven_day || global?.rate_limits?.seven_day || null;

  return {
    hasCache: !!cache,
    cwd,
    dirLabel: cwd ? (cwd === os.homedir() ? '~' : path.basename(cwd)) : null,
    branch,
    dirty,
    model: cache?.model?.display_name || null,
    contextPct: typeof ctxPct === 'number' ? ctxPct : null,
    exceeds200k,
    linesAdded,
    linesRemoved,
    costUsd: cache?.cost?.total_cost_usd ?? null,
    fiveHourPct: typeof five?.used_percentage === 'number' ? five.used_percentage : null,
    fiveHourResetsAt: typeof five?.resets_at === 'number' ? five.resets_at : null,
    sevenDayPct: typeof seven?.used_percentage === 'number' ? seven.used_percentage : null,
    sevenDayResetsAt: typeof seven?.resets_at === 'number' ? seven.resets_at : null,
    cacheUpdatedAt: cache
      ? (() => {
          try {
            return fs.statSync(path.join(STATUSLINE_CACHE_DIR, `${id}.json`)).mtimeMs;
          } catch {
            return null;
          }
        })()
      : null,
    globalUpdatedAt: global?.at ? global.at * 1000 : null,
    worktree,
  };
}

module.exports = { readJsonSafe, removeFooterCacheFor, buildFooterPayload };

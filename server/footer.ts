import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SessionFooter } from '@shared/types';
import { gitInfo, uncommittedLineStats } from './git';
import { STATUSLINE_CACHE_DIR, STATUSLINE_GLOBAL_META } from './paths';
import { FOOTER_ID_RE } from './validators';
import { detectWorktree } from './worktrees';

type RateLimitBlock = {
  used_percentage?: number;
  resets_at?: number;
};

type StatuslineCache = {
  workspace?: { current_dir?: string };
  cwd?: string;
  context_window?: { used_percentage?: number };
  exceeds_200k_tokens?: boolean;
  model?: { display_name?: string };
  cost?: { total_cost_usd?: number };
  rate_limits?: { five_hour?: RateLimitBlock; seven_day?: RateLimitBlock };
};

type GlobalMeta = {
  at?: number;
  rate_limits?: { five_hour?: RateLimitBlock; seven_day?: RateLimitBlock };
};

export function readJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function removeFooterCacheFor(id: string): void {
  if (!FOOTER_ID_RE.test(id)) return;
  try {
    fs.unlinkSync(path.join(STATUSLINE_CACHE_DIR, `${id}.json`));
  } catch {
    // Cache file may not exist; that's the desired end state.
  }
}

export function buildFooterPayload(id: string): SessionFooter {
  const cache = readJsonSafe<StatuslineCache>(path.join(STATUSLINE_CACHE_DIR, `${id}.json`));
  const global = readJsonSafe<GlobalMeta>(STATUSLINE_GLOBAL_META);
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

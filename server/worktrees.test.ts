import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  branchExists,
  branchUpstream,
  deleteLocalBranch,
  listWorktrees,
  pickMainWorktree,
  projectWorktreeRef,
} from './worktrees';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('worktrees branch helpers', () => {
  let repo: string;
  let remote: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-wt-'));
    remote = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-wt-remote-'));
    // Bare repo used as the "remote" so we can set upstreams.
    git(remote, 'init', '--bare', '--initial-branch=main');
    // Local repo with one commit on main.
    git(repo, 'init', '--initial-branch=main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    fs.writeFileSync(path.join(repo, 'README.md'), 'hi\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'init');
    git(repo, 'remote', 'add', 'origin', remote);
    git(repo, 'push', '-u', 'origin', 'main');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(remote, { recursive: true, force: true });
  });

  describe('branchExists', () => {
    it('returns true for an existing branch', () => {
      expect(branchExists(repo, 'main')).toBe(true);
    });

    it('returns false for a missing branch', () => {
      expect(branchExists(repo, 'does-not-exist')).toBe(false);
    });
  });

  describe('branchUpstream', () => {
    it('returns the short upstream when one is configured', () => {
      expect(branchUpstream(repo, 'main')).toBe('origin/main');
    });

    it('returns null for a branch without upstream', () => {
      git(repo, 'branch', 'orphan');
      expect(branchUpstream(repo, 'orphan')).toBeNull();
    });

    it('returns null for a non-existent branch', () => {
      expect(branchUpstream(repo, 'nope')).toBeNull();
    });
  });

  describe('deleteLocalBranch', () => {
    it('deletes a merged branch with the safe flag', () => {
      // Branch pointing at the same commit as main is considered merged.
      git(repo, 'branch', 'feature-merged');
      expect(branchExists(repo, 'feature-merged')).toBe(true);
      expect(deleteLocalBranch(repo, 'feature-merged')).toBe(true);
      expect(branchExists(repo, 'feature-merged')).toBe(false);
    });

    it('refuses to delete an unmerged branch with the safe flag', () => {
      git(repo, 'checkout', '-b', 'feature-unmerged');
      fs.writeFileSync(path.join(repo, 'file.txt'), 'work\n');
      git(repo, 'add', '.');
      git(repo, 'commit', '-m', 'wip');
      git(repo, 'checkout', 'main');
      expect(deleteLocalBranch(repo, 'feature-unmerged')).toBe(false);
      expect(branchExists(repo, 'feature-unmerged')).toBe(true);
    });

    it('force-deletes an unmerged branch with force=true', () => {
      git(repo, 'checkout', '-b', 'feature-force');
      fs.writeFileSync(path.join(repo, 'other.txt'), 'stuff\n');
      git(repo, 'add', '.');
      git(repo, 'commit', '-m', 'wip2');
      git(repo, 'checkout', 'main');
      expect(deleteLocalBranch(repo, 'feature-force', { force: true })).toBe(true);
      expect(branchExists(repo, 'feature-force')).toBe(false);
    });
  });

  describe('projectWorktreeRef', () => {
    it('returns null for the main worktree', () => {
      expect(projectWorktreeRef(repo)).toBeNull();
    });

    it('returns null for a non-existent path', () => {
      expect(projectWorktreeRef(path.join(repo, 'nope'))).toBeNull();
    });

    it('returns parentCwd and branch when cwd is a linked worktree', () => {
      const wtPath = path.join(path.dirname(repo), `ccs-wt-linked-${path.basename(repo)}`);
      try {
        git(repo, 'worktree', 'add', '-b', 'feature-x', wtPath);
        const ref = projectWorktreeRef(wtPath);
        expect(ref).not.toBeNull();
        expect(ref?.branch).toBe('feature-x');
        // realpath comparison avoids false negatives when /tmp resolves through symlinks.
        expect(fs.realpathSync(ref?.parentCwd ?? '')).toBe(fs.realpathSync(repo));
      } finally {
        fs.rmSync(wtPath, { recursive: true, force: true });
      }
    });

    it('resolves a removed worktree via the .claude/worktrees convention', () => {
      // The worktree was at <repo>/.claude/worktrees/<name> but has since been
      // removed. Old sessions still record that cwd — we should derive the
      // parent from the path even though nothing exists on disk anymore.
      const ghost = path.join(repo, '.claude', 'worktrees', 'removed-feature');
      const ref = projectWorktreeRef(ghost);
      expect(ref).not.toBeNull();
      expect(fs.realpathSync(ref?.parentCwd ?? '')).toBe(fs.realpathSync(repo));
      expect(ref?.branch).toBeNull();
    });

    it('returns null for a ghost path whose derived parent is not a git repo', () => {
      const bogus = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-nogit-'));
      try {
        const ghost = path.join(bogus, '.claude', 'worktrees', 'x');
        expect(projectWorktreeRef(ghost)).toBeNull();
      } finally {
        fs.rmSync(bogus, { recursive: true, force: true });
      }
    });
  });

  describe('pickMainWorktree', () => {
    it('returns the main worktree even when its HEAD is detached', () => {
      // Detach HEAD on the main worktree (simulates mid-rebase / mid-bisect). Then add a
      // linked worktree on a normal branch. The previous heuristic ("first non-detached")
      // would return the linked worktree as main here.
      const headSha = git(repo, 'rev-parse', 'HEAD').trim();
      git(repo, 'checkout', '--detach', headSha);
      const wtPath = path.join(path.dirname(repo), `ccs-wt-pick-${path.basename(repo)}`);
      try {
        git(repo, 'worktree', 'add', '-b', 'feature-pick', wtPath);
        const entries = listWorktrees(repo);
        const main = pickMainWorktree(entries, repo);
        expect(main).not.toBeNull();
        expect(fs.realpathSync(main?.path ?? '')).toBe(fs.realpathSync(repo));
      } finally {
        fs.rmSync(wtPath, { recursive: true, force: true });
      }
    });
  });
});

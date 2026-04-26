export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Reject patterns that `git check-ref-format` would also reject: consecutive dots, the @{
// sequence, backslashes, double-slash, trailing dot or slash, and the .lock suffix. The
// allowed-charset regex on its own accepted refs git considers invalid.
export const BRANCH_NAME_RE =
  /^(?!.*\.\.)(?!.*@\{)(?!.*\\)(?!.*\/\/)(?!.*\.lock(?:$|\/))(?!.*[/.]$)[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
export const WORKTREE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// Reject ids that are pure dots ('.', '..', '...') — those would otherwise resolve to the
// containing directory or its parent in path.join, and unlinking '<dir>/.json' was a real
// risk in the footer cache cleanup path.
export const FOOTER_ID_RE = /^(?!\.+$)[A-Za-z0-9._-]{1,128}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const VALID_EFFORT = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
export const VALID_PERMISSION_MODE = new Set([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
]);
export const VALID_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,64}$/;

export function isValidName(name: unknown): name is string {
  return typeof name === 'string' && NAME_RE.test(name);
}

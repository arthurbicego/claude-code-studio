const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BRANCH_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const WORKTREE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const FOOTER_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_EFFORT = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const VALID_PERMISSION_MODE = new Set([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
]);
const VALID_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,64}$/;

function isValidName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

module.exports = {
  NAME_RE,
  BRANCH_NAME_RE,
  WORKTREE_NAME_RE,
  FOOTER_ID_RE,
  UUID_RE,
  VALID_EFFORT,
  VALID_PERMISSION_MODE,
  VALID_MODEL_RE,
  isValidName,
};

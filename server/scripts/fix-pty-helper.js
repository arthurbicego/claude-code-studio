// Some npm/tar combos strip the executable bit from node-pty's prebuilt
// spawn-helper. Without it, posix_spawnp fails with "posix_spawnp failed."
// Re-applying chmod +x here makes installs reproducible.
const fs = require('node:fs');
const path = require('node:path');

const base = path.join(__dirname, '..', '..', 'node_modules', 'node-pty', 'prebuilds');
if (!fs.existsSync(base)) process.exit(0);

for (const entry of fs.readdirSync(base)) {
  const helper = path.join(base, entry, 'spawn-helper');
  if (fs.existsSync(helper)) {
    try {
      fs.chmodSync(helper, 0o755);
      console.log(`chmod +x ${path.relative(process.cwd(), helper)}`);
    } catch (e) {
      console.warn(`failed to chmod ${helper}: ${e.message}`);
    }
  }
}

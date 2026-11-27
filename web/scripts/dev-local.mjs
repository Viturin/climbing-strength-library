import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const root = new URL('../', import.meta.url);
const fingerprint = createHash('sha256').update(readFileSync(new URL('package-lock.json', root))).digest('hex');
const stamp = new URL('node_modules/.dev-lock', root);
function run(args) {
  const result = spawnSync(npm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint) {
  run(['ci']);
  mkdirSync(new URL('node_modules/', root), { recursive: true });
  writeFileSync(stamp, fingerprint);
}
run(['run', 'dev']);

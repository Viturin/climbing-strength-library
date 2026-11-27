import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const root = new URL('../', import.meta.url);
const fingerprint = createHash('sha256')
  .update(readFileSync(new URL('package-lock.json', root)))
  .update(`${process.platform}:${process.arch}:${process.version}`)
  .digest('hex');
const stamp = new URL('node_modules/.dev-lock', root);
function run(args) {
  const result = spawnSync(npm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function canLoadRolldown(quiet) {
  // Import the package Vite resolves so a missing native binding invalidates the cache.
  const probe = "const require = createRequire(import.meta.url); " +
    "createRequire(require.resolve('vite'))('rolldown')";
  return spawnSync(process.execPath, [
    '--input-type=module', '-e', "import { createRequire } from 'node:module'; " + probe,
  ], { cwd: root, stdio: quiet ? 'ignore' : 'inherit' }).status === 0;
}
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint || !canLoadRolldown(true)) {
  run(['ci', '--include=optional']);
  if (!canLoadRolldown(false)) {
    console.error('Vite’s native binding could not load after reinstalling dependencies.');
    process.exit(1);
  }
  mkdirSync(new URL('node_modules/', root), { recursive: true });
  writeFileSync(stamp, fingerprint);
}
run(['run', 'dev']);

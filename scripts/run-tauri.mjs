import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
delete env.CARGO_TARGET_DIR;

const isWin = process.platform === 'win32';
const bin = path.join(
  root,
  'node_modules',
  '.bin',
  isWin ? 'tauri.cmd' : 'tauri'
);
const args = process.argv.slice(2);

const r = spawnSync(bin, args, {
  stdio: 'inherit',
  env,
  cwd: root,
  shell: isWin,
});

process.exit(r.status === null ? 1 : r.status);

// Archives the private family data directory (state, lesson cache, recordings,
// taxonomy cache) into backups/harrington-<timestamp>.tar.gz using the system tar.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const dataDir = resolve(process.env.HARRINGTON_DATA_DIR || join(repoRoot, 'data', 'private'));
const backupDir = resolve(process.env.HARRINGTON_BACKUP_DIR || join(repoRoot, 'backups'));

if (!existsSync(dataDir)) {
  console.error(`No family data found at ${dataDir}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archive = join(backupDir, `harrington-${stamp}.tar.gz`);
mkdirSync(backupDir, { recursive: true });

const result = spawnSync('tar', ['-czf', archive, '-C', dirname(dataDir), basename(dataDir)], { stdio: 'inherit' });
if (result.error || result.status !== 0) {
  console.error(`Backup failed: ${result.error?.message || `tar exited with ${result.status}`}`);
  process.exit(1);
}
console.log(`Backed up ${dataDir} to ${archive}`);

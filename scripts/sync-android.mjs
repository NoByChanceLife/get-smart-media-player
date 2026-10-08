import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (!existsSync(join(root, 'android'))) {
  run('npx', ['cap', 'add', 'android']);
}

const packageDir = join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'getsmartmedia', 'player');
mkdirSync(packageDir, { recursive: true });

copyFileSync(join(root, 'native', 'android', 'GetSmartProviderPlugin.java'), join(packageDir, 'GetSmartProviderPlugin.java'));
copyFileSync(join(root, 'native', 'android', 'MainActivity.java'), join(packageDir, 'MainActivity.java'));
copyFileSync(join(root, 'native', 'android', 'AndroidManifest.xml'), join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'));

run('npx', ['cap', 'sync', 'android']);
console.log('Get Smart Android shell synchronized.');

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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

// Capacitor copy does not guarantee removal of old hashed Vite/PWA assets.
// Clear the generated web asset directory first so Android cannot package a stale bundle.
const androidPublicDir = join(root, 'android', 'app', 'src', 'main', 'assets', 'public');
if (existsSync(androidPublicDir)) {
  rmSync(androidPublicDir, { recursive: true, force: true });
  console.log('Cleared stale Android web assets.');
}

run('npx', ['cap', 'sync', 'android']);

const appBuildGradle = join(root, 'android', 'app', 'build.gradle');
const originalBuildGradle = readFileSync(appBuildGradle, 'utf8');
const compatibleBuildGradle = originalBuildGradle
  .replace(
    /getDefaultProguardFile\((['"])proguard-android\.txt\1\)/g,
    "getDefaultProguardFile('proguard-android-optimize.txt')",
  )
  // Remove the temporary OkHttp dependency from the earlier transport
  // experiment. The verified reference Xtream path uses HttpURLConnection.
  .replace(
    /^\s*implementation ['"]com\.squareup\.okhttp3:okhttp:3\.12\.11['"]\s*$/gm,
    '',
  )
  // Give this diagnostic APK an unmistakable Android package version so the
  // device installer and App Info can prove which build is actually running.
  .replace(/versionCode\s+\d+/, 'versionCode 2026101007')
  .replace(/versionName\s+["'][^"']+["']/, 'versionName "2026.10.10-hs7"');

if (compatibleBuildGradle !== originalBuildGradle) {
  writeFileSync(appBuildGradle, compatibleBuildGradle, 'utf8');
  console.log('Updated generated Android build configuration.');
}

console.log('Get Smart Android shell synchronized.');

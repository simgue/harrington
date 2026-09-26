import { copyFile, mkdir } from 'node:fs/promises';

const vendorDir = new URL('../src/vendor/', import.meta.url);
await mkdir(vendorDir, { recursive: true });
await copyFile(
  new URL('../node_modules/lucide/dist/umd/lucide.min.js', import.meta.url),
  new URL('lucide.min.js', vendorDir),
);
await copyFile(
  new URL('../node_modules/lucide/LICENSE', import.meta.url),
  new URL('lucide.LICENSE.txt', vendorDir),
);

// Storybook Meadow typefaces (SIL OFL 1.1), served locally — no font CDN.
const fontDir = new URL('fonts/', vendorDir);
await mkdir(fontDir, { recursive: true });
for (const [pkg, file, license] of [
  ['@fontsource-variable/fraunces', 'fraunces-latin-full-normal.woff2', 'fraunces.LICENSE.txt'],
  ['@fontsource-variable/lexend', 'lexend-latin-wght-normal.woff2', 'lexend.LICENSE.txt'],
]) {
  await copyFile(new URL(`../node_modules/${pkg}/files/${file}`, import.meta.url), new URL(file, fontDir));
  await copyFile(new URL(`../node_modules/${pkg}/LICENSE`, import.meta.url), new URL(license, fontDir));
}

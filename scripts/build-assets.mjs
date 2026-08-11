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

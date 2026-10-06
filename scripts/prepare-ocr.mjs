import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(createRequire(join(root, 'package.json')).resolve('tesseract.js-core/package.json'));
const output = new URL('../public/ocr/', import.meta.url);
await mkdir(output, { recursive: true });
await copyFile(join(root, 'dist/worker.min.js'), new URL('worker.min.js', output));
for (const variant of ['lstm', 'simd-lstm']) {
  for (const extension of ['js', 'wasm', 'wasm.js']) {
    const file = `tesseract-core-${variant}.${extension}`;
    await copyFile(join(core, file), new URL(file, output));
  }
}
const response = await fetch('https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz');
if (!response.ok) throw new Error(`English model download failed: ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
const digest = createHash('sha256').update(data).digest('hex');
if (digest !== '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91') throw new Error('English model checksum mismatch; no model written.');
await writeFile(new URL('eng.traineddata.gz', output), data);
console.log('OCR assets prepared and English model checksum verified.');

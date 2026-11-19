import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const base = process.argv[2] || 'http://127.0.0.1:5175';
const image = await readFile(new URL('cohorts.png', import.meta.url));
const started = Date.now();
const response = await fetch(new URL('/api/chat', base), {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Перепиши только видимые строки таблицы: когорты, зарегистрированные компании, компании с первой корректной заявкой и активацию. Только чтение изображения. Не делай причинных выводов и не придумывай данные.',
    files: [{ name: 'cohorts.png', base64: image.toString('base64') }],
  }),
  signal: AbortSignal.timeout(120_000),
});
const result = await response.json();
await writeFile(new URL('../../cases/procurement-check/image-test.json', import.meta.url), JSON.stringify({ elapsedMs: Date.now() - started, ...result }, null, 2));
assert.ok(response.ok && !result.incomplete && !result.blocked, result.error || result.warning);
assert.ok(result.sources.some(source => source.name === 'cohorts.png' && !source.error));
for (const value of [120, 48, 40, 150, 45, 30]) assert.match(result.text, new RegExp(`\\b${value}\\b`));
console.log(JSON.stringify({ seconds: (Date.now() - started) / 1000, model: result.model, text: result.text, warning: result.warning }, null, 2));

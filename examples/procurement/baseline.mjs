import { mkdir, readFile, writeFile } from 'node:fs/promises';
const directory = new URL('../../cases/procurement-check/', import.meta.url);
await mkdir(directory, { recursive: true });
const prompt = 'Мы развиваем сервис согласования заявок на закупку. Исследуй материалы, предложи три варианта, включая оставить как есть и закрыть направление. Дай обоснованную продуктовую и коммуникационную стратегию, план проверки и график активации. Чётко отдели факты от гипотез и синтетические реплики от интервью. Не принимай окончательное решение за руководителя.';
const files = await Promise.all(['brief.txt', 'cohorts.csv', 'interviews.vtt'].map(async name => ({
  name, base64: (await readFile(new URL(name, import.meta.url))).toString('base64'),
})));
const start = Date.now();
const response = await fetch('http://127.0.0.1:5175/api/chat', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt, files }), signal: AbortSignal.timeout(190_000),
});
const result = await response.json();
await writeFile(new URL('baseline.json', directory), JSON.stringify({ prompt, elapsedMs: Date.now() - start, ...result }, null, 2));
console.log(JSON.stringify({ ok: response.ok, elapsedMs: Date.now() - start, model: result.model, validation: result.validation, error: result.error }));

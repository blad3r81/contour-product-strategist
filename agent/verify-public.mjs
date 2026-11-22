import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base = (process.argv[2] || 'https://decision-contour.vercel.app').replace(/\/$/, '');
const status = await fetch(base + '/api/status');
assert.equal(status.status, 200);
const cookie = status.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
await status.body.cancel();
const results = [];
async function post(action, payload) {
  const start = Date.now();
  const response = await fetch(`${base}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', Origin: base, Cookie: cookie }, body: JSON.stringify(payload), signal: AbortSignal.timeout(140000) });
  const value = await response.json();
  assert.ok(response.ok, value.error);
  assert.ok(!value.incomplete && !value.blocked, value.warning || 'Incomplete model response');
  return { seconds: (Date.now() - start) / 1000, ...value };
}
async function file(name, location) { return { name, base64: (await readFile(new URL(location, import.meta.url))).toString('base64') }; }
for (const extension of ['csv', 'xlsx']) {
  const result = await post('chat', { prompt: 'Только по приложенной таблице: сравни активацию когорт, построй график доли и назови ограничения причинного вывода.', useCatalog: false, files: [await file('cohorts.' + extension, '../examples/procurement/cohorts.' + extension)] });
  assert.ok(result.charts?.length);
  assert.match(result.text, /40/); assert.match(result.text, /30/);
  results.push({ test: extension, ...result });
}
const pdf = await post('chat', { prompt: 'Прочитай весь бриф. Назови контрфактическую выручку, целевую выручку и разрыв между ними. Только по приложенному документу.', useCatalog: false, readAll: true, files: [await file('official-brief.pdf', '../examples/megafon-brief/materials/official-brief.pdf')] });
for (const n of [279, 285, 6]) assert.match(pdf.text, new RegExp(`\\b${n}\\b`));
assert.ok(pdf.sources.some(s => !s.error && s.coverage));
results.push({ test: 'official-pdf-full', ...pdf });
const image = await post('chat', { prompt: 'Перепиши видимые числа таблицы без причинных выводов. Только чтение приложенного изображения.', useCatalog: false, files: [await file('cohorts.png', '../examples/procurement/cohorts.png')] });
for (const n of [120, 48, 40, 150, 45, 30]) assert.match(image.text, new RegExp(`\\b${n}\\b`));
results.push({ test: 'image', ...image });
const link = await post('chat', { prompt: 'Прочитай https://megafon.ru/ и кратко назови, что действительно удалось прочитать. Не придумывай недоступное.', useCatalog: false });
assert.ok(link.sources?.some(s => s.url?.includes('megafon.ru') && !s.error));
results.push({ test: 'public-url', ...link });
await mkdir('tmp/acceptance', { recursive: true });
const speech = await post('speak', { text: 'Как проверить падение удержания пользователей?' });
await writeFile('tmp/acceptance/reference.wav', Buffer.from(speech.audio, 'base64'));
execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', 'tmp/acceptance/reference.wav', '-ar', '16000', '-ac', '1', 'tmp/acceptance/reference16.wav']);
const recognized = await post('transcribe', { audio: (await readFile('tmp/acceptance/reference16.wav')).toString('base64'), speechOnly: true });
assert.match(recognized.text, /удержан/i);
const spoken = await post('chat', { prompt: recognized.text, spoken: true, useCatalog: false });
const answerAudio = await post('speak', { text: spoken.spokenText || spoken.text });
assert.equal(Buffer.from(answerAudio.audio, 'base64').toString('ascii', 0, 4), 'RIFF');
results.push({ test: 'synthetic-speech-roundtrip', recognized: recognized.text, asrSeconds: recognized.seconds, answer: spoken.text, answerSeconds: spoken.seconds, ttsSeconds: answerAudio.seconds, audioBytes: Buffer.from(answerAudio.audio, 'base64').length });
const report = { date: new Date().toISOString(), base, scope: 'Actual public HTTP requests. Synthetic speech is not a live microphone test. No private session cookies are saved.', results };
await writeFile('examples/video-check/public-acceptance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, tests: results.map(r => ({ test: r.test, seconds: r.seconds })) }, null, 2));

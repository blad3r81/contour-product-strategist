import assert from 'node:assert/strict';
const base = (process.argv[2] || 'https://decision-contour.vercel.app').replace(/\/$/, '');
const status = await fetch(`${base}/api/status`);
assert.equal(status.status, 200, 'Public status must not require a hosting login');
const cookie = status.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
await status.body.cancel();
async function events(action, data, consume) {
  const start = performance.now();
  const response = await fetch(`${base}/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin, Cookie: cookie }, body: JSON.stringify(data), signal: AbortSignal.timeout(140000) });
  assert.ok(response.ok, `HTTP ${response.status}`);
  assert.match(response.headers.get('content-type'), /ndjson/);
  let rest = '';
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    const lines = (rest + chunk).split('\n');
    rest = lines.pop();
    for (const line of lines) if (line) {
      const event = JSON.parse(line);
      assert.ok(!event.error, event.error);
      consume(event, Math.round(performance.now() - start));
    }
  }
  assert.equal(rest.trim(), '', 'Truncated NDJSON');
}
const clips = [];
const parts = [
  'Сначала сравните когорты на одинаковом сроке после регистрации. Проверьте, что событие повторной записи определяется одинаково.',
  'Затем найдите этап, на котором пользователи перестают возвращаться. Причина пока неизвестна: её нужно проверить на сопоставимых данных.',
];
let speechDone = false;
await events('speak', { stream: true, text: parts.join(' '), parts }, (event, milliseconds) => {
  if (event.audio) {
    const wav = Buffer.from(event.audio, 'base64');
    let duration = event.format === 'mp3' ? event.durationSeconds : undefined;
    if (event.format === 'mp3') assert.ok(wav.toString('ascii', 0, 3) === 'ID3' || wav[0] === 255, 'Expected MP3 audio');
    else assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    for (let offset = 12; event.format !== 'mp3' && offset + 8 <= wav.length;) {
      const size = wav.readUInt32LE(offset + 4);
      if (wav.toString('ascii', offset, offset + 4) === 'data') duration = size / (48000 * 2);
      offset += 8 + size + size % 2;
    }
    assert.ok(duration > 1);
    clips.push({ milliseconds, durationSeconds: duration, bytes: wav.length, format: event.format || 'wav' });
  }
  if (event.done) speechDone = true;
});
assert.equal(speechDone, true);
assert.equal(clips.length, parts.length);
const deliveryFitsPlayback = clips.slice(1).every((clip, index) => clip.milliseconds <= clips[0].milliseconds + clips.slice(0, index + 1).reduce((sum, value) => sum + value.durationSeconds * 1000, 0));
let streamed = '', answer, deltas = 0, firstDeltaMs;
await events('chat', { prompt: 'Объясни двумя короткими предложениями, что такое когортный анализ удержания.', stream: true }, (event, milliseconds) => {
  if (event.delta) { firstDeltaMs ??= milliseconds; streamed += event.delta; deltas++; }
  if (event.result) answer = event.result;
});
assert.ok(deltas > 1, 'Expected actual incremental model text');
assert.equal(streamed, answer.text);
console.log(JSON.stringify({ ok: true, clips, deliveryFitsPlayback, text: { deltas, firstDeltaMs, characters: streamed.length }, scope: 'HTTP audio delivery and actual text deltas; microphone and browser playback need a separate human check.' }, null, 2));

import assert from 'node:assert/strict';

const asr = process.argv[2] || 'http://127.0.0.1:9460';
const tts = process.argv[3] || 'http://127.0.0.1:9461';
const samples = [];
async function ready(base) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok && (await response.json()).ready) return;
    } catch { /* Process may still be starting. The bounded deadline remains visible. */ }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw Error(`Речевой сервис не готов: ${base}`);
}
async function post(base, action, data) {
  const start = performance.now();
  const response = await fetch(`${base}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(150000) });
  const result = await response.json();
  assert.ok(response.ok, result.error);
  samples.push({ action, seconds: Math.round((performance.now() - start) / 10) / 100, engine: result.engine, sampleRate: result.sampleRate });
  return result;
}

function wav16k(input) {
  assert.equal(input.subarray(0, 4).toString(), 'RIFF');
  assert.equal(input.subarray(8, 12).toString(), 'WAVE');
  let fmt, data;
  for (let offset = 12; offset + 8 <= input.length;) {
    const name = input.subarray(offset, offset + 4).toString();
    const size = input.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= input.length, 'Повреждённый WAV');
    if (name === 'fmt ') fmt = input.subarray(offset + 8, offset + 8 + size);
    if (name === 'data') data = input.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + size % 2;
  }
  assert.ok(fmt && data);
  assert.equal(fmt.readUInt16LE(0), 1, 'PCM');
  assert.equal(fmt.readUInt16LE(2), 1, 'Моно');
  assert.equal(fmt.readUInt32LE(4), 48000);
  assert.equal(fmt.readUInt16LE(14), 16);
  const count = Math.floor(data.length / 6);
  const output = Buffer.alloc(44 + count * 2);
  output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(16000, 24); output.writeUInt32LE(32000, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36); output.writeUInt32LE(count * 2, 40);
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const value = Math.round((data.readInt16LE(i * 6) + data.readInt16LE(i * 6 + 2) + data.readInt16LE(i * 6 + 4)) / 3);
    output.writeInt16LE(value, 44 + i * 2);
    peak = Math.max(peak, Math.abs(value) / 32768);
  }
  assert.ok(peak > .01 && peak <= 1, 'Запись должна содержать ненулевой звук');
  return output;
}

await Promise.all([ready(asr), ready(tts)]);
const reference = 'Здорово. Как проверить удержание пользователей цифрового сервиса?';
const speech = await post(tts, 'speak', { text: reference, fast: true });
assert.equal(speech.engine, 'silero');
const audio = wav16k(Buffer.from(speech.audio, 'base64')).toString('base64');
const conversation = await post(asr, 'transcribe', { audio, speechOnly: true });
assert.equal(conversation.engine, 'zipformer');
assert.match(conversation.text, /удержани/iu);
assert.match(conversation.text, /сервис/iu);
const dictation = await post(asr, 'transcribe', { audio, speechOnly: false });
assert.match(dictation.text, /удержани/iu);
assert.match(dictation.text, /сервис/iu);
console.log(JSON.stringify({ ok: true, reference, conversation: conversation.text, dictation: dictation.text, samples,
  scope: 'Синтетическая запись через реальные речевые модели. Этот тест не измеряет микрофон, браузерное воспроизведение или качество стратегического ответа.' }, null, 2));

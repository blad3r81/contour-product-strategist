import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
const base = process.argv[2] || 'http://127.0.0.1:5175';
const directory = new URL('../../cases/procurement-check/', import.meta.url);
const samples = [];
async function post(action, payload) {
  const start = Date.now();
  const response = await fetch(new URL(`/api/${action}`, base), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  samples.push({ action, seconds: (Date.now() - start) / 1000, ok: response.ok, engine: result.engine, sampleRate: result.sampleRate });
  assert.ok(response.ok, result.error);
  return result;
}
const reference = 'Здорово. Как проверить активацию компаний после изменения формы?';
const spoken = await post('speak', { text: reference });
const bytes = Buffer.from(spoken.audio, 'base64');
assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
await writeFile(new URL('voice-reference.wav', directory), bytes);
const input = fileURLToPath(new URL('voice-reference.wav', directory));
const normalized = fileURLToPath(new URL('voice-reference-16k.wav', directory));
execFileSync(process.env.CONTOUR_VOICE_PYTHON || 'D:/AI/qwen-voice/Scripts/python.exe', [
  '-c', 'import sys, soundfile as sf, numpy as np; x,r=sf.read(sys.argv[1]); y=np.interp(np.arange(round(len(x)*16000/r))*r/16000,np.arange(len(x)),x); sf.write(sys.argv[2],y,16000,subtype="PCM_16")',
  input, normalized,
]);
const recognized = await post('transcribe', { audio: (await readFile(normalized)).toString('base64'), speechOnly: true });
assert.match(recognized.text, /активац/i);
assert.match(recognized.text, /компан/i);
const answer = await post('chat', { prompt: recognized.text, caseId: 'procurement-check', spoken: true, files: [] });
assert.ok(answer.text && !answer.incomplete && !answer.blocked);
const voice = await post('speak', { text: answer.spokenText || answer.text.slice(0, 900) });
assert.equal(Buffer.from(voice.audio, 'base64').subarray(0, 4).toString(), 'RIFF');
await writeFile(new URL('voice-answer.wav', directory), Buffer.from(voice.audio, 'base64'));
const report = { reference, recognized: recognized.text, answer: answer.text, samples, scope: 'Синтетическая запись через сервер. Живой микрофон и субъективное качество голоса проверяются человеком.' };
await writeFile(new URL('voice-test.json', directory), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

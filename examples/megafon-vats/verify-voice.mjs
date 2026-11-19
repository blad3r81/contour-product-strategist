import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:5175';
const recording = process.argv[3];
const prompt = 'Что проверить перед пилотом сервиса контроля пропущенных звонков? Ответь двумя короткими предложениями.';
const origin = 'https://vats.megafon.ru/missed_calls_control';
const history = [
  { role: 'user', content: 'Привет' },
  { role: 'assistant', content: 'Здравствуйте! Какую продуктовую задачу разберём?' },
  { role: 'user', content: 'Мы обсуждаем контроль пропущенных звонков ВАТС МегаФона для малого сервисного бизнеса.' },
  { role: 'assistant', content: 'Сравним направления для пилота и уточним, как измерять долю звонков без попытки перезвонить.' },
];
const now = () => Math.round(performance.now());

async function post(action, body) {
  const response = await fetch(new URL(`/api/${action}`, base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.CONTOUR_ACCESS_CODE ? { 'x-contour-access': process.env.CONTOUR_ACCESS_CODE } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(190_000),
  });
  if (!response.ok) throw Error(`${action} (${response.status}) ${await response.text()}`);
  return response;
}

async function wav(text) {
  const start = now();
  const { audio } = await (await post('speak', { text })).json();
  assert.equal(Buffer.from(audio || '', 'base64').subarray(0, 4).toString(), 'RIFF');
  return now() - start;
}

async function readTurn(question, extra = {}) {
  const started = now();
  const response = await post('chat', { prompt: question, spoken: true, stream: true, history, ...extra });
  const decoder = new TextDecoder();
  let pending = '';
  let first;
  let result;
  let synthesis;
  let progressSpeech;
  for await (const chunk of response.body) {
    const lines = (pending + decoder.decode(chunk, { stream: true })).split('\n');
    pending = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.error) throw Error(event.error);
      if (event.speechStatus && !progressSpeech) {
        progressSpeech = wav(event.speechStatus).then(() => now() - started, error => ({ error }));
      }
      if (event.preview && !synthesis) {
        first = now() - started;
        synthesis = wav(event.preview).then(ms => ({ ms, elapsed: now() - started }), error => ({ error }));
      }
      if (event.result) result = event.result;
    }
  }
  const progressWavMs = await progressSpeech;
  if (progressWavMs?.error) throw progressWavMs.error;
  if (!result?.text || result.incomplete || result.blocked) {
    console.error(JSON.stringify({ check: 'incomplete-turn', elapsedMs: now() - started, progressWavMs, trace: result?.trace, warning: result?.warning }));
    throw Error('Голосовая реплика осталась без содержательного ответа.');
  }
  if (process.env.CONTOUR_EXPECT_MODEL) assert.equal(result.model, process.env.CONTOUR_EXPECT_MODEL, 'Тест подключился к другой модели.');
  const full = now() - started;
  const speech = synthesis ? await synthesis : { ms: await wav(result.spokenText || result.text.slice(0, 115)) };
  if (speech.error) throw speech.error;
  return { model: result.model, firstTextMs: first ?? full, fullTextMs: full, synthesisMs: speech.ms, firstWavMs: speech.elapsed ?? now() - started, progressWavMs, trace: result.trace, sources: result.sources, charts: result.charts, text: result.text };
}

let recognized;

if (recording) {
  const started = now();
  const audio = (await readFile(recording)).toString('base64');
  const { text } = await (await post('transcribe', { audio, speechOnly: true })).json();
  assert.ok(text?.trim(), 'Запись осталась без расшифровки.');
  console.log(JSON.stringify({ check: 'transcription', ms: now() - started, text }));
  recognized = text;
}

const files = await Promise.all(['brief.txt', 'measurements.csv'].map(async name => ({ name, base64: (await readFile(new URL(name, import.meta.url))).toString('base64') })));
const strategy = await readTurn(recognized || 'Сравни три варианта продуктовой и коммуникационной стратегии. Что проверить перед пилотом? Покажи динамику на графике.', { urls: [origin], files });
assert.ok(strategy.sources?.some(source => source.url === origin && source.excerpt && !source.error), 'Документация ВАТС не прочитана.');
assert.match(strategy.text, /вариант|альтернатив/i, 'В стратегии отсутствует сравнение вариантов.');
assert.match(strategy.text, /провер|пилот/i, 'В стратегии отсутствует план пилота.');
assert.ok(strategy.trace?.timings?.modelMs > 0, 'Нет серверных замеров генерации.');
assert.match(strategy.text, /(?:36\/200 = 18%.*44\/200 = 22%.*4 п\. п\.|выросла: 18% до пилота и 22% в пилоте)/i, 'Направление изменения доли проверено неверно.');
assert.ok(strategy.charts?.some(chart => chart.points[0]?.value === 18 && chart.points[1]?.value === 22), 'В ответе отсутствует график исходных долей.');
console.log(JSON.stringify({ check: 'strategy-with-context', ...strategy }));
if (process.env.CONTOUR_VOICE_STRATEGY_ONLY === '1') process.exit(0);

console.log(JSON.stringify({ check: 'short-question', ...await readTurn(prompt) }));
const linked = await readTurn(`Что показывает раздел «История» по пропущенным звонкам? Ответь одним предложением по ${origin}`);
assert.ok(linked.sources?.some(source => source.url === origin && source.excerpt && !source.error), 'В голосовом режиме официальный источник не прочитан.');
console.log(JSON.stringify({ check: 'question-with-link', ...linked }));

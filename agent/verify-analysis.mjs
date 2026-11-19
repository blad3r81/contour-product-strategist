import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readDocument, selectDocumentText } from '../server/materials.js';
import { formatStrategy, strategySchema } from '../server/strategy.js';
import { tableReview } from '../server/review.js';

const source = await readDocument('interview.vtt', Buffer.from('WEBVTT\n\n00:09.120 --> 00:12.000\nНе сразу нашла, где отменить запись.'));
assert.match(source.text, /\[00:09.120 --> 00:12.000\] Не сразу нашла/);
await assert.rejects(readDocument('broken.srt', Buffer.from('Без временной метки')), /таймкодом/);
const table = 'Когорта;Регистрации;Вернулись на 7-й день;Удержание D7 (%)\nОктябрь;100;18;18\nНоябрь;100;12;12';
const { measurements } = await readDocument('retention.csv', Buffer.from(table));
assert.match(measurements[0], /18\/100 = 18%.*12\/100 = 12%.*[-−]6 п\. п\./u);
const inconsistent = await readDocument('retention.csv', Buffer.from(table.replace('100;12;12', '100;12;15')));
assert.match(inconsistent.measurements[0], /15% не совпадает с расчётом 12\/100 = 12%/);
assert.doesNotMatch(inconsistent.measurements[0], /п\. п\./);
assert.ok(!inconsistent.chartOptions.some(item => item.label === 'Удержание D7 (%)'));
const { ratios } = await readDocument('review.csv', Buffer.from(table.split('\n').filter((_, row) => row !== 1).join('\n')));
const fresh = ratios.map(item => ({ ...item, source: 'Ф1' }));
assert.equal(tableReview('Удержание D7 ниже 15%', fresh).crossed, true);
assert.equal(tableReview('Удержание D7 ниже 12%', fresh).crossed, false);
assert.equal(tableReview('Удержание D7 ниже 15%', [...fresh, ...fresh]), undefined);

const fields = Object.fromEntries(strategySchema.required.map(key => [key, 'Проверить конкретный вариант с руководителем.']));
const answer = JSON.stringify({ ...fields, preferred: 'keep', evidence: [
  { id: 'Ф1', quote: 'Не сразу нашла, где отменить запись.' },
  { id: 'Ф1', quote: 'Пользователь никогда не возвращался после регистрации.' },
] });
const formatted = formatStrategy(answer, [{ id: 'Ф1', text: source.text }], measurements, false);
assert.equal(formatted.validation.verifiedExcerpts, 1);
assert.doesNotMatch(formatted.text, /никогда не возвращался/);
assert.match(formatted.text, /Предварительно предлагаю сохранить текущий подход/);
assert.equal(formatStrategy(answer, [], inconsistent.measurements, false).validation.status, 'draft');
assert.equal(formatStrategy('{"pilot":"гарантируем 100% роста"}', [], [], false).validation.status, 'draft');
assert.equal(formatStrategy('null', [], [], false).validation.status, 'draft');
const citation = { ...JSON.parse(answer), proof: 'Проверить понимание на форме [Ф1].' };
assert.equal(formatStrategy(JSON.stringify(citation), [{ id: 'Ф1', text: source.text }], measurements, false).validation.status, 'proposal', 'Номер источника не является новой числовой гипотезой.');
const csv = await readDocument('cohorts.csv', await readFile(new URL('../examples/procurement/cohorts.csv', import.meta.url)));
const xlsx = await readDocument('cohorts.xlsx', await readFile(new URL('../examples/procurement/cohorts.xlsx', import.meta.url)));
assert.deepEqual(xlsx.chartOptions.map(chart => chart.points), csv.chartOptions.map(chart => chart.points));
const longDocument = 'Введение. '.repeat(900) + '\nОграничения: бюджет проверки согласует руководитель.\n' + 'Архив. '.repeat(1500);
const excerpt = selectDocumentText(longDocument, 'Какие ограничения у бюджета проверки?');
assert.match(excerpt.text, /бюджет проверки согласует руководитель/);
assert.match(excerpt.coverage, /Остальной текст/);
await assert.rejects(readDocument('empty.txt', Buffer.from('')), /нет читаемого текста/);
console.log('PASS. Таймкоды, проверка долей и проверка отчёта.');

if (process.argv[2]) {
  const response = await fetch(new URL('/api/chat', process.argv[2]), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.CONTOUR_ACCESS_CODE ? { 'x-contour-access': process.env.CONTOUR_ACCESS_CODE } : {}) },
    signal: AbortSignal.timeout(100_000),
    body: JSON.stringify({
      prompt: 'Руководитель сервиса бронирования занятий решает, менять ли онбординг. Разбивки по каналам нет. Дай стратегию проверки удержания, три варианта и график доли D7. Не делай причинных выводов.',
      files: [{ name: 'retention.csv', base64: Buffer.from(table).toString('base64') }],
    }),
  });
  const result = await response.json();
  assert.ok(response.ok && !result.incomplete && !result.blocked, result.error || result.warning);
  assert.deepEqual(result.charts[0].points.map(point => point.value), [18, 12]);
  assert.match(result.text, /18\/100 = 18%.*12\/100 = 12%.*[-−]6 п\. п\./);
  assert.match(result.text, /Оставить как есть.*\n.*Закрыть направление.*\n.*Ограниченный пилот/);
  assert.equal(result.validation.measurements, 1);
  console.log(JSON.stringify({ model: result.model, trace: result.trace, validation: result.validation, text: result.text }, null, 2));

  const review = await fetch(new URL('/api/chat', process.argv[2]), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.CONTOUR_ACCESS_CODE ? { 'x-contour-access': process.env.CONTOUR_ACCESS_CODE } : {}) },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      prompt: 'Пересмотри сохранённое решение по новой таблице.',
      decision: { choice: 'Сохранить текущий онбординг', why: 'В предыдущей когорте 18 из 100 вернулись на седьмой день.', trigger: 'Удержание D7 ниже 15%', owner: 'Руководитель продукта' },
      files: [{ name: 'review.csv', base64: Buffer.from(table.split('\n').filter((_, row) => row !== 1).join('\n')).toString('base64') }],
    }),
  });
  const update = await review.json();
  assert.ok(review.ok, update.error);
  assert.equal(update.provider, 'Проверка данных');
  assert.match(update.text, /\[Ф1\].*12 \/ 100 = 12%.*ниже 15%.*Условие пересмотра сработало/);
  console.log(`PASS. Пересмотр удержания на новых данных за ${update.trace.seconds} с.`);
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateRatio, ratioCandidates } from '../server/research.js';
import { readCase, saveCase } from '../server/cases.js';
import { tableReview } from '../server/review.js';

const table = {
  columns: ['Когорта', 'Все аккаунты', 'Аккаунты с событием', 'Доля события (%)'],
  rows: [['A', 120, 48, 40], ['B', 150, 45, 30]],
};
const mapping = { source: 'Ф2', numerator: 2, denominator: 1, rate: 3, reason: 'Проверить изменение активации.' };
const computed = calculateRatio(table, mapping);
assert.equal(computed.valid, true);
assert.match(computed.text, /48\/120 = 40%/);
assert.match(computed.text, /45\/150 = 30%/);
assert.match(computed.text, /-10 п\. п\./);
assert.equal(tableReview('Доля события ниже 30%', computed.ratios), undefined, 'Неоднозначный период нельзя выбрать за пользователя.');
assert.equal(calculateRatio({ ...table, rows: [['A', 0, 0, 0]] }, mapping).valid, false);
assert.equal(calculateRatio({ ...table, rows: [['A', 120, 48, 41]] }, mapping).chart, undefined);
const counts = { columns: ['cohort', 'registered', 'second_booking_30d'], rows: [['2026-08', 120, 48], ['2026-09', 150, 45], ['2026-10', 100, 28]] };
const derived = calculateRatio(counts, { ...mapping, rate: -1 });
assert.equal(derived.valid, true);
assert.deepEqual(derived.chart.points.map(point => Math.round(point.value * 1e8) / 1e8), [40, 30, 28]);
assert.equal(ratioCandidates([{ id: 'Ф2', data: counts }]).length, 1);
assert.equal(calculateRatio({ ...counts, rows: [['empty', 0, 0]] }, { ...mapping, rate: -1 }).chart, undefined);
assert.equal(calculateRatio({ ...counts, rows: [['bad', 100, 101]] }, { ...mapping, rate: -1 }).valid, false);
const id = `verify-${Date.now()}`;
const initial = { stage: 'brief', task: 'Учебная задача', next: 'Прочитать материал', evidence: [] };
const saved = await saveCase(id, initial, null);
const changed = await saveCase(id, { ...initial, stage: 'research', next: 'Проверить варианты' }, saved.revision);
assert.equal((await readCase(id)).state.next, 'Проверить варианты');
await assert.rejects(saveCase(id, initial, saved.revision), /изменилось/);
await assert.rejects(readCase('../outside'), /название/);
assert.equal((await readCase(id)).state.previousRevision, saved.revision);
assert.notEqual(saved.revision, changed.revision);
const material = { name: 'notes.txt', base64: Buffer.from('Собственный учебный материал.').toString('base64') };
const video = { name: 'clip.mp4', durationSeconds: 10, sampledSeconds: [0, 3.333, 6.667, 9.9], audio: false };
const materialState = await saveCase(id, { ...initial, files: [material, { ...material, name: 'copy.txt' }, { ...material, name: 'frames.jpg', video }] }, changed.revision);
const restored = await readCase(id);
assert.equal(restored.state.files[0].base64, material.base64);
assert.equal(restored.state.files[0].file, restored.state.files[1].file, 'Одинаковые файлы должны храниться один раз.');
assert.deepEqual(restored.state.files[2].video, video, 'Восстановление кадров должно сохранять таймкоды и границы видео.');
const raw = JSON.parse(await readFile(new URL(`../cases/${id}/checkpoints/${materialState.revision}`, import.meta.url), 'utf8'));
assert.equal(raw.files[0].base64, undefined, 'Материалы должны храниться отдельно от состояния.');
console.log('PASS. Произвольная доля, нулевой знаменатель, несогласованные данные, неоднозначный период, восстановление и конфликт версий.');

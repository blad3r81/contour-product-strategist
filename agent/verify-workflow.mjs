import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateRatio } from '../server/research.js';
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
const materialState = await saveCase(id, { ...initial, files: [material, { ...material, name: 'copy.txt' }] }, changed.revision);
const restored = await readCase(id);
assert.equal(restored.state.files[0].base64, material.base64);
assert.equal(restored.state.files[0].file, restored.state.files[1].file, 'Одинаковые файлы должны храниться один раз.');
const raw = JSON.parse(await readFile(new URL(`../cases/${id}/checkpoints/${materialState.revision}`, import.meta.url), 'utf8'));
assert.equal(raw.files[0].base64, undefined, 'Материалы должны храниться отдельно от состояния.');
console.log('PASS. Произвольная доля, нулевой знаменатель, несогласованные данные, неоднозначный период, восстановление и конфликт версий.');

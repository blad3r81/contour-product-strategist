import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { readCase, saveCase } from '../server/cases.js';
import { checkMonitor } from '../server/monitor.js';

const id = `monitor-${Date.now()}`;
const inbox = new URL(`../cases/${id}/inbox/`, import.meta.url);
await saveCase(id, { stage: 'decision', task: 'Учебный мониторинг активации', next: 'Проверить данные',
  decision: { choice: 'Ограниченный пилот', trigger: 'Активация ниже 30%', owner: 'Руководитель продукта' },
  monitor: { enabled: true, inbox: 'latest.csv', intervalSeconds: 10 } }, null);
await mkdir(inbox, { recursive: true });
const csv = value => `Период,Все компании,Активированные компании,Активация (%)\nНовый,100,${value},${value}\n`;
await writeFile(new URL('latest.csv', inbox), csv(28));
const first = await checkMonitor(id, { force: true });
assert.equal(first.status, 'review');
assert.match(first.summary, /28 \/ 100 = 28%/);
assert.equal((await checkMonitor(id, { force: true })).changed, false);
// A new process must not create a duplicate notice after restart.
execFileSync(process.execPath, ['agent/monitor.mjs', '--once'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
assert.equal((await readCase(id)).state.monitorNotices.length, 1);
await writeFile(new URL('latest.csv', inbox), csv(35));
assert.equal((await checkMonitor(id, { force: true })).status, 'ok');
await writeFile(new URL('latest.csv', inbox), 'Период,Все компании,Активированные компании,Активация (%)\nНовый,0,0,0\n');
assert.equal((await checkMonitor(id, { force: true })).status, 'error');
assert.equal((await checkMonitor(id, { force: true })).changed, false);
await writeFile(new URL('latest.csv', inbox), csv(29));
assert.equal((await checkMonitor(id, { force: true })).status, 'review');
const final = await readCase(id);
assert.equal(final.state.monitorNotices.length, 4);
assert.equal(final.state.decision.choice, 'Ограниченный пилот');
await assert.rejects(checkMonitor('../outside', { force: true }));
// Leave the synthetic test fixture disabled so it consumes no background work.
await saveCase(id, { ...final.state, monitor: { ...final.state.monitor, enabled: false } }, final.revision);
console.log('PASS. Фоновый пересмотр, повтор без дубля, новый процесс, нормализация, ошибка данных и восстановление; выбор человека сохранён.');

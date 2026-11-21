import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const base = process.env.CONTOUR_DEMO_URL || 'http://127.0.0.1:5180';
const step = process.argv[2] || '00-intake';
const prompt = await fs.readFile(`${root}prompts/${step}.md`, 'utf8');
const pdf = await fs.readFile(`${root}materials/official-brief.pdf`);
const files = [{ name: 'official-brief.pdf', base64: pdf.toString('base64') }];
if (step !== '00-intake') {
  const calculation = await fs.readFile(`${root}materials/calculations.md`, 'utf8').catch(() => '');
  if (calculation) files.push({ name: 'calculations.md', base64: Buffer.from(calculation).toString('base64') });
}
if (step === '06-review') files.push({ name: 'strategy.md', base64: (await fs.readFile(`${root}materials/strategy-for-review.md`)).toString('base64') });
const decision = step === '07-resume' ? {
  choice: 'Учебный выбор: проверить дешёвый семейный сигнал, не масштабировать до доказательств',
  owner: 'Роль: руководитель продукта учебного оператора',
  metric: 'Ограничение по исчерпанию за7суток; оплаченные номеро-месяцы',
  trigger: 'При медленном наборе пересчитать сроки и вернуться к руководителю до расширения',
  updates: 'Новый учебный сценарий:20подходящих семей в неделю вместо условных100. Не данные исходного брифа.',
} : undefined;
const started = new Date();
const response = await fetch(`${base}/api/chat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt, files, decision, useCatalog: false, readAll: true, outputMode: 'report', persist: true, caseId: 'official-megafon-brief', project: { title: 'Официальный бриф: связь для близких и устройств' } }),
  signal: AbortSignal.timeout(240000),
});
const result = await response.json();
const record = { started: started.toISOString(), ended: new Date().toISOString(), seconds: (Date.now() - started.getTime()) / 1000, sourceSha256: createHash('sha256').update(pdf).digest('hex'), ...result };
await fs.mkdir(`${root}results`, { recursive: true });
await fs.writeFile(`${root}results/${step}.json`, JSON.stringify(record, null, 2));
await fs.writeFile(`${root}results/${step}.md`, (result.text || result.error || 'Нет текста ответа') + '\n');
console.log(JSON.stringify({ step, seconds: record.seconds, characters: result.text?.length || 0, model: result.model, usage: result.usage, warning: result.warning, coverage: result.sources?.map(s => ({ name: s.name, coverage: s.coverage, error: s.error })) }, null, 2));
if (!response.ok || !result.text || result.incomplete || result.blocked) throw Error(result.error || result.warning || 'Incomplete model response');

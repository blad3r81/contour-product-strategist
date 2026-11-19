import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://127.0.0.1:5175';
const caseId = 'procurement-check';
const output = new URL(`../../cases/${caseId}/`, import.meta.url);
await mkdir(output, { recursive: true });
const events = [];
async function post(action, payload) {
  const started = Date.now();
  const response = await fetch(new URL(`/api/${action}`, base), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(420_000),
  });
  if (!response.ok) throw Error(`${action}: ${await response.text()}`);
  const result = await response.json();
  events.push({ action, seconds: (Date.now() - started) / 1000, trace: result.trace, usage: result.usage, validation: result.validation });
  console.log(JSON.stringify(events.at(-1)));
  return result;
}
async function attachment(name) {
  return { name, base64: (await readFile(new URL(name, import.meta.url))).toString('base64') };
}

const files = await Promise.all(['brief.txt', 'cohorts.csv', 'interviews.vtt'].map(attachment));
const initial = 'Развиваем сервис согласования заявок на закупку для небольших компаний. Меньше новых компаний отправляют первую заявку. Нужно решить, продолжать ли развитие направления. Какие вводные действительно нужны для следующего шага? Кратко.';
const briefAnswer = await post('chat', { prompt: initial });
const prompt = 'Исследуй приложенные материалы сервиса согласования заявок на закупку. Предложи продуктовую и коммуникационную стратегию. Сравни три направления, включая оставить как есть и закрыть направление, с сильным возражением к каждому. Выбери предварительно один вариант с обоснованием. Проверь числа и покажи график активации. Ограничь изменения пояснением к существующей форме и примером заполнения. Синтетические реплики являются только гипотезами. Не принимай окончательное решение за руководителя.';
const strategy = await post('chat', {
  prompt, files,
  urls: ['https://support.google.com/docs/answer/6281888?hl=ru', 'http://127.0.0.1/'],
});
await writeFile(new URL('after.json', output), JSON.stringify(strategy, null, 2));
const project = {
  id: caseId, caseId, title: 'Учебное исследование · Сервис заявок на закупку',
  messages: [
    { role: 'user', content: initial }, { role: 'assistant', content: briefAnswer.text, ...briefAnswer },
    { role: 'user', content: prompt }, { role: 'assistant', content: strategy.text, ...strategy },
  ],
  files: files.map(item => item.name), decision: {},
};
let checkpoint = await post('case', { operation: 'save', id: caseId, state: {
  stage: 'options', task: 'Выбрать направление развития сервиса заявок на закупку',
  brief: Buffer.from(files[0].base64, 'base64').toString(),
  next: 'Руководитель выбирает вариант и подтверждает основания, бюджет и условия проверки.',
  project, files,
  gaps: ['Нет маржи, цены лицензии и стоимости поддержки.', 'Две когорты из разных каналов, причинный эффект неизвестен.', 'Модельные реплики не подтверждают спрос.'],
  evidence: strategy.sources.filter(source => source.excerpt && !source.error).map(source => ({ source: source.name || source.url, quote: source.excerpt })),
  execution: events,
} });

// The following choice is an explicitly simulated user decision for the acceptance test.
const decision = {
  choice: 'Учебный выбор руководителя: ограниченный пилот пояснения и примера заполнения существующей формы',
  why: 'В исходном учебном замере 48 из 120 и 45 из 150 компаний отправили первую корректную заявку. Каналы различаются, причинного эффекта нет.',
  product: 'Изменить пояснение существующей формы и добавить пример. Ручное согласование сохраняется.',
  communication: 'Показать на форме, какие данные нужны для первой заявки. Не обещать автоматическую закупку, интеграцию с ERP или экономию.',
  check: 'Случайно распределить новые компании одного канала между действующим сценарием и пилотом. Полное семидневное окно, отслеживать ошибки заявок и нагрузку поддержки. Лимит бюджета 40 тысяч рублей.',
  owner: 'Руководитель продукта — учебная роль',
  trigger: 'Активация за 7 дней ниже 30%',
};
checkpoint = await post('case', { operation: 'save', id: caseId, revision: checkpoint.revision, state: {
  ...checkpoint.state, stage: 'decision', decision,
  next: 'Проверить новые данные по порогу 30% и предложить следующее действие ответственному.',
  project: { ...project, decision, decisionVersions: [{ savedAt: new Date().toISOString(), fields: decision }] },
} });

// A new Node process restores disk state, independent of browser history.
const resumed = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../../agent/cli.mjs', import.meta.url)), 'resume', caseId], { encoding: 'utf8' }));
assert.equal(resumed.state.decision.trigger, decision.trigger);
assert.match(resumed.state.next, /30%/);
const newFile = await attachment('new-data.csv');
const review = await post('chat', {
  caseId,
  prompt: 'Пересмотри сохранённое решение по новой таблице. Какие основания изменились и что решать сейчас?',
  files: [newFile],
});
await writeFile(new URL('review.json', output), JSON.stringify(review, null, 2));
project.messages.push({ role: 'user', content: 'После паузы появились новые учебные данные: 28 из 100 компаний отправили первую корректную заявку.' }, { role: 'assistant', content: review.text, ...review });
const updated = { ...decision, updates: 'В новом замере 28/100 = 28%. Порог ниже 30% сработал. Данных контрольной группы пока нет. Масштабирование отложить, собрать сопоставимые результаты.' };
checkpoint = await post('case', { operation: 'save', id: caseId, revision: checkpoint.revision, state: {
  ...checkpoint.state, stage: 'review', decision: updated,
  files: [...files, newFile],
  next: 'Собрать контрольную группу и проверить корректность заявок и нагрузку поддержки. Вернуться к выбору с руководителем.',
  project: { ...project, files: [...files, newFile].map(item => item.name), decision: updated, decisionVersions: [...checkpoint.state.project.decisionVersions, { savedAt: new Date().toISOString(), fields: updated }] },
  review, execution: events,
} });
const checks = {
  hasReport: Boolean(strategy.text && !strategy.incomplete && !strategy.blocked),
  sourcesRead: strategy.sources.filter(source => !source.error).length,
  inaccessibleSourceVisible: strategy.sources.some(source => source.error),
  plan: strategy.trace.actions.some(action => action.tool === 'research_plan' && action.status === 'done'),
  calculation: strategy.trace.actions.some(action => action.tool === 'calculate_ratio' && action.status === 'done' && /48\/120 = 40%/.test(action.detail) && /45\/150 = 30%/.test(action.detail)),
  graph: strategy.charts.some(chart => /активация/i.test(chart.label) && JSON.stringify(chart.points.map(point => point.value)) === '[40,30]'),
  options: /Оставить как есть/.test(strategy.text) && /Закрыть направление/.test(strategy.text) && /Ограниченный пилот/.test(strategy.text),
  sectionsComplete: strategy.validation?.missing?.length === 0,
  proposal: strategy.validation?.status === 'proposal',
  memory: Boolean(review.trace.resumedFrom),
  threshold: review.provider === 'Проверка данных' && /28 \/ 100 = 28%/.test(review.text) && /Условие пересмотра сработало/.test(review.text),
  priorChoiceKept: checkpoint.state.project.decisionVersions.length === 2,
};
await writeFile(new URL('acceptance.json', output), JSON.stringify({ checkedAt: new Date().toISOString(), checks, events, url: new URL(`/cases/${caseId}`, base).href }, null, 2));
console.log(JSON.stringify({ checks, url: new URL(`/cases/${caseId}`, base).href }, null, 2));
assert.ok(Object.values(checks).every(value => typeof value === 'number' ? value >= 3 : value), 'Некоторые критерии не прошли. Смотрите cases/procurement-check/acceptance.json');

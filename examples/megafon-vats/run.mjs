import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const endpoint = new URL('/api/chat', process.argv[2] || 'http://127.0.0.1:5175');
const source = 'https://vats.megafon.ru/missed_calls_control';
const spoken = process.env.CONTOUR_TEST_SPOKEN === '1';

async function file(name) {
  const bytes = await readFile(new URL(name, import.meta.url));
  return { name, base64: bytes.toString('base64') };
}

async function ask(prompt, files, decision) {
  const start = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.CONTOUR_ACCESS_CODE ? { 'x-contour-access': process.env.CONTOUR_ACCESS_CODE } : {}) },
    signal: AbortSignal.timeout(190_000),
    body: JSON.stringify({ prompt, files, decision, urls: [source], spoken }),
  });
  const result = await response.json();
  if (process.env.CONTOUR_EXPECT_MODEL && !decision) assert.equal(result.model, process.env.CONTOUR_EXPECT_MODEL, 'Тест подключился к другой модели.');
  console.log(JSON.stringify({ seconds: Math.round((performance.now() - start) / 100) / 10, ...result }, null, 2));
  assert.ok(response.ok, result.error);
  assert.ok(result.text && !result.blocked && !result.incomplete, 'Анализ остался незавершённым.');
  if (spoken) assert.ok(result.spokenText, 'Нет краткой голосовой версии полного ответа.');
  if (result.provider === 'Агент · онлайн') assert.ok(result.reviewed || result.validation, 'Сверка стратегии с материалами не завершилась.');
  assert.ok(result.sources.some(item => item.url === source && item.excerpt && !item.error), 'Официальный источник недоступен.');
  return result;
}

const brief = await file('brief.txt');
const strategy = await ask('Стоит ли продвигать контроль пропущенных звонков Виртуальной АТС МегаФона среди малого сервисного бизнеса? Сравни минимум три варианта, включая сохранить как есть и закрыть направление. Дай обе стратегии, план проверки, сильные возражения и график доли без обратного звонка. До 700 слов.', [brief, await file('measurements.csv')]);
assert.deepEqual(strategy.charts.map(chart => chart.label), ['Без обратного звонка (%)']);
assert.deepEqual(strategy.charts[0].points.map(point => point.value), [18, 22]);
assert.match(strategy.text, /закры/i);
assert.match(strategy.text, /оставить как есть|сохранить как есть|статус-кво/i, 'Нет явного варианта сохранения текущего положения.');
assert.match(strategy.text, /возражен/i, 'Нет явных возражений.');
assert.match(strategy.text, /коммуникац/i, 'Нет коммуникационной стратегии.');
assert.match(strategy.text, /план проверки|эксперимент/i, 'Нет плана проверки.');
assert.match(strategy.text, /18\s*%/);
assert.match(strategy.text, /22\s*%/);
assert.match(strategy.text, /36\/200 = 18%/);
assert.match(strategy.text, /44\/200 = 22%/);
assert.match(strategy.text, /4 п\. п\./);
assert.ok(strategy.validation);
assert.equal(strategy.validation.measurements, 1);

const review = await ask('Проверь условие пересмотра по новым вводным. В учебном замере за период пилота по 44 из 200 пропущенных звонков сотрудники не попытались перезвонить. Контрольной группы нет. Что решать сейчас и какие данные нужны для вывода об эффекте? До 300 слов.', [brief], {
  choice: 'Провести пилот напоминаний сотрудникам',
  why: 'В учебном замере до пилота в 18% случаев не было попытки перезвонить',
  trigger: 'Пересмотреть, если доля выше 20%',
  owner: 'Руководитель продукта',
});
assert.match(review.text, /22\s*%/);
assert.match(review.text, /20\s*%/);
assert.match(review.text, /превыш|сработа|выполнено/i);
assert.equal(review.provider, 'Проверка данных');

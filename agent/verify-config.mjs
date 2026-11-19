import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { route, separateCustomerCopy } from '../server/routes.js';

process.env.CONTOUR_LLM_BACKEND = 'gigachat';
delete process.env.GIGACHAT_AUTH_KEY;
const response = new EventEmitter();
response.setHeader = () => {};
let result;
response.end = value => { result = JSON.parse(value); };
await route('chat', { method: 'POST', headers: {}, body: { prompt: 'Помоги разобраться с удержанием.' } }, response, true);
assert.equal(response.statusCode, 502);
assert.match(result.error, /GIGACHAT_AUTH_KEY/);
assert.doesNotMatch(result.error, /Qwen|Ollama/);
const copy = separateCustomerCopy('[СООББЩЕНИЕ_КЛИЕНТУ]Гарантируем рост продаж[/СООБЩЕНИЕ_КЛИЕНТУ]', []);
assert.ok(copy.warning);
assert.doesNotMatch(copy.text, /СООБ|Гарантируем рост/);
console.log('PASS. Без ключа выбранного GigaChat показана ошибка настройки; незаметного перехода на локальную модель нет.');

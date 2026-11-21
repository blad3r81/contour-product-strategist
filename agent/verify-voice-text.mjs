import assert from 'node:assert/strict';
import { speechParts } from '../src/voice-text.ts';

const text = 'Проверьте одинаковый срок наблюдения за когортами. '.repeat(30).trim();
const chunks = speechParts(text, 440);
assert.ok(chunks.length > 1);
assert.ok(chunks.every(chunk => chunk.length <= 440));
assert.ok(chunks[0].length <= 120, 'The first audio clip must remain short');
assert.equal(chunks.join(' '), text);
assert.deepEqual(speechParts('**Вывод** [Ф1]\n[Источник](https://example.com).'), ['Вывод Источник.']);
console.log('PASS. Bounded speech chunks preserve the full answer and remove service markup.');

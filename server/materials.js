import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { Agent, fetch } from 'undici';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import mammoth from 'mammoth';
import { readSheet } from 'read-excel-file/node';
import { parse } from 'csv-parse/sync';

export const MAX_FILE_BYTES = 2_000_000;

export async function readPublicUrl(input, signal, query = '') {
  let url = new URL(input);
  for (let hop = 0; hop < 4; hop++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password) throw Error('Допускаются публичные HTTP(S) ссылки.');
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const stop = () => reject(signal.reason);
      signal.addEventListener('abort', stop, { once: true });
      lookup(hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
    });
    if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== 'unicast')) throw Error('Адрес не является публичным.');
    const dispatcher = new Agent({ connect: { lookup: (_host, options, callback) => {
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    } } });
    try {
      const response = await fetch(url, { dispatcher, redirect: 'manual', signal, headers: { accept: 'text/html,text/plain,application/pdf' } });
      if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
        await response.body?.cancel();
        url = new URL(response.headers.get('location'), url);
        continue;
      }
      if (!response.ok || !response.body) throw Error(`Страница вернула HTTP ${response.status}.`);
      const type = response.headers.get('content-type') || '';
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_FILE_BYTES) throw Error('Материал превышает 2 МБ.');
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      if (type.includes('pdf')) return { url: url.href, ...await readDocument('source.pdf', buffer, query) };
      if (type.includes('text/plain')) return { url: url.href, ...selectDocumentText(buffer.toString(), query) };
      if (!type.includes('text/html')) throw Error('Формат страницы не поддерживается.');
      const $ = load(buffer.toString());
      $('script,style,header,nav,footer,aside,noscript,iframe').remove();
      const scope = $('main').first().length ? $('main').first() : $('body');
      const text = scope.find('h1,h2,h3,p,li,tr').map((_, node) => $(node).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).join('\n');
      if (text.length < 60) throw Error('На странице не удалось извлечь достаточно текста.');
      return { url: url.href, ...selectDocumentText(`${$('title').text()}\n${text}`, query) };
    } finally {
      await dispatcher.destroy();
    }
  }
  throw Error('Слишком много перенаправлений.');
}

export async function findProjectSources(prompt) {
  const query = prompt.toLowerCase();
  const catalog = JSON.parse(await readFile(new URL('../agent/sources.json', import.meta.url), 'utf8'));
  return catalog.map(source => ({ ...source, score: source.terms.filter(term => query.includes(term)).length }))
    .filter(source => source.score >= 2)
    .sort((a, b) => b.score - a.score).slice(0, 2).map(source => source.url);
}

export async function gatherLinks(text, existing = [], signal) {
  const urls = [...new Set([...(text.match(/https?:\/\/[^\s<>"`]+/g) || []).map(url => url.replace(/[.,;!?\])»]+$/, '')), ...existing])].slice(0, 3);
  return Promise.all(urls.map(async (url, index) => {
    const id = `И${index + 1}`;
    const deadline = AbortSignal.timeout(7500);
    try { return { id, ...await readPublicUrl(url, signal ? AbortSignal.any([signal, deadline]) : deadline, text) }; }
    catch (error) {
      signal?.throwIfAborted();
      return { id, url, error: deadline.aborted ? 'Источник не ответил вовремя.' : error.message };
    }
  }));
}

function table(rows, name) {
  const [columns, ...values] = rows;
  if (!columns?.length || !values.length) throw Error('В таблице нет заголовка и строк данных.');
  const number = value => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || !/^[+-]?\d+(?:[,.]\d+)?$/.test(value.trim())) return NaN;
    return Number(value.trim().replace(',', '.'));
  };
  const chartOptions = values.length <= 40 && values.every(row => String(row[0] ?? '').trim()) ? columns.flatMap((column, index) => {
    if (index === 0 || !String(column ?? '').trim() || values.some(row => !Number.isFinite(number(row[index])))) return [];
    return [{ name, label: String(column), category: String(columns[0]), points: values.map(row => ({ label: String(row[0]), value: number(row[index]) })) }];
  }) : [];
  const sample = rows.slice(0, 91).map(row => JSON.stringify(row)).join('\n').slice(0, 8000);
  const missing = columns.map((column, index) => [column, values.filter(row => row[index] == null || String(row[index]).trim() === '').length]).filter(([, count]) => count > 0);
  const quality = missing.length ? `Пропуски по столбцам: ${JSON.stringify(missing).slice(0, 650)}.` : 'Пропусков в именованных столбцах не найдено.';
  const { measurements, ratios, invalidLabels } = tableMeasurements(columns, values, number);
  return { ...(values.length <= 40 ? { table: { columns: columns.map(String), rows: values } } : {}), chartOptions: chartOptions.filter(option => !invalidLabels.includes(option.label)), measurements, ratios, text: `Строк данных: ${values.length}. ${quality} Фрагмент до 90 строк, до 8000 символов. XLSX: первый лист.\n${sample}` };
}

function tableMeasurements(columns, rows, number) {
  const ratios = [];
  const invalidLabels = [];
  if (rows.length > 40) return { measurements: [], ratios, invalidLabels };
  const headers = columns.map(value => String(value ?? ''));
  const format = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  const known = [
    [/без обратного звонка/i, /без обратного звонка.*шт/i, /^пропущено звонков$/i],
    [/удержание\s+D7/i, /вернулись на 7-й день/i, /^регистрации$/i],
  ];
  const measurements = headers.flatMap((label, index) => {
    if (index === 0 || !/%/.test(label)) return [];
    const numbers = rows.map(row => number(row[index]));
    const basis = known.find(([metric]) => metric.test(label));
    const numerator = basis ? headers.findIndex(header => basis[1].test(header)) : -1;
    const denominator = basis ? headers.findIndex(header => basis[2].test(header)) : -1;
    const verified = [];
    const refs = rows.map((row, i) => {
      const base = `строка данных ${i + 1} (${String(row[0] ?? '').slice(0, 100)})`;
      const value = numbers[i];
      if (!Number.isFinite(value) || value < 0 || value > 100) return `${base}: нет корректной доли`;
      if (numerator < 0 || denominator < 0) return `${base}: ${format(value)}%, числитель и знаменатель не установлены`;
      const part = number(row[numerator]);
      const total = number(row[denominator]);
      if (!Number.isSafeInteger(part) || !Number.isSafeInteger(total) || total <= 0 || part < 0 || part > total) {
        return `${base}: числитель или знаменатель не прошли проверку`;
      }
      const calculated = part / total * 100;
      const decimalDigits = String(row[index]).split(/[,.]/)[1]?.length ?? 0;
      if (Math.abs(calculated - value) >= 0.5 * 10 ** -decimalDigits + 1e-10) {
        return `${base}: ${format(value)}% не совпадает с расчётом ${part}/${total} = ${format(calculated)}%`;
      }
      verified.push({ label, row: i + 1, part, total });
      return `${base}: ${part}/${total} = ${format(calculated)}%`;
    });
    const valid = !refs.some(line => /нет корректной|не совпадает|не прошли/.test(line));
    if (valid) ratios.push(...verified);
    else invalidLabels.push(label);
    const delta = rows.length === 2 && valid ? ` Изменение от первой ко второй строке — ${format(numbers[1] - numbers[0])} п. п. Сравнение описательное, причинный эффект по этим строкам не установлен.` : '';
    return [`«${label}»: ${refs.slice(0, 6).join('; ')}.${refs.length > 6 ? ` Показано 6 из ${refs.length} строк.` : ''}${delta}`];
  }).slice(0, 3);
  return { measurements, ratios, invalidLabels };
}

function subtitles(bytes, ext) {
  const input = bytes.toString().replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (ext === 'vtt' && !/^WEBVTT(?:\s|$)/.test(input)) throw Error('Файл не содержит заголовка WEBVTT.');
  const timestamp = /^(?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+(?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3}(?:\s.*)?$/;
  const cues = input.split(/\n\s*\n/).flatMap(block => {
    const lines = block.split('\n');
    const at = lines.findIndex(line => timestamp.test(line));
    const text = lines.slice(at + 1).join(' ').replace(/<[^>]*>/g, '').trim();
    return at >= 0 && text ? [`[${lines[at].trim().split(/\s+/).slice(0, 3).join(' ')}] ${text}`] : [];
  });
  if (!cues.length) throw Error('В файле нет читаемых реплик с таймкодом.');
  let used = 0;
  const sample = cues.filter(cue => (used += cue.length + 1) <= 5900);
  if (!sample.length) throw Error('Ни одна реплика не помещается в допустимый фрагмент.');
  return { text: `Субтитры: ${sample.length} из ${cues.length} реплик. Доступна расшифровка с таймкодами. Кадры, звук и личность говорящего по ней не проверены.\n${sample.join('\n')}` };
}

export function selectDocumentText(input, query = '', full = false) {
  if (!input.trim()) throw Error('В документе нет читаемого текста.');
  if (full) {
    if (input.length > 60000) throw Error('Полное чтение ограничено 60 000 символов. Разделите документ на части.');
    return { text: input, coverage: `Полное чтение: включены все ${input.length} символов извлечённого текста. Изображения без текстового слоя отдельно не распознавались.` };
  }
  if (input.length <= 6500) return { text: input };
  const terms = [...new Set((query.toLowerCase().match(/[\p{L}\d]{4,}/gu) ?? []).map(word => word.slice(0, 6)))].slice(0, 25);
  const chunks = [];
  for (let start = 0; start < input.length; start += 850) {
    const text = input.slice(start, start + 1000);
    const normalized = text.toLowerCase();
    const score = terms.filter(term => normalized.includes(term)).length * 3 +
      ['ограничен', 'бюджет', 'цель', 'метрик', 'риск'].filter(term => normalized.includes(term)).length;
    chunks.push({ start, end: Math.min(start + 1000, input.length), text, score });
  }
  const selected = new Map([[0, chunks[0]], [chunks.at(-1).start, chunks.at(-1)]]);
  for (const chunk of [...chunks].sort((left, right) => right.score - left.score || left.start - right.start)) {
    if (selected.size >= 6) break;
    selected.set(chunk.start, chunk);
  }
  const ranges = [...selected.values()].sort((left, right) => left.start - right.start);
  return {
    text: ranges.map(chunk => `[Символы ${chunk.start + 1}–${chunk.end}]\n${chunk.text}`).join('\n\n'),
    coverage: `Документ содержит ${input.length} символов. Выбрано ${ranges.length} фрагментов по вопросу и ключевым ограничениям. Остальной текст в этот запрос не включён.`,
  };
}

export async function readDocument(name, bytes, query = '', options = {}) {
  const ext = name.split('.').at(-1).toLowerCase();
  if (ext === 'csv') return table(parse(bytes, { bom: true, skip_empty_lines: true, delimiter: bytes.toString().split(/\r?\n/, 1)[0].includes(';') ? ';' : ',', relax_column_count: true }), name);
  if (ext === 'xlsx') return table(await readSheet(bytes), name);
  if (['srt', 'vtt'].includes(ext)) return subtitles(bytes, ext);
  if (ext === 'docx') return selectDocumentText((await mammoth.extractRawText({ buffer: bytes })).value, query, options.full === true);
  if (ext === 'pdf') {
    const canvas = await import('@napi-rs/canvas');
    for (const key of ['DOMMatrix', 'ImageData', 'Path2D']) globalThis[key] ??= canvas[key];
    const { PDFParse } = await import('pdf-parse');
    // The inline worker survives serverless tracing; the default relative worker
    // path is not necessarily included in the deployed function bundle.
    const { getData } = await import('pdf-parse/worker');
    PDFParse.setWorker(getData());
    const parser = new PDFParse({ data: bytes });
    try { return selectDocumentText((await parser.getText()).text, query, options.full === true); }
    finally { await parser.destroy(); }
  }
  if (['txt', 'md'].includes(ext)) return selectDocumentText(bytes.toString(), query, options.full === true);
  throw Error('Формат файла пока не поддерживается.');
}

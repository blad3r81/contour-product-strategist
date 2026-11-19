import { createHash } from 'node:crypto';
import { readCase, saveCase, listCases, readInbox } from './cases.js';
import { readDocument, readPublicUrl } from './materials.js';
import { ratioCandidates, calculateRatio } from './research.js';
import { tableReview } from './review.js';

export async function checkMonitor(id, { now = Date.now(), force = false } = {}) {
  const checkpoint = await readCase(id);
  const state = checkpoint.state;
  const config = state.monitor;
  if (!config?.enabled) return { id, skipped: 'disabled' };
  const interval = Math.max(10, Number(config.intervalSeconds) || 60) * 1000;
  if (!force && now - Date.parse(config.checkedAt || '1970-01-01') < interval) return { id, skipped: 'not-due' };
  const checkedAt = new Date(now).toISOString();
  const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  let result;
  try {
    let material;
    if (config.inbox) material = await readDocument(config.inbox, await readInbox(id, config.inbox));
    else if (config.url) material = await readPublicUrl(config.url, AbortSignal.timeout(10000));
    else throw Error('Укажите inbox с CSV/XLSX или открытый URL.');
    if (!material.table) throw Error('Источник не содержит числовой таблицы. Автоматический вывод о пороге не сделан.');
    const tables = [{ id: 'М1', data: material.table }];
    const mappings = ratioCandidates(tables);
    if (mappings.length !== 1) throw Error('Нет однозначного соответствия числителя, знаменателя и процента. Нужна проверка человеком.');
    const computed = calculateRatio(material.table, mappings[0]);
    const review = tableReview(state.decision?.trigger, computed.ratios);
    if (!review) throw Error('Условие решения не сопоставлено с единственной строкой таблицы. Укажите метрику и порог вида «Активация ниже 30%».');
    result = { status: review.crossed ? 'review' : 'ok', summary: review.summary, check: review.check, source: config.inbox || config.url,
      sourceHash: fingerprint(material.table), decisionHash: fingerprint(state.decision), calculation: computed.text };
  } catch (error) {
    result = { status: 'error', summary: error.message, source: config.inbox || config.url, decisionHash: fingerprint(state.decision) };
  }
  const signature = fingerprint(result);
  const changed = signature !== config.signature;
  const notices = [...(state.monitorNotices || [])];
  if (changed) notices.push({ ...result, signature, checkedAt, owner: state.decision?.owner || 'Ответственный пока не назначен',
    next: result.status === 'review' ? 'Ответственному проверить новые данные и решить, нужен ли пересмотр. Прежний выбор сохранён.' :
      result.status === 'error' ? 'Исправить источник или условие. Ошибка не считается отсутствием риска.' : 'Продолжить наблюдение. Причинный эффект не установлен.' });
  await saveCase(id, { ...state, monitor: { ...config, checkedAt, signature, status: result.status }, monitorNotices: notices.slice(-100) }, checkpoint.revision);
  return { id, changed, ...result };
}

export async function monitorTick() {
  const results = [];
  for (const id of await listCases()) {
    try { results.push(await checkMonitor(id)); }
    catch (error) {
      if (error.code === 'ENOENT' || error.message === 'У дела нет сохранённого состояния.') continue;
      results.push({ id, retry: true, error: error.message });
    }
  }
  return results;
}

export function startMonitor(onEvent = console.log) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { for (const result of await monitorTick()) if (result.changed || result.error) onEvent(JSON.stringify({ event: 'monitor', ...result })); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), 10000);
  return () => clearInterval(timer);
}

import { fetch } from 'undici';
import { gigaComplete, usesGigaChat } from './gigachat.js';
export { usesGigaChat } from './gigachat.js';

export const localModel = () => process.env.OLLAMA_MODEL || 'qwen3.5:4b-q4_K_M';
export const hasOnlineModel = () => usesGigaChat() || Boolean(process.env.CONTOUR_LLM_BASE_URL && process.env.CONTOUR_LLM_API_KEY && process.env.CONTOUR_LLM_MODEL);
export const usesOnlineModel = local => usesGigaChat() || hasOnlineModel() && (!local || process.env.CONTOUR_LLM_BACKEND === 'online');
const localOptions = () => ({ num_ctx: Number(process.env.CONTOUR_OLLAMA_CONTEXT || 4096) });
const keepAlive = () => process.env.CONTOUR_OLLAMA_KEEP_ALIVE || '20m';

export async function localModelLoaded(signal) {
  try {
    const deadline = AbortSignal.timeout(1500);
    const response = await fetch('http://127.0.0.1:11434/api/ps', { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    return response.ok && (await response.json()).models.some(model => model.name === localModel());
  } catch {
    return false;
  }
}
export async function warmLocalModel(signal) {
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
    body: JSON.stringify({ model: localModel(), messages: [], stream: false, keep_alive: keepAlive(), options: localOptions() }),
  });
  await response.body?.cancel();
  return response.ok;
}

async function readStream(body, online, onPreview, onFirstToken) {
  const decoder = new TextDecoder();
  let remainder = '';
  let text = '';
  let sentPreview = false;
  let usage;
  let finish;
  let timings;
  const consume = line => {
    if (online && !line.startsWith('data:')) return;
    const payload = online ? line.slice(5).trim() : line.trim();
    if (!payload || payload === '[DONE]') return;
    const event = JSON.parse(payload);
    if (event.error) throw Error('Модель остановила генерацию. Повторите запрос.');
    const choice = event.choices?.[0];
    const delta = choice?.delta?.content ?? event.message?.content ?? '';
    if (!text && delta) onFirstToken?.();
    text += delta;
    finish = choice?.finish_reason || event.done_reason || finish;
    usage = event.usage ?? (event.eval_count ? { prompt_tokens: event.prompt_eval_count, completion_tokens: event.eval_count } : usage);
    if (!online && event.done) timings = Object.fromEntries(
      [['loadMs', event.load_duration], ['prefillMs', event.prompt_eval_duration], ['generationMs', event.eval_duration]]
        .filter(([, value]) => Number.isFinite(value)).map(([key, value]) => [key, Math.round(value / 1e6)]),
    );
    if (!onPreview || sentPreview) return;
    const sentence = text.match(/^\s*(.{12,135}?[.!?])(?:\s|$)/s)?.[0];
    const clause = text.match(/^\s*(.{42,110}?[,;:])\s/s)?.[0] || (text.length >= 110 ? text.slice(0, 110).replace(/\s+\S*$/, '') : '');
    if (sentence || clause) {
      sentPreview = true;
      onPreview(sentence || clause);
    }
  };
  for await (const bytes of body) {
    const lines = (remainder + decoder.decode(bytes, { stream: true })).split('\n');
    remainder = lines.pop();
    for (const line of lines) consume(line);
  }
  consume(remainder + decoder.decode());
  return { text, usage, finish, timings };
}

export async function complete(messages, images, local, signal, maxTokens = 1800, onPreview, onFirstToken, schema) {
  if (usesGigaChat()) {
    const stream = Boolean(onPreview || onFirstToken);
    const { response, model, dispose } = await gigaComplete(messages, signal, maxTokens, schema, stream, images);
    let result;
    let cleaned;
    try {
      if (stream) result = await readStream(response.body, true, onPreview, onFirstToken);
      else {
        const data = await response.json();
        result = { text: data.choices?.[0]?.message?.content, finish: data.choices?.[0]?.finish_reason, usage: data.usage };
      }
    } finally { cleaned = await dispose(); }
    if (['blacklist', 'content_filter'].includes(result.finish)) return { text: 'Провайдер ограничил ответ.', provider: 'GigaChat', model, blocked: true, usage: result.usage };
    if (!result.text?.trim()) throw Error('GigaChat вернул пустой ответ.');
    return { ...result, provider: 'GigaChat', model, ...(result.finish === 'length' ? { warning: 'Ответ достиг лимита длины и требует продолжения.' } : {}),
      ...(!cleaned ? { warning: 'Временное изображение не удалось удалить из хранилища GigaChat. Проверьте кабинет API.' } : {}) };
  }
  const online = usesOnlineModel(local);
  if (!online && !local) throw Error('Онлайн-модель ещё не настроена.');
  const provider = online ? 'Агент · онлайн' : 'Qwen · локально';
  const model = online ? process.env.CONTOUR_LLM_MODEL : localModel();
  const url = online ? new URL(`${process.env.CONTOUR_LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`) : new URL('http://127.0.0.1:11434/api/chat');
  if (online && (url.protocol !== 'https:' || url.username || url.password)) throw Error('Для онлайн-модели нужен HTTPS-адрес без учётных данных в URL.');

  const inputs = messages.map((message, index) => {
    if (index !== messages.length - 1 || !images.length) return message;
    if (!online) return { ...message, images: images.map(image => image.data) };
    return { ...message, content: [{ type: 'text', text: message.content }, ...images.map(image => ({ type: 'image_url', image_url: { url: `data:${image.type};base64,${image.data}` } }))] };
  });
  const stream = Boolean(onPreview || onFirstToken);
  const thinking = onPreview ? process.env.CONTOUR_QWEN_FAST_MODE : '';
  const fastMode = thinking === 'dashscope' ? { enable_thinking: false }
    : thinking === 'template' ? { chat_template_kwargs: { enable_thinking: false } } : {};
  const payload = online ? { model, messages: inputs, stream, max_tokens: maxTokens, temperature: 0.2, ...fastMode } : {
    model, messages: inputs, stream, think: false, keep_alive: keepAlive(),
    ...(schema ? { format: schema } : {}),
    options: { ...localOptions(), num_predict: maxTokens, temperature: 0.2 },
  };
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(online ? { Authorization: `Bearer ${process.env.CONTOUR_LLM_API_KEY}` } : {}) },
    signal: AbortSignal.any([signal, AbortSignal.timeout(local ? 180000 : 65000)]), body: JSON.stringify(payload),
  });
  if (response.status === 429) throw Error('Модель занята или достигнут лимит. Попробуйте ещё раз.');
  if (!response.ok) throw Error(`${provider} вернул ошибку (${response.status}).`);
  let result;
  if (stream) result = await readStream(response.body, online, onPreview, onFirstToken);
  else {
    const data = await response.json();
    const choice = data.choices?.[0];
    result = {
      text: choice?.message?.content ?? data.message?.content,
      usage: data.usage ?? (data.eval_count ? { prompt_tokens: data.prompt_eval_count, completion_tokens: data.eval_count } : undefined),
      finish: choice?.finish_reason ?? data.done_reason,
    };
  }
  if (result.finish === 'content_filter') return { text: 'Провайдер ограничил ответ. Доступные материалы и расчёты показаны ниже.', provider, model, usage: result.usage, blocked: true };
  if (!result.text?.trim()) throw Error(`${provider} вернул пустой ответ.`);
  return { text: result.text, provider, model, usage: result.usage, timings: result.timings, ...(result.finish === 'length' ? { warning: 'Ответ достиг лимита длины и может быть неполным.' } : {}) };
}

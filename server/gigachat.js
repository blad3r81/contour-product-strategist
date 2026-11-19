import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Agent, fetch, FormData } from 'undici';

let token;
let tokenRequest;
let dispatcher;
const model = () => process.env.GIGACHAT_MODEL || 'GigaChat-3-Ultra';
export const usesGigaChat = () => process.env.CONTOUR_LLM_BACKEND === 'gigachat' && Boolean(process.env.GIGACHAT_AUTH_KEY);

function tls() {
  const certificate = process.env.GIGACHAT_CA_PEM?.replaceAll('\\n', '\n') ||
    (process.env.GIGACHAT_CA_FILE ? readFileSync(process.env.GIGACHAT_CA_FILE) : undefined);
  if (certificate) dispatcher ??= new Agent({ connect: { ca: certificate } });
  return dispatcher;
}

async function accessToken(signal) {
  if (token?.expires_at > Date.now() + 60_000) return token.access_token;
  if (!tokenRequest) {
    tokenRequest = (async () => {
      const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
        method: 'POST', dispatcher: tls(), signal: AbortSignal.timeout(12_000),
        headers: { Authorization: `Basic ${process.env.GIGACHAT_AUTH_KEY}`, RqUID: randomUUID(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ scope: process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS' }),
      });
      if (!response.ok) throw Error(`GigaChat не выдал токен доступа (HTTP ${response.status}).`);
      token = await response.json();
      if (!token.access_token || !Number.isFinite(token.expires_at)) throw Error('GigaChat вернул неполный токен доступа.');
      return token.access_token;
    })().finally(() => { tokenRequest = undefined; });
  }
  signal.throwIfAborted();
  return tokenRequest;
}

export async function gigaComplete(messages, signal, maxTokens, schema, stream, images = []) {
  const key = await accessToken(signal);
  const uploads = [];
  const dispose = async () => {
    const failures = [];
    for (const id of uploads) {
      try {
        const deleted = await fetch(`https://api.giga.chat/v1/files/${encodeURIComponent(id)}/delete`, {
          method: 'POST', dispatcher: tls(), signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${key}` },
        });
        await deleted.body?.cancel();
        if (!deleted.ok) failures.push(id);
      } catch { failures.push(id); }
    }
    return failures.length === 0;
  };
  try {
    for (const image of images) {
      const form = new FormData();
      form.set('purpose', 'general');
      form.set('file', new Blob([Buffer.from(image.data, 'base64')], { type: image.type }), `material.${image.type.split('/')[1]}`);
      const uploaded = await fetch('https://api.giga.chat/v1/files', {
        method: 'POST', dispatcher: tls(), signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        headers: { Authorization: `Bearer ${key}` }, body: form,
      });
      if (!uploaded.ok) throw Error(`GigaChat не принял изображение (HTTP ${uploaded.status}).`);
      const file = await uploaded.json();
      if (typeof file.id !== 'string' || !file.id) throw Error('GigaChat не вернул идентификатор изображения.');
      uploads.push(file.id);
    }
  } catch (error) { await dispose(); throw error; }
  const inputs = uploads.length ? messages.map((message, index) => index === messages.length - 1 ? { ...message, attachments: uploads } : message) : messages;
  const request = () => fetch('https://api.giga.chat/v1/chat/completions', {
    method: 'POST', dispatcher: tls(), signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model(), messages: inputs, max_tokens: maxTokens, temperature: 0.15, stream,
      ...(schema ? { response_format: { type: 'json_schema', schema, strict: true } } : {}),
    }),
  });
  let response;
  try {
    response = await request();
    if (response.status === 429) {
      await response.body?.cancel();
      await new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const stop = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 2000);
        signal.addEventListener('abort', stop, { once: true });
      });
      response = await request();
    }
  } catch (error) { await dispose(); throw error; }
  if (response.status === 401) token = undefined;
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const detail = typeof failure.message === 'string' ? failure.message.slice(0, 240) : '';
    await dispose();
    throw Error(response.status === 429
      ? 'GigaChat занят или исчерпал доступную квоту. Повторите запрос после проверки лимита.'
      : `GigaChat вернул ошибку (HTTP ${response.status}). ${detail}`);
  }
  return { response, model: model(), dispose };
}

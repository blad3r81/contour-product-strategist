import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const buckets = new Map();
const cookieName = '__Host-contour-session';
export const publicDemo = () => process.env.CONTOUR_PUBLIC_DEMO === '1' && (process.env.CONTOUR_SESSION_SECRET?.length ?? 0) >= 32;
const sign = value => createHmac('sha256', process.env.CONTOUR_SESSION_SECRET).update(value).digest('base64url');
const equal = (a, b) => { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };

export function demoSession(req, res, create = false) {
  if (!publicDemo()) return null;
  const token = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (token) {
    const [id, expires, signature] = token.split('.');
    if (/^[a-f0-9-]{36}$/.test(id) && Number(expires) > Date.now() && signature && equal(signature, sign(`${id}.${expires}`))) return id;
  }
  if (!create) return null;
  const id = randomUUID();
  const value = `${id}.${Date.now() + 86400000}`;
  res.setHeader('Set-Cookie', `${cookieName}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`);
  return id;
}

export function sameOrigin(req) {
  try {
    return Boolean(req.headers.origin && new URL(req.headers.origin).host === req.headers.host && req.headers['sec-fetch-site'] !== 'cross-site');
  } catch { return false; }
}

// A short per-instance burst limiter. The speech gateway enforces the shared daily chat cap.
export function withinBurst(id, action) {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
  const key = `${id}:${action}`;
  const entry = buckets.get(key) || { until: now + 60000, count: 0 };
  entry.count++;
  buckets.set(key, entry);
  return entry.count <= (action === 'chat' ? 10 : 80);
}

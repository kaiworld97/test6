import { DurableObject } from 'cloudflare:workers';
import { kstDate, snapshot } from '../shared/menu';
import { answer } from './answer';
import { claudeSettings } from './claude';
export { MenuTags } from './menu-tags';

const MAX_DAILY_REQUESTS = 20;
const MAX_BODY_BYTES = 4096;

export class ChatQuota extends DurableObject<Env> {
  take(day: string) {
    return this.ctx.storage.transactionSync(() => {
      const previous = this.ctx.storage.kv.get<{ day: string; count: number }>('quota');
      if (previous && previous.day > day) return false;
      const count = previous?.day === day ? previous.count : 0;
      if (count >= MAX_DAILY_REQUESTS) return false;
      this.ctx.storage.kv.put('quota', { day, count: count + 1 });
      return true;
    });
  }
}

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
  });
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.body || Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) {
    throw new Error('invalid_size');
  }
  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('invalid_size');
      }
      bytes.set(value, offset);
      offset += value.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, offset)));
  } finally {
    reader.releaseLock();
  }
}

function parseInput(input: unknown) {
  if (!input || typeof input !== 'object' || !('q' in input) || typeof input.q !== 'string') return null;
  const q = input.q.trim();
  if (!q || [...q].length > 200) return null;
  const exclude = 'exclude' in input ? input.exclude : [];
  if (!Array.isArray(exclude) || exclude.length > 40
    || !exclude.every(id => typeof id === 'string' && /^(fixed-\d{1,4}|daily-(중식|석식))$/.test(id))) return null;
  return { q, exclude: exclude as string[] };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/chat') return url.pathname.startsWith('/api/')
      ? json({ error: 'not_found' }, 404) : env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'origin_not_allowed' }, 403);
    if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return json({ error: 'unsupported_type' }, 415);
    }

    const input = parseInput(await readBody(request).catch(() => null));
    if (!input) return json({ error: 'invalid_input' }, 400);
    const now = new Date();
    const day = kstDate(now);
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
      const name = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (!await env.CHAT_QUOTA.getByName(name).take(day)) {
        const retryAfter = Math.ceil((Date.parse(`${day}T00:00:00+09:00`) + 86_400_000 - now.getTime()) / 1000);
        return json({ error: 'rate_limit' }, 429, { 'Retry-After': String(retryAfter) });
      }
      const claude = claudeSettings(env);
      const tags = claude && snapshot.snapshotDate === day
        ? await env.MENU_TAGS.getByName('sejong').read().catch(() => ({})) : {};
      const result = await answer(input.q, input.exclude, day, claude, tags);
      return json(result.body, result.status);
    } catch {
      console.error(JSON.stringify({ event: 'recommend_unavailable' }));
      return json({ error: 'unavailable' }, 503);
    }
  },
  async scheduled(event, env) {
    if (snapshot.snapshotDate === kstDate(new Date(event.scheduledTime))) {
      await env.MENU_TAGS.getByName('sejong').sync();
    }
  }
} satisfies ExportedHandler<Env>;

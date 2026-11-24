import { afterEach, expect, test, vi } from 'vitest';
import { snapshot } from '../../shared/menu';
import { MenuTags } from '../../worker/menu-tags';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(public ctx: object, public env: object) {}
  }
}));

const menuNames = [...new Set([
  ...snapshot.fixed.map(row => row.name),
  ...snapshot.daily.filter(row => row.date >= snapshot.snapshotDate).flatMap(row => row.items)
])];

function fixture() {
  const store = new Map<string, unknown>(menuNames.slice(1).map(name => [`tag:${name}`, ['면']]));
  const ctx = { storage: { kv: { get: store.get.bind(store), put: store.set.bind(store) },
    transactionSync: (write: () => void) => write() } };
  const env = { ANTHROPIC_API_KEY: 'test-only-key', CLAUDE_MODEL: 'claude-haiku-5-5', CLAUDE_WORKSPACE_ID: '' };
  return { store, cache: new MenuTags(ctx as DurableObjectState, env as Env) };
}

function reply(entries: unknown[]) {
  return Response.json({
    stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ entries }) }]
  });
}

afterEach(() => vi.unstubAllGlobals());

test('새 메뉴 한 건만 Claude에 전달하고 두 예약 실행이 태그를 재사용한다', async () => {
  const { cache } = fixture();
  const provider = vi.fn().mockResolvedValue(reply([{ index: 0, tags: ['국물', '기타'] }]));
  vi.stubGlobal('fetch', provider);
  await Promise.all([cache.sync(), cache.sync()]);
  await cache.sync();
  expect(provider).toHaveBeenCalledTimes(1);
  const body = JSON.parse(provider.mock.calls[0][1].body);
  expect(JSON.parse(body.messages[0].content)).toEqual([menuNames[0]]);
  expect(cache.read()[menuNames[0]]).toEqual(['국물']);
  expect(cache.read()[menuNames[1]]).toEqual(['면']);
});

test('태그 배치가 누락되면 기존에 공개된 태그를 보존한다', async () => {
  const { cache, store } = fixture();
  store.set('snapshot', { 라면: ['면'] });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply([])));
  await expect(cache.sync()).rejects.toThrow('incomplete_tag_result');
  expect(cache.read()).toEqual({ 라면: ['면'] });
  expect(store.has(`tag:${menuNames[0]}`)).toBe(false);
});

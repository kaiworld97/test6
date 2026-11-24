import { DurableObject } from 'cloudflare:workers';
import { snapshot } from '../shared/menu';
import { askClaude, claudeSettings, MENU_TAGS, type ClaudeSettings } from './claude';

const TAG_PROMPT = `메뉴명 목록을 배열의 인덱스별로 분류한다. 명확한 태그만 지정하고 모를 때 빈 배열을 쓴다.
이름만으로 채식 여부를 판단하기 어려우면 채식가능을 붙이지 않는다. 모든 인덱스의 결과를 하나씩 반환한다.`;
const TAG_SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string', enum: MENU_TAGS } }
        },
        required: ['index', 'tags'],
        additionalProperties: false
      }
    }
  },
  required: ['entries'],
  additionalProperties: false
};

function validateTagBatch(result: unknown, names: string[]) {
  if (!result || typeof result !== 'object' || !('entries' in result) || !Array.isArray(result.entries)) {
    throw new Error('invalid_tag_result');
  }
  const tagged = new Map<string, string[]>();
  for (const row of result.entries) {
    if (!row || !Number.isInteger(row.index) || row.index < 0 || row.index >= names.length
      || tagged.has(names[row.index]) || !Array.isArray(row.tags)) throw new Error('invalid_tag_result');
    tagged.set(names[row.index], MENU_TAGS.filter(tag => row.tags.includes(tag)));
  }
  if (tagged.size !== names.length) throw new Error('incomplete_tag_result');
  return tagged;
}

export class MenuTags extends DurableObject<Env> {
  private refreshing = false;

  read() {
    return this.ctx.storage.kv.get<Record<string, string[]>>('snapshot') ?? {};
  }

  async sync() {
    const claude = claudeSettings(this.env);
    if (!claude || this.refreshing) return;
    this.refreshing = true;
    try {
      await this.refresh(claude);
    } finally {
      this.refreshing = false;
    }
  }

  private async refresh(claude: ClaudeSettings) {
    const store = this.ctx.storage.kv;
    const names = [...new Set([
      ...snapshot.fixed.map(row => row.name),
      ...snapshot.daily.filter(row => row.date >= snapshot.snapshotDate).flatMap(row => row.items)
    ])];
    const known = new Map(names.map(name => [name, store.get<string[]>(`tag:${name}`)]));
    const missing = names.filter(name => known.get(name) === undefined);

    for (let offset = 0; offset < missing.length; offset += 30) {
      const batch = missing.slice(offset, offset + 30);
      const result = await askClaude({
        ...claude, system: TAG_PROMPT, input: batch,
        schema: TAG_SCHEMA, maxTokens: 2_048, timeoutMs: 30_000
      });
      const tagged = validateTagBatch(result, batch);
      this.ctx.storage.transactionSync(() => {
        for (const [name, tags] of tagged) store.put(`tag:${name}`, tags);
      });
      for (const [name, tags] of tagged) known.set(name, tags);
    }
    if (missing.length || store.get('date') !== snapshot.snapshotDate) {
      this.ctx.storage.transactionSync(() => {
        store.put('snapshot', Object.fromEntries(known));
        store.put('date', snapshot.snapshotDate);
      });
    }
  }
}

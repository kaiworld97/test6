export const MENU_TAGS = ['국물', '매운맛', '고기', '해산물', '면', '밥', '튀김', '채식가능'];

export interface ClaudeSettings {
  key: string;
  model: string;
  workspaceId?: string;
}

export function claudeSettings(env: Env): ClaudeSettings | undefined {
  const key = 'ANTHROPIC_API_KEY' in env && typeof env.ANTHROPIC_API_KEY === 'string'
    ? env.ANTHROPIC_API_KEY.trim() : '';
  if (!key) return;
  return { key, model: env.CLAUDE_MODEL, workspaceId: env.CLAUDE_WORKSPACE_ID || undefined };
}

interface ClaudeRequest extends ClaudeSettings {
  system: string;
  input: unknown;
  schema: object;
  maxTokens: number;
  timeoutMs: number;
}

export async function askClaude({ key, model, workspaceId, system, input, schema, maxTokens, timeoutMs }: ClaudeRequest): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'anthropic-version': '2026-10-21',
      'Content-Type': 'application/json',
      ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {})
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model, system, max_tokens: maxTokens,
      messages: [{ role: 'user', content: JSON.stringify(input) }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema } }
    })
  });
  if (!response.ok) {
    console.warn(JSON.stringify({ event: 'claude_request_failed', status: response.status }));
    throw new Error('claude_request_failed');
  }
  const payload = await response.json<{ stop_reason: string; content: { type: string; text?: string }[] }>();
  const text = payload.content.find(block => block.type === 'text')?.text;
  if (payload.stop_reason !== 'end_turn' || !text) throw new Error('claude_incomplete_response');
  return JSON.parse(text);
}

import Anthropic from '@anthropic-ai/sdk';

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

export interface AskClaudeOptions {
  system?: string;
  maxTokens?: number;
}

export async function askClaude(
  client: Anthropic,
  prompt: string,
  options: AskClaudeOptions = {}
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: options.maxTokens ?? 1024,
    system: options.system,
    // Adaptive thinking is on by default for this model and shares the
    // max_tokens budget with the text response; our budgets are as tight as
    // 300 tokens, so thinking could leave no text block at all.
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: prompt }],
  } as any);

  const textBlock = (response as any).content.find((block: any) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Claude response contained no text block');
  }
  return textBlock.text;
}

/**
 * Parses JSON out of a raw Claude text response.
 *
 * Claude frequently wraps JSON in a markdown code fence even when asked not to,
 * so a bare JSON.parse is not safe. Tries the raw string first, then retries
 * after stripping a surrounding ``` / ```json fence.
 */
export function parseJsonResponse<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const stripped = raw
      .trim()
      .replace(/^```[a-zA-Z]*\s*/, '')
      .replace(/```\s*$/, '')
      .trim();
    try {
      return JSON.parse(stripped) as T;
    } catch {
      throw new Error(`Failed to parse JSON from Claude response: ${raw.slice(0, 200)}`);
    }
  }
}

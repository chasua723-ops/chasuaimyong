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
    messages: [{ role: 'user', content: prompt }],
  } as any);

  const textBlock = (response as any).content.find((block: any) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Claude response contained no text block');
  }
  return textBlock.text;
}

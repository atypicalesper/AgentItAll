import type { ProviderKey } from "./providers";

// USD per 1M tokens (approximate, as of early 2025)
const PRICING: Record<ProviderKey, { input: number; output: number }> = {
  anthropic: { input: 3.0,   output: 15.0  },  // Claude Sonnet
  openai:    { input: 0.15,  output: 0.60  },  // GPT-4o-mini
  google:    { input: 0.075, output: 0.30  },  // Gemini Flash
  groq:      { input: 0.06,  output: 0.06  },  // Llama (metered estimate)
};

export function estimateCost(
  provider: ProviderKey,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = PRICING[provider] ?? { input: 0, output: 0 };
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
}

export function formatCost(usd: number): string {
  if (usd < 0.001) return "<$0.001";
  if (usd < 0.01)  return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

import "server-only";
import { createGoogle } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { env } from "../env";
import { fallbackModel } from "./fallback";

/**
 * Free-tier model chain, best first:
 * 1. Gemini 3.5 Flash Lite, then 3.1 Flash Lite (15 RPM / 500 RPD each, separate quotas)
 * 2. Mistral ministral-14b (30 RPM on the free plan)
 */
function chain(): LanguageModelV4[] {
  const models: LanguageModelV4[] = [];

  if (env.geminiApiKey) {
    const google = createGoogle({ apiKey: env.geminiApiKey });
    models.push(google("gemini-3.5-flash-lite"), google("gemini-3.1-flash-lite"));
  }
  if (env.mistralApiKey) {
    const mistral = createMistral({ apiKey: env.mistralApiKey });
    models.push(mistral("ministral-14b-latest"));
  }
  return models;
}

let cached: LanguageModelV4 | undefined;

/** The agent's model. Fails over down the chain on rate limits and errors. */
export function agentModel(): LanguageModelV4 {
  cached ??= fallbackModel(chain());
  return cached;
}

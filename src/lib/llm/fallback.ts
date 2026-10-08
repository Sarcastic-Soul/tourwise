import "server-only";
import type { LanguageModelV4, LanguageModelV4CallOptions } from "@ai-sdk/provider";

const COOLDOWN_MS = 60_000;
// Model ids that recently failed (rate limit, overload). Skipped until the cooldown ends.
const coolingDown = new Map<string, number>();

function key(model: LanguageModelV4) {
  return `${model.provider}:${model.modelId}`;
}

function isAbort(error: unknown, options: LanguageModelV4CallOptions) {
  return options.abortSignal?.aborted || (error instanceof Error && error.name === "AbortError");
}

/**
 * A model that tries each model in order and moves to the next one when a call
 * fails (rate limit, quota, overload, missing access). Every model here is on a
 * free tier, so failing over is normal, not exceptional.
 */
export function fallbackModel(models: LanguageModelV4[]): LanguageModelV4 {
  if (models.length === 0) {
    throw new Error("No LLM configured. Set GEMINI_API_KEY or MISTRAL_API_KEY.");
  }

  async function attempt<T>(
    options: LanguageModelV4CallOptions,
    call: (model: LanguageModelV4) => PromiseLike<T>,
  ): Promise<T> {
    const now = Date.now();
    const ready = models.filter((m) => (coolingDown.get(key(m)) ?? 0) <= now);
    // If every model is cooling down, try them all anyway rather than fail outright.
    const order = ready.length > 0 ? ready : models;

    let lastError: unknown;
    for (const model of order) {
      try {
        return await call(model);
      } catch (error) {
        if (isAbort(error, options)) throw error;
        lastError = error;
        coolingDown.set(key(model), Date.now() + COOLDOWN_MS);
        console.warn(`[llm] ${key(model)} failed, trying next model:`, (error as Error)?.message);
      }
    }
    throw lastError;
  }

  const first = models[0];
  return {
    specificationVersion: "v4",
    provider: "fallback",
    modelId: models.map(key).join(" > "),
    supportedUrls: first.supportedUrls,
    doGenerate: (options) => attempt(options, (m) => m.doGenerate(options)),
    doStream: (options) => attempt(options, (m) => m.doStream(options)),
  };
}

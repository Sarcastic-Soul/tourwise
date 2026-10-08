import "server-only";

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const env = {
  qlooApiKey: read("QLOO_API_KEY"),
  qlooBaseUrl: read("QLOO_BASE_URL") ?? "https://hackathon.api.qloo.com",
  geminiApiKey: read("GEMINI_API_KEY"),
  mistralApiKey: read("MISTRAL_API_KEY"),
  databaseUrl: read("DATABASE_URL"),
  // The key allows 10,000 calls a month. About 300 a day keeps the public demo
  // inside that even if it gets busy.
  qlooDailyCap: Number(read("QLOO_DAILY_CAP") ?? 300),
};

// With no Qloo key we serve made-up data with the real response shape, so the
// whole app can be built and demoed before the key arrives.
export const qlooMockMode = !env.qlooApiKey;

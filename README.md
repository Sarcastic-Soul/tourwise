# Tourwise

A tour-routing agent for independent musicians, built for the Qloo Agentic Hackathon 2026.

Give it an artist and a region. The agent uses Qloo's taste graph to find the cities where that
artist's audience is concentrated. For each city it picks a venue whose crowd matches, a local
support act with an overlapping audience, and brands that audience likes (for sponsors and merch).
Then it orders the stops to keep travel short. Every pick comes with the Qloo signal behind it.

A plain LLM can only guess where an indie act's audience lives. Qloo knows.

## How it works

```
artist + region
   │
   ▼
ToolLoopAgent (Vercel AI SDK)
   ├─ audience_hotspots  → Qloo heatmap over the region, matched to cities
   ├─ audience_profile   → Qloo demographics + similar artists
   ├─ scout_city (×N)    → Qloo places, artists, brands near each city
   ├─ plan_route         → orders stops by distance (our code, no LLM)
   └─ submit_plan        → final structured plan, streamed to the UI
```

- **Qloo calls** happen only on the server (`src/lib/qloo/`). Responses are cached privately in
  Postgres for 30 days and are never stored in this repo.
- **Daily cap**: all live Qloo calls share one counter per UTC day (`QLOO_DAILY_CAP`, default 300,
  about 10k a month). A new plan needs about 20 calls; when the budget is low, `POST /api/plan`
  answers 429 and saved plans still open. Cache hits and mock calls are free.
- **Saved plans**: each finished plan is kept for 30 days and gets a link like
  `/?artist=<qlooId>&name=<name>&region=<regionId>&stops=<n>`. Opening the link shows the saved plan
  and makes no new Qloo calls.
- **LLM**: free-tier chain with automatic failover: Gemini 3.5 Flash Lite → Gemini 3.1 Flash Lite →
  Mistral `ministral-14b` (`src/lib/llm/`).
- **Mock mode**: with no `QLOO_API_KEY`, the app serves made-up data in the real Qloo response shape
  (`src/lib/qloo/mock.ts`). All mock names are fictional.

## Run locally

Needs Node.js 22+.

```sh
npm install                  # also copies the MapLibre worker into public/maplibre/
cp .env.example .env.local   # then fill in the keys
npm run dev
```

| Variable | Needed | Where to get it |
| --- | --- | --- |
| `QLOO_API_KEY` | No (mock data without it) | Qloo hackathon form |
| `GEMINI_API_KEY` | One LLM key is needed | https://aistudio.google.com/apikey |
| `MISTRAL_API_KEY` | One LLM key is needed | https://console.mistral.ai/api-keys |
| `DATABASE_URL` | No (memory cache without it) | Neon Postgres, via the Vercel Marketplace |
| `QLOO_DAILY_CAP` | No (default 300) | Max live Qloo calls per UTC day |

## API

- `GET /api/artists?q=<name>`: find an artist's Qloo id.
- `POST /api/plan` with `{ artist: { qlooId, name }, regionId, stops }`: runs the agent and streams
  its steps as an AI SDK UI message stream.
- `GET /api/plan?artistId=&regionId=&stops=`: returns a saved plan, if any.
- Both `/api/artists` and `POST /api/plan` answer 429 with `{ error }` once the daily Qloo cap is used up.

Regions: `north-america`, `europe`, `india`, `australia-nz` (`src/lib/regions.ts`).

## Responsible use

Qloo results are aggregate taste affinities, not facts about people. The app sends Qloo only artist
ids and public city coordinates: no names, emails or user data. The agent is told to make no claims
about individual fans.

## License

MIT

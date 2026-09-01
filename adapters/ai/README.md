# adapter: ai

`AiProvider` in `archeon-agents::provider`.

| id | behavior |
|---|---|
| `mock` | Deterministic local reply. Always available. |
| `openai-compatible` | Chat Completions against `ARCHEON_AI_BASE_URL` (default `https://api.x.ai/v1`, model `grok-4.5`). |

Keys: `ARCHEON_AI_API_KEY` or `XAI_API_KEY`. Never in the repo. The UI does not call vendors.

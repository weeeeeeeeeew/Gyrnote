# Gyrnote

Personal knowledge workbench: notes stay the source of truth; a source-anchored thought graph is a projection you review, correct, and lock. Candidates never overwrite confirmed structure. The graph is not a second copy of the note.

秋招演示项目。笔记是入口和事实源；图是思考结构的外部化投影，不为覆盖全文而堆节点。

## Stack

Vue 3 / TypeScript / Vite / Pinia / Tiptap / Vue Flow · FastAPI / Pydantic / SQLAlchemy / Alembic · PostgreSQL + pgvector / Redis / ARQ · Vitest / Playwright / Pytest · Docker / GitHub Actions

## What is in this repo

| Path | Role |
|---|---|
| `apps/web` | Workbench UI |
| `apps/api` | HTTP API, jobs, migrations (started from [FastAPI-boilerplate](https://github.com/benavlabs/FastAPI-boilerplate)) |
| `apps/docker-compose.yml` | Local Postgres 17 + pgvector and Redis 7 |
| `.github/workflows/ci.yml` | Frontend, backend, Chromium e2e |

Private research notes (`docs/`) and local agent rules (`AGENTS.md`) are gitignored on purpose.

## Local run

Do not commit `.env`, API keys, or personal notes.

1. Start Postgres and Redis:

```bash
docker compose -f apps/docker-compose.yml up -d
```

2. Configure the API. Copy `apps/api/scripts/local_with_uvicorn/.env.example` to `apps/api/src/.env`. If the API runs on the host (not inside Compose), set `POSTGRES_SERVER` and `REDIS_*_HOST` to `127.0.0.1`. Keep `EMBEDDING_ENABLED=false` unless you have a separate embeddings provider (DeepSeek chat has no `/embeddings`). Put `LLM_API_KEY` only in that local file.

3. Migrate from `apps/api/src`, then start the API and worker from `apps/api`:

```bash
cd apps/api/src
python -m alembic upgrade head
cd ..
python -m uvicorn src.app.main:app --reload --host 127.0.0.1 --port 8000
python -m src.app.core.worker.settings
```

4. Register a local user (username must be lowercase alphanumeric), then start the web app:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/user \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Demo User\",\"username\":\"demo\",\"email\":\"demo@example.com\",\"password\":\"Str1ngst!\"}"
```

```bash
cd apps/web
pnpm install
pnpm dev
```

Open `http://localhost:5173`, sign in, then:

1. Edit a note and optionally attach a source quote to a node.
2. Compile a candidate (needs the worker + `LLM_API_KEY` for a live model; tests mock the LLM).
3. Accept nodes/edges on the **候选模型** tab; the **确认模型** graph only changes after accept.
4. After editing the note, review a ModelPatch before it touches confirmed structure.
5. Structure query filters notes by graph shape. Chunk recall needs embeddings and returns 503 when they are disabled.

## Tests

```bash
# API
cd apps/api
python -m ruff check --no-fix .
python -m mypy src
python -m pytest

# Web
cd apps/web
pnpm type-check
pnpm exec vitest run
pnpm exec playwright test --project=chromium
```

Chromium e2e expects the API `/api/v1/ready` to be healthy.

## Product invariants

- Notes are the fact source; the graph does not exhaust the note.
- Candidates must be reviewed; they do not replace confirmed structure.
- Do not `add_node` just to cover the whole text.
- GraphRAG / Neo4j is not the P0 architecture.

## License

MIT. `apps/api` retains the FastAPI-boilerplate license notice.

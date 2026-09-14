# Gyrnote

笔记是事实源。图是你审阅、校正、锁定后的思考结构，不是第二份正文。

A personal knowledge workbench: source-anchored thought graphs that never silently overwrite what you already confirmed.

```text
自由文本笔记
    → 带原文锚点的候选 ThoughtModel
    → 你审阅 / 接受 / 锁定
原文变化
    → ModelPatch
    → 已确认结构复用
```

工作台一屏三栏：**笔记** | **编译桥** | **确认图 / 候选审阅**。候选只出现在「候选模型」Tab，接受之前不会改确认图。

## 演示里能看到什么

| 你做的事 | 系统怎么处理 |
|---|---|
| 在笔记里划一段原文 | 锚到块 ID + quote hash，节点能回到出处 |
| 点「首次编译」 | ARQ 入队，状态 queued / running / succeeded / failed |
| 接受节点或边 | 进入确认模型；锁定后拒绝覆盖 |
| 改了原文再提 patch | 先审阅再写确认图，不整表覆盖 |
| 结构查询 | 用图当过滤器，展示的文字仍来自笔记 |
| 原文召回 | 检索笔记正文；未配 embeddings 时返回 503 |

不为覆盖全文而堆节点。GraphRAG / Neo4j 不是本项目主架构。

## 技术栈

**Web:** Vue 3 · TypeScript · Vite · Pinia · Tiptap · Vue Flow  
**API:** FastAPI · Pydantic · SQLAlchemy · Alembic · PostgreSQL + pgvector · Redis · ARQ  
**质量:** Vitest · Playwright · Pytest · GitHub Actions

## 本地运行

不要提交 `.env`、模型 Key 或私人笔记。

```bash
docker compose -f apps/docker-compose.yml up -d
```

把 `apps/api/scripts/local_with_uvicorn/.env.example` 拷到 `apps/api/src/.env`。API 跑在宿主机时，把 `POSTGRES_SERVER` 和 `REDIS_*_HOST` 设成 `127.0.0.1`。`LLM_API_KEY` 只放这个本地文件。默认关闭 embeddings（DeepSeek chat 没有 `/embeddings`）。

```bash
cd apps/api/src && python -m alembic upgrade head && cd ..
python -m uvicorn src.app.main:app --reload --host 127.0.0.1 --port 8000
python -m src.app.core.worker.settings
```

```bash
curl -X POST http://127.0.0.1:8000/api/v1/user \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Demo User\",\"username\":\"demo\",\"email\":\"demo@example.com\",\"password\":\"Str1ngst!\"}"

cd apps/web && pnpm install && pnpm dev
```

打开 <http://localhost:5173> 登录。用户名只能是小写字母和数字。

## 测试

```bash
cd apps/api && python -m pytest
cd apps/web && pnpm exec vitest run && pnpm exec playwright test --project=chromium
```

Playwright 需要 API `/api/v1/ready` 为 healthy。

## 仓库结构

| 路径 | 作用 |
|---|---|
| `apps/web` | 工作台 |
| `apps/api` | HTTP / 任务 / 迁移（基于 [FastAPI-boilerplate](https://github.com/benavlabs/FastAPI-boilerplate)） |
| `apps/docker-compose.yml` | 本地 Postgres 17 + Redis 7 |
| `.github/workflows/ci.yml` | 前端、后端、Chromium e2e |

学习笔记和本地协作规则不进 Git。

## License

MIT

<p align="center">
  <img src="icon.png" alt="Gyrnote" width="88" />
</p>

# Gyrnote

**从长笔记抽出可回原文、可随修改更新的思考结构图。**

笔记是事实源。图是你审阅、校正、锁定后的思考结构，不是第二份正文，也不把全文画完。

人照常写长笔记。长文本忠实地记下了线性输出，却没有稳定保存背后的思考结构：哪个是核心问题、哪几条论据撑同一个假设、哪些是未决分支。重读时要从大段文字里再找一遍；通用模型每次都按原文重新解释，改过的理解留不住；只按字面相似做检索，也很难问「这几个结论是否共用同一个隐含假设」。

Gyrnote 把图当成思考结构的外部化投影：帮你回看论证全局、跳回出处，并在走得过深时露出被忽略的旁支。图由模型从笔记里抽出候选，人审阅后才进入确认结构；下一次生成不能整表覆盖已经确认或锁定的部分。入口始终是你自己维护的笔记，而不是一次性「文本出图」。

```text
自由文本笔记
    → 带原文锚点的候选 ThoughtModel
    → 你审阅 / 接受 / 锁定
原文变化
    → ModelPatch
    → 已确认结构复用
```

工作台左右分栏：**原文笔记** | **确认图 / 候选审阅**。中间是编译桥。候选只出现在「候选模型」Tab，接受之前不会改确认图。

<p align="center">
  <img src="Demo%20image.png" alt="Gyrnote 工作台：左侧原文笔记，右侧确认图" />
</p>

## 演示里能看到什么

| 你做的事 | 系统怎么处理 |
|---|---|
| 写笔记、划选原文 | 段落有稳定块 ID；节点绑到出处。一个节点可以对应多处原文，选中后笔记里会同时标出这些锚点 |
| 点「再编译 / 首次编译」 | 从当前笔记抽出带引用的候选图（后台任务：queued / running / succeeded / failed）。不为覆盖全文而堆节点 |
| 接受节点或边 | 进入确认模型；锁定后拒绝覆盖。生成结果和已确认结构分开存 |
| 改了原文再生成补丁 | 按引用有效 / 位移 / 失效给出局部修订，人批准才写确认图，不整表推倒 |
| 自然语言改图 | 对话只产出待批准的修改建议（可改已有节点之间的边，不可为凑全文 `add_node`），批准后才进确认图 |
| 结构查询 | 检查确认图上的论证缺口（例如缺支撑、共用假设、未闭环），展示的文字仍来自笔记 |
| 召回原文 | 先按确认节点的摘要缩小范围，再只在这些节点锚定的原文块上检索（向量 + 字面匹配）。空图不会偷偷改成全文库检索；需要时才勾选「全文补漏」 |
| 笔记问答 | 先走上面的双层召回，只根据命中的原文作答并引用块；没有命中就不调聊天模型，也不改图 |
| 模型密钥 | 在页面里填写聊天 / 向量两套配置，只留在本机，不进仓库 |

GraphRAG / Neo4j 不是本项目主架构。图用来缩小检索范围并回到笔记原文，不是另一份知识库。

## 技术栈

**Web:** Vue 3 · TypeScript · Vite · Pinia · Tiptap · Vue Flow  
**API:** FastAPI · Pydantic · SQLAlchemy · Alembic · PostgreSQL + pgvector · Redis · ARQ  
**质量:** Vitest · Playwright · Pytest · GitHub Actions

## 本地运行

不要提交 `.env`、模型 Key 或私人笔记。

```bash
docker compose -f apps/docker-compose.yml up -d
```

把 `apps/api/scripts/local_with_uvicorn/.env.example` 拷到 `apps/api/src/.env`。API 跑在宿主机时，把 `POSTGRES_SERVER` 和 `REDIS_*_HOST` 设成 `127.0.0.1`。`LLM_API_KEY` 只放这个本地文件。默认关闭 embeddings（DeepSeek chat 没有 `/embeddings`）；向量检索可在工作台「模型密钥」里另填。

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
| `icon.png` / `Demo image.png` | 仓库图标与主页面截图 |

学习笔记和本地协作规则不进 Git。

## License

MIT

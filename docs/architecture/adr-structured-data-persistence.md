# ADR: 结构化数据持久化策略 (Structured Data Persistence Strategy)

> 状态：**Proposed (2026-05-20)**
> 关联：[storage-strategy.md](./storage-strategy.md) · [adr-engine-ai-native-foundation.md](./adr-engine-ai-native-foundation.md) · [adr-asset-federation.md](./adr-asset-federation.md) · [format-strategy.md](./format-strategy.md) · [agent-memory-unification.md](./agent-memory-unification.md) · [asset-knowledge-graph.md](./asset-knowledge-graph.md) · [adr-engine-interface-pipeline-decoupling.md](./adr-engine-interface-pipeline-decoupling.md)

---

## 一、背景与动机

### 1.1 现状

neko-suite 当前 **所有结构化数据均以 JSON 文件持久化**，无任何数据库。四级存储层级（定义于 `storage.ts`）：

| 层级 | 路径 | 性质 | Git |
|------|------|------|-----|
| L0 | `~/.neko/` | 全局用户级 | 否 |
| L1a | `<project>/neko/` | 项目事实 | 是 |
| L1b | `<project>/.neko/` | 项目本地 | 否 |
| L2 | `<project>/.neko/.cache/` | 派生缓存 | 否 |

这一设计在 `format-strategy.md` 中确立为正确的起点——JSON 可 Git 追踪、可人工编辑、AI 可直接读写。对中小规模项目完全够用。

### 1.2 JSON 的规模瓶颈

随着项目体量增长，纯 JSON 方案在以下维度遇到天花板：

| 瓶颈 | 症状 | 涉及文件 |
|------|------|---------|
| **全量反序列化** | 查询 1 条记录需 `JSON.parse()` 整个文件 | `library.json`、`media-metadata.json` |
| **无索引查询** | "type=env AND mood=dark" 需全文件遍历 | `library.json`、`generated/index.json` |
| **无跨文件 JOIN** | 关联实体→绑定→素材→语义需加载 3+ 文件 | `library.json` + `entity-bindings.json` + `asset-graph.json` |
| **JSONL 无范围查询** | 对话日志按时间/关键词检索需全文扫描 | `journals/*.jsonl` |
| **向量搜索 O(N)** | 暴力遍历 JSON 数组做相似度匹配 | `vectors/*.json` |
| **无全文搜索** | 子字符串匹配需加载全量索引到内存 | `search-index.json` |

### 1.3 数据量预估

| 项目规模 | 素材库条目 | 实体数 | 生成物 | 对话轮次 | 向量数 |
|---------|-----------|-------|-------|---------|-------|
| 短片/MV | ~200 | ~100 | ~100 | ~1K | ~1K |
| 季番/网剧 (12集) | ~2K | ~500-1K | ~1K | ~10K | ~5K |
| 长篇连载/游戏 | ~10K | ~3K-10K | ~5K+ | ~50K | ~30K |
| 工作室级（多项目） | ~50K+ | ~10K+ | ~10K+ | ~100K+ | ~50K+ |

**增长驱动因素**：

- **变体是乘数**：每个角色的表情/服装/年龄/2D+3D 维度让实体数膨胀 5-20 倍
- **AI 生成加速累积**：Agent 批量生成素材快速膨胀 `generated/` 目录
- **跨项目复用**：工作室的素材库持续累积，角色跨项目复用、派生、演化
- **对话历史无上限**：Agent 会话随使用时间线性增长

### 1.4 与已有 ADR 的关系

`storage-strategy.md` §4 已预见 "Phase 2 按需切换 SQLite（接口不变）"，§5 预见 "单项目向量 > 50K 条时替换为 SQLite + vec 扩展"。本 ADR 正式化该迁移路径，给出完整数据分类、schema 草案和分阶段实施计划。

---

## 二、决策驱动因素

以下触发条件决定何时引入数据库——**不是"现在就做"，而是"达到阈值时做"**：

| 编号 | 触发条件 | 阈值 | 当前状态 | 预计触发 |
|------|---------|------|---------|---------|
| D1 | AssetManifest 全量反序列化延迟 | > 200ms (单次) | ~50ms | 中期 (1K+ entities) |
| D2 | Agent 需要跨文件关系查询 | 首次跨文件 JOIN | 不存在 | 近期 (Agent 闭环需求) |
| D3 | Generated asset 过滤瓶颈 | > 1000 条 | ~100 | 中期 |
| D4 | 语义搜索需持久化向量索引 | 任何 ANN 需求 | 不存在 | 近期 (federation 落地) |
| D5 | 对话日志检索瓶颈 | 单文件 > 10K 行 | ~100-500 | 中远期 |

**D2 和 D4 预计最先触发**——Agent 闭环和 Asset Federation 落地时即需要关系查询和语义搜索能力。

---

## 三、方案评估

### 方案 A：SQLite + sqlite-vec（单一 .db 文件）

```
.neko/.cache/neko-cache.db
  ├── 结构化表: entities / bindings / manifests / metadata
  ├── FTS5 全文搜索: asset descriptions / script content
  └── sqlite-vec 扩展: 向量列 + KNN 查询
```

- 单文件、嵌入式、零外部进程
- Rust 侧 `rusqlite` (bundled) 成熟稳定
- 结构化 + 全文 + 向量 **一个引擎全覆盖**
- 类似工具先例：Zed/Obsidian/VSCode Settings Sync 均使用 SQLite

### 方案 B：SQLite + 独立向量数据库（Qdrant/Milvus/Chroma）

- 各取所长，向量搜索质量最高
- 需要外部进程管理，违反 VSCode 扩展嵌入式约束
- 分布式/多租户优势在单用户场景完全浪费

### 方案 C：SQLite + 自建 HNSW（Rust）

- 纯 Rust，零 C 扩展依赖
- 自建维护成本高
- sqlite-vec 已提供同等能力

### 对比

| 维度 | A: SQLite+vec | B: +向量库 | C: +自建 HNSW |
|------|--------------|-----------|---------------|
| 嵌入性 | **单进程** | 需外部进程 | 单进程 |
| 实现复杂度 | 低 | 高 | 高 |
| ANN 质量 (50K) | 足够 | 过剩 | 取决于实现 |
| Rust 集成 | `rusqlite` (成熟) | rusqlite + client | rusqlite + custom |
| 复合查询 | **SQL 一条搞定** | 应用层协调 | 应用层协调 |
| 二进制增量 | ~2MB | ~20MB+ | ~2MB |
| 维护负担 | 低 (upstream) | 中 | 高 (自维护) |

---

## 四、决策

**选择方案 A：SQLite + sqlite-vec，单一 .db 文件作为缓存层。**

### 核心原则

**D1: SQLite 是缓存层，不是 SSOT。**

```
                 ┌─ 写入 ─┐
  用户/Agent ──► JSON 文件 (SSOT)
                    │
                    │ rebuild / sync
                    ▼
              SQLite (cache)
                    │
                    │ 查询
                    ▼
              TypeScript / Agent
```

所有写操作先落 JSON 文件，SQLite 通过读取 JSON 生成。`neko-cache.db` 可随时删除并从 JSON 重建——与 `.neko/.cache/thumbnails/` 完全一致。

**D2: 单一 .db 文件，不分库。** 一个 `neko-cache.db` 承载结构化表 + FTS5 + sqlite-vec。避免跨库 JOIN 复杂度。路径：`.neko/.cache/neko-cache.db`。

**D3: Rust sidecar 拥有数据库连接。** Engine 进程通过 `rusqlite` (bundled) 打开和管理数据库。TypeScript 通过 ActionRouter 的 `cache:*` 命令族访问。Extension Host **不直接加载** `better-sqlite3`。

**D4: 现有接口不变。** `IVectorStore`、`IAssetGraph`、`ProjectCacheSearchService` 等接口（已定义于 `storage-strategy.md`）保持不变，实现层从 JSON 切换到 SQLite。

**D5: 不引入独立向量数据库。** sqlite-vec 覆盖万级向量规模，与 `adr-engine-ai-native-foundation.md` 的 `engine-vector-index` crate 对齐——sqlite-vec 作为其持久化后端。

---

## 五、数据分类

### Tier 1——入库（DB 为缓存，JSON 为 SSOT）

| 数据 | 当前位置 | SSOT | DB 角色 | 入库理由 |
|------|---------|------|---------|---------|
| 素材库 | `neko/assets/library.json` | JSON (git) | 索引 + 关系查询 | tag 过滤、跨实体 JOIN |
| 实体绑定 | `neko/entity-bindings.json` | JSON (git) | JOIN 目标 | 跨实体-素材关联查询 |
| 统一实体索引 | `neko/entities/*.json` | JSON (git) | 搜索投影 | 别名解析、跨类型搜索 |
| 媒体元数据缓存 | `.neko/.cache/media-metadata.json` | JSON | key lookup | mtime 失效、批量查询 |
| 媒体搜索索引 | `.neko/.cache/search-index.json` | JSON | FTS5 索引 | 子字符串匹配、类型过滤 |
| 生成物索引 | `.neko/.cache/generated/index.json` | JSON | 索引 + 过滤 | 按 model/date/type 过滤 |
| 素材关系图 | `.neko/.cache/asset-graph.json` | JSON | 图遍历 | 路径查询、关系遍历 |
| 向量嵌入 | `.neko/.cache/vectors/*.json` | JSON | sqlite-vec ANN | 语义搜索、multimodal RAG |
| 对话日志 | `~/.neko/journals/*.jsonl` | JSONL 文件 | 索引 + 查询加速 | 时间范围、关键词、跨会话分析 |

### Tier 2——按需入库

| 数据 | 入库条件 | DB 角色 |
|------|---------|---------|
| Proxy manifest | 状态查询频繁时 | 状态索引 |
| 搜索分区元数据 | 分区增多时 | freshness 索引 |
| 任务恢复状态 | 跨会话查询需求 | 可选索引 |

### Tier 3——永不入库（保持文件）

| 数据 | 理由 |
|------|------|
| 配置 (`settings.json`, `config.json`) | 低频读写、用户手编、Git 跟踪 |
| Provider Cards (`providers/*.card.md`) | Markdown、AI 直读、Git 跟踪 |
| Memory (`memory.md`) | Markdown、用户手编、AI 直读写 |
| AGENTS.md | 用户显式提示词配置 |
| 项目文件 (`.nkv`, `.nkc`, `.nks` 等) | 子包独占、Format SDK 管线、Git 跟踪 |
| IDC artifacts (`drafts/`, `plans/`, `tasks/`) | 用户可见创作产物、run-scoped |

---

## 六、Schema 设计草案

### 6.1 核心结构化表

```sql
-- 素材实体 (mirrors neko/assets/library.json)
CREATE TABLE asset_entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'character' | 'scene' | 'prop' | 'effect' ...
  name TEXT NOT NULL,
  aliases TEXT,                 -- JSON array
  attributes TEXT,              -- JSON object (mood, style, tags...)
  created_at INTEGER,
  updated_at INTEGER
);

-- 素材变体 (entity 的具体表示)
CREATE TABLE asset_variants (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES asset_entities(id),
  path TEXT NOT NULL,
  media_kind TEXT,              -- 'image' | 'video' | '3d-model' | 'puppet'
  dimension TEXT,               -- '3d-rigged' | '2d-puppet' | '2d-raster' | 'voice'
  tags TEXT,                    -- JSON array
  metadata TEXT,                -- JSON object
  source TEXT,                  -- 'copy-managed' | 'local-link' | 'git-lfs' | 'ai-generated'
  created_at INTEGER
);

-- 实体绑定 (mirrors neko/entity-bindings.json)
CREATE TABLE entity_bindings (
  entity_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  slot TEXT,                    -- binding role
  confidence REAL,
  user_confirmed INTEGER DEFAULT 0,
  PRIMARY KEY (entity_id, asset_id)
);

-- 素材关系图 (mirrors .neko/.cache/asset-graph.json)
CREATE TABLE asset_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,       -- 'alias-of' | 'bound-to' | 'depicts' | 'derived-from' ...
  strength TEXT,                -- 'confirmed' | 'inferred'
  confidence REAL,
  provenance TEXT,              -- 'user' | 'lineage' | 'rule' | 'ai'
  metadata TEXT,
  UNIQUE(from_id, to_id, relation)
);

-- 媒体文件索引 (mirrors .neko/.cache/search-index.json)
CREATE TABLE media_files (
  path TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  extension TEXT,
  media_type TEXT,              -- 'video' | 'audio' | 'image' | '3d' | 'document'
  library_name TEXT,
  size_bytes INTEGER,
  mtime INTEGER
);

-- 媒体元数据缓存 (mirrors .neko/.cache/media-metadata.json)
CREATE TABLE media_metadata (
  cache_key TEXT PRIMARY KEY,   -- PathResolver portable key
  mtime INTEGER NOT NULL,       -- source file mtime for invalidation
  probe_result TEXT NOT NULL    -- JSON: full probe output
);

-- AI 生成物索引 (mirrors .neko/.cache/generated/index.json)
CREATE TABLE generated_assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'image' | 'video' | 'audio' | 'storyboard'
  model TEXT,
  provider TEXT,
  prompt TEXT,
  source_node_id TEXT,
  path TEXT NOT NULL,
  created_at INTEGER,
  metadata TEXT                 -- JSON: dimensions, duration, etc.
);

-- 对话日志索引 (indexes ~/.neko/journals/*.jsonl, 不复制全文)
CREATE TABLE conversation_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  content_preview TEXT,         -- first 200 chars for search
  metadata TEXT,
  line_offset INTEGER           -- byte offset in JSONL for random access
);
CREATE INDEX idx_conv_time ON conversation_entries(conversation_id, timestamp);
```

### 6.2 FTS5 全文搜索

```sql
CREATE VIRTUAL TABLE media_files_fts USING fts5(
  filename, path, library_name,
  content=media_files, content_rowid=rowid
);

CREATE VIRTUAL TABLE generated_fts USING fts5(
  prompt, model, type,
  content=generated_assets, content_rowid=rowid
);

CREATE VIRTUAL TABLE conversation_fts USING fts5(
  content_preview,
  content=conversation_entries, content_rowid=id
);
```

### 6.3 sqlite-vec 向量表

```sql
-- 按 modality 分表（不同模型产出不同维度的 embedding）
CREATE VIRTUAL TABLE vec_visual USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[768],         -- CLIP dimension
  +asset_id TEXT,
  +source TEXT                  -- 'clip' | 'custom'
);

CREATE VIRTUAL TABLE vec_text USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[1536],        -- text-embedding-3 dimension
  +asset_id TEXT,
  +source TEXT                  -- 'openai' | 'script-embed'
);
```

按 modality 分表而非混合维度，避免混乱。新 modality 新增 `vec_{modality}` 表即可。

### 6.4 元信息表

```sql
CREATE TABLE _meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- INSERT INTO _meta VALUES ('schema_version', '1');
-- INSERT INTO _meta VALUES ('rebuilt_at', '2026-05-20T12:00:00Z');
```

---

## 七、缓存重建策略

### 7.1 触发条件

| 条件 | 动作 |
|------|------|
| `neko-cache.db` 不存在 | 全量重建 |
| `schema_version` 不匹配 | DROP ALL → 全量重建 |
| 用户手动执行 `Neko: Rebuild Cache Database` | 全量重建 |
| JSON 源文件变更（FileWatcher） | 增量同步 |

### 7.2 全量重建流程

```
Phase 1: Schema 创建 (< 1ms)
  CREATE TABLE ... / CREATE VIRTUAL TABLE ...

Phase 2: 批量导入 (主耗时)
  BEGIN TRANSACTION
  for each JSON source:
    parse → batch INSERT (1000 rows/transaction)
  COMMIT

Phase 3: 索引创建
  CREATE INDEX ... (bulk import 后再建索引更快)

Phase 4: 向量填充 (可延迟、可异步)
  读取 vectors/*.json → INSERT INTO vec_*
```

**预估耗时**：

| 数据规模 | 重建耗时 |
|---------|---------|
| 1K 素材 + 1K 向量 | < 1s |
| 10K 媒体 + 5K 向量 | < 5s |
| 100K 日志 + 50K 向量 | < 30s |

### 7.3 增量同步

复用现有 FileWatcher 机制（`ProjectIndexCoordinator`），JSON 变更 → debounce 500ms → parse delta → `UPDATE/INSERT` 到 SQLite。

### 7.4 Schema 迁移策略

**简单策略：version mismatch → DROP ALL → 从 JSON 重建。** 不做复杂的 migration chain——只有 SSOT 文件 (`.nkv` 等) 才需要增量迁移，缓存数据库可以重建。

---

## 八、引擎集成

### 8.1 Rust 侧

- `rusqlite` (bundled feature) + `sqlite-vec` 作为 `engine-kernel` 或独立 `engine-cache-db` 模块
- Lazy open：首次查询时打开数据库，不需要 DB 的轻量场景零成本
- WAL mode：并发读 + 单写

### 8.2 ActionRouter 命令族

遵循 `group:action` 模式（`adr-engine-interface-pipeline-decoupling.md`）：

| Action | 描述 |
|--------|------|
| `cache:rebuild` | 全量重建 |
| `cache:query-assets` | 结构化素材查询（filter + sort + limit） |
| `cache:search` | FTS5 全文搜索 |
| `cache:vector-search` | ANN 向量相似度搜索 |
| `cache:graph-query` | 素材关系图遍历 |
| `cache:stats` | 缓存统计信息 |

### 8.3 TypeScript 侧

`IVectorStore`、`IAssetGraph`、`ProjectCacheSearchService` 新增 **engine-dispatch 实现**，通过 ActionRouter 调用 Rust 侧查询。保留 **JSON-only fallback** 实现——engine 未运行时（轻量编辑模式）退化到 JSON 直读。

---

## 九、多模态 RAG 必要性分析

### 9.1 三层检索递进

| 层次 | 描述 | 必要性 | 实现手段 |
|------|------|--------|---------|
| L1: 结构化检索 | 按标签/类型/名称查找 | 必需，已有 | `asset_entities` + SQL WHERE |
| L2: 语义检索 | "找个温暖的黄昏场景" | Agent 闭环必需 | `vec_text` + FTS5 |
| L3: 跨模态检索 | 拿参考图找相似角色 | 差异化能力，非 P0 | `vec_visual` + CLIP 嵌入 |

### 9.2 L2 是 Agent 闭环的必要条件

```
Agent 任务: "给第三幕加一个忧郁的雨夜场景"
  ↓
没有语义检索 → Agent 只能盲猜或让用户手动指定
有语义检索   → Agent 自主检索匹配素材，提出方案
```

没有 L2，Agent 在素材选择上永远是"瞎子操作"。这正是 `perception-first-roadmap.md` Q2 2026 "Perception tool exposure" 的核心前置条件。

### 9.3 sqlite-vec 覆盖 L2 + L3

- L2（文本嵌入语义搜索）：`vec_text` 表 + text-embedding 模型，万级向量 ANN 足够
- L3（CLIP 视觉嵌入跨模态搜索）：`vec_visual` 表 + CLIP 编码，同一 DB 内完成
- **复合查询**一条 SQL 搞定：`SELECT ... FROM asset_entities JOIN vec_visual ... WHERE type='env' ORDER BY vec_distance(...) LIMIT 10`

独立向量数据库无法提供这种结构化 + 向量的混合查询能力。

---

## 十、分阶段实施计划

### Phase 0: 基础设施 (~3 PR)

| PR | 内容 | 依赖 |
|----|------|------|
| PR0.1 | `engine-kernel`: 添加 `rusqlite` (bundled) + `sqlite-vec` 依赖；`CacheDatabase` struct (open/close/schema migration) | 无 |
| PR0.2 | `@neko/shared`: `ICacheLayout` 增加 `database` 字段；`resolveStorageLayout` 添加 `.neko/.cache/neko-cache.db` | 无 |
| PR0.3 | ActionRouter 暴露 `cache:rebuild` + `cache:stats` | PR0.1 |

### Phase 1: 媒体索引入库 — 首个真实消费者 (~4 PR)

| PR | 内容 | 依赖 |
|----|------|------|
| PR1.1 | `media_files` + `media_files_fts` 表；从 `search-index.json` 导入；`cache:search` action | PR0.3 |
| PR1.2 | `media_metadata` 表；从 `media-metadata.json` 导入 | PR0.3 |
| PR1.3 | `MediaLibrarySearchService` 后端切换到 engine dispatch（保留 JSON fallback） | PR1.1 |
| PR1.4 | 增量同步：FileWatcher → `media_files` 增量更新 | PR1.1 |

### Phase 2: 素材库 + 关系图入库 (~5 PR)

| PR | 内容 | 依赖 |
|----|------|------|
| PR2.1 | `asset_entities` + `asset_variants` + `entity_bindings` 表；从 JSON 导入 | PR0.3 |
| PR2.2 | `asset_edges` 表；从 `asset-graph.json` 导入；`cache:graph-query` action | PR0.3 |
| PR2.3 | `generated_assets` + `generated_fts` 表；从 `generated/index.json` 导入 | PR0.3 |
| PR2.4 | `IAssetGraph` + `AssetLibrary` 后端切换 | PR2.1 + PR2.2 |
| PR2.5 | Agent mention/search projection 后端切换 | PR2.4 |

### Phase 3: 向量索引 + 对话日志 (~4 PR)

| PR | 内容 | 依赖 |
|----|------|------|
| PR3.1 | `vec_visual` + `vec_text` sqlite-vec 表；从 `vectors/*.json` 导入；`cache:vector-search` action | PR0.3 |
| PR3.2 | `conversation_entries` + `conversation_fts` 表；索引 `journals/*.jsonl` | PR0.3 |
| PR3.3 | `IVectorStore` 后端切换到 sqlite-vec；`engine-vector-index` crate 集成 | PR3.1 |
| PR3.4 | 对话搜索 UI / Agent 跨会话查询 | PR3.2 |

### Phase 4: 优化 + 清理 (~2-3 PR, 可选)

| PR | 内容 |
|----|------|
| PR4.1 | WAL mode 调优、pragma 优化、批量写入事务优化 |
| PR4.2 | 移除 JSON-only 实现代码路径（保留 fallback 开关） |
| PR4.3 | Cache 统计面板（`ICacheStats`，参考 `storage-strategy.md` §9 P2） |

---

## 十一、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| SQLite 锁竞争 | 多子包同时读写 | WAL mode + 写操作集中在 engine sidecar 单线程 |
| sqlite-vec 成熟度 | ANN 质量/API 变化 | neko-suite 规模 (50K) 在其设计范围内；可退化到暴力扫描 |
| DB 与 JSON 不一致 | 缓存漂移 | 写先落 JSON → watcher → DB sync；periodic full rebuild check |
| 引擎未运行时查询 | 轻量模式无 DB | 保留 JSON-only fallback，接口层透明 |
| DB 文件损坏 | 启动失败 | 删除 `neko-cache.db` 自动重建（在 `.neko/.cache/` 所以不丢数据） |
| 二进制体积增长 | rusqlite bundled ~2MB | 远小于 FFmpeg/wgpu 等已有依赖 |
| Git 不友好 | `.db` 文件不能 merge | DB 在 `.neko/.cache/` (gitignored)，JSON SSOT 仍然 Git-friendly |

---

## 十二、反模式清单

```
SDP-1  "DB 成为 SSOT"
       现象：代码直接写 SQLite 而不先写 JSON
       代价：删除 .neko/.cache/ 后丢数据
       修法：所有写操作必须先落 JSON，DB 只是派生缓存

SDP-2  "TypeScript 直连 SQLite"
       现象：Extension Host 进程加载 better-sqlite3 直接读写 DB
       代价：与 engine sidecar 锁竞争；VSCode 扩展审核风险
       修法：所有 DB 查询通过 engine ActionRouter dispatch

SDP-3  "不提供 JSON fallback"
       现象：新功能只有 DB 路径，engine 不运行时功能不可用
       代价：轻量编辑场景退化
       修法：保留 JSON-only 实现作为 fallback，DB 实现包裹同一接口

SDP-4  "过早引入 DB"
       现象：数据量还在 JSON 舒适区就切换到 DB
       代价：增加复杂度而无性能收益
       修法：按 D1-D5 触发条件分阶段实施

SDP-5  "schema migration 过复杂"
       现象：为 SQLite cache 设计复杂的 migration chain
       代价：维护成本高，且 cache 本可删除重建
       修法：version mismatch → DROP ALL → 从 JSON 重建

SDP-6  "向量和结构数据分库"
       现象：结构化数据和向量分开存储在不同 SQLite 文件
       代价：跨库 JOIN 不可能；文件管理复杂度增加
       修法：单一 neko-cache.db，sqlite-vec 虚拟表与普通表共存
```

---

## 十三、开放问题

| # | 问题 | 选项 | 倾向 |
|---|------|------|------|
| 1 | DB 打开时机 | A) engine 启动时打开 B) 首次查询时 lazy open | B — 轻量场景零成本 |
| 2 | 全局 DB (L0) | A) 仅项目级 B) 项目级 + `~/.neko/.cache/global-cache.db` | 先 A，观察跨项目需求后再扩展 |
| 3 | 向量维度处理 | A) 单表固定维度 B) 按 modality 分表 C) 动态维度 | B — `vec_visual_768`, `vec_text_1536` 避免混乱 |
| 4 | 与 engine-vector-index crate 关系 | A) crate 内部用 sqlite-vec B) 独立 crate 共享 DB 连接 | A — sqlite-vec 作为 `engine-vector-index` 的实现细节 |

# neko-assets 三项改进设计

Date: 2026-03-07

## 概览

本文档涵盖三个独立改进：

1. **AI 分类器**：实现 `IAssetClassifier` 连接 neko-agent LLM（含视觉识别），替换 `RuleClassifier`
2. **并发池 Bug 修复**：修正 `AssetHealthService.validateAll` 的池管理逻辑
3. **媒体库增量索引**：`MediaLibraryTreeProvider` 加目录缓存 + FileSystemWatcher，避免每次重扫

---

## Task 1：AI 分类器（跨扩展命令方案）

### 设计决策

选择跨扩展命令方案（方案 B），原因：
- 与现有 `neko.assets.getAllEntities`（被 neko-canvas 调用）模式完全一致
- neko-assets 无需引入 `@neko/platform` 等重依赖
- 复用 neko-agent 已配置的 Service（用户 API key 只需配置一次）
- neko-agent 未激活时优雅降级到 `RuleClassifier`

### 变更 1：neko-agent 新增 `neko.agent.internalChat` 命令

文件：`packages/neko-agent/packages/extension/src/index.ts`

注册位置：`registerCommands()` 函数内。

```typescript
// Internal API: allow other extensions to call LLM via neko-agent's configured service
vscode.commands.registerCommand(
  'neko.agent.internalChat',
  async (messages: ChatMessage[], options?: { maxTokens?: number }): Promise<string | null> => {
    try {
      const platform = services.get(IPlatform);
      if (!platform) return null;
      const service = platform.createService();
      const response = await service.chat(messages, {
        maxTokens: options?.maxTokens ?? 1000,
      });
      const content = response.message.content;
      return typeof content === 'string' ? content : null;
    } catch {
      return null;
    }
  }
)
```

导入：需要从 bootstrap 导入 `IPlatform` 和 `ChatMessage` 类型。

### 变更 2：neko-assets 新建 `LLMClassifier`

文件：`packages/neko-assets/src/services/LLMClassifier.ts`

```
LLMClassifier implements IAssetClassifier
  构造器: constructor(private fallback: IAssetClassifier)

  analyze(filePath, options?)
    ├── 图片文件 (.png/.jpg/.gif/.webp/.bmp/.tiff/.svg)
    │     → 读文件为 base64 data URL
    │     → messages = [system, user(text + ImagePart)]
    ├── 其他文件
    │     → messages = [system, user(text only, 含文件名+扩展)]
    ├── executeCommand('neko.agent.internalChat', messages, { maxTokens: 800 })
    ├── 响应为 null → fallback.analyze()
    ├── JSON.parse(response) → ClassificationResult
    └── 解析失败 → fallback.analyze()

  suggestVariantAttributes(entityId, filePath)
    → 类似 analyze，使用专门的属性提取 prompt
    → 失败 → fallback.suggestVariantAttributes()

  suggestTags(filePath) → text-only prompt，失败 → fallback.suggestTags()

  findSimilarEntities(filePath) → 返回 []（向量搜索超出当前范围）
```

#### System Prompt（分类）

```
You are a creative asset classifier for a video/game production pipeline.
Analyze the provided file and return ONLY valid JSON with this exact schema:
{
  "category": "character"|"creature"|"object"|"vehicle"|"environment"|"effect"|"ui"|"audio",
  "name": "human-readable name without extension",
  "description": "one sentence description",
  "tags": ["tag1", "tag2"],
  "attributes": {
    "view"?: "front"|"back"|"left"|"right"|"top"|"bottom"|"isometric"|"3/4",
    "expression"?: "neutral"|"happy"|"sad"|"angry"|"surprised"|"talking"|"sleeping",
    "action"?: "idle"|"walk"|"run"|"jump"|"attack"|"sit"|"lie"
  },
  "confidence": 0.0-1.0
}
Return only the JSON object, no markdown, no explanation.
```

### 变更 3：extension.ts 启用 LLMClassifier

```typescript
// 替换: classifier: new RuleClassifier()
classifier: new LLMClassifier(new RuleClassifier()),
```

---

## Task 2：修复 AssetHealthService.validateAll 并发池 Bug

### Bug 根因

```typescript
// 当前代码（有 bug）
if (pool.length >= this.concurrency) {
  await Promise.race(pool);
  for (let i = pool.length - 1; i >= 0; i--) {
    const settled = await Promise.race([
      pool[i]!.then(() => true),
      Promise.resolve(false),  // 立即 resolve(false)，race 永远返回 false
    ]);
    if (settled) pool.splice(i, 1);  // 永远不执行
  }
}
// 结论：pool 从不缩减，实际无限并发
```

### 修复方案

使用 `Set<Promise<void>>` + `.finally()` 自动移除模式：

```typescript
// 提取为内部辅助（减少重复）
const processEntry = async (entry: FileEntry): Promise<void> => {
  const status = await this.checker(entry.path);
  // ... update storage, push to results
  checked++;
  onProgress?.(checked, total);
};

// 正确的并发池
const active = new Set<Promise<void>>();
for (const entry of fileEntries) {
  const task: Promise<void> = processEntry(entry).finally(() => active.delete(task));
  active.add(task);
  if (active.size >= this.concurrency) await Promise.race(active);
}
await Promise.all(active);
```

注：`task` 在 `.finally()` 执行时已经赋值，TypeScript `let task` 声明即可。

---

## Task 3：MediaLibraryTreeProvider 增量缓存

### 当前问题

每次 `getChildren(element)` 展开目录都调用 `fs.readdir()`，大型媒体库首次加载后再展开/折叠仍重扫。没有文件系统监听，文件变更只能手动刷新。

### 新增字段

```typescript
private directoryCache = new Map<string, MediaLibraryItem[]>();
private directoryWatchers = new Map<string, vscode.FileSystemWatcher>();
```

### listDirectory() 逻辑

```
命中 directoryCache → 直接返回缓存（无 I/O）
否 → fs.readdir → 构建 items（触发 async metadata/thumbnail）
   → directoryCache.set(dirPath, items)
   → watchDirectory(dirPath)
   → 返回 items
```

### watchDirectory() 实现

```typescript
private watchDirectory(dirPath: string): void {
  if (this.directoryWatchers.has(dirPath)) return;  // 防重复注册

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dirPath, '*')
  );

  const invalidate = () => {
    // 清该目录的列表缓存
    this.directoryCache.delete(dirPath);
    // 清该目录下所有文件的 metadata/thumbnail 缓存
    for (const key of this.metadataCache.keys()) {
      if (key.startsWith(dirPath + path.sep)) this.metadataCache.delete(key);
    }
    for (const key of this.thumbnailCache.keys()) {
      if (key.startsWith(dirPath + path.sep)) this.thumbnailCache.delete(key);
    }
    this.debouncedRefresh();
  };

  this.disposables.push(
    watcher,
    watcher.onDidCreate(invalidate),
    watcher.onDidDelete(invalidate),
    watcher.onDidChange(invalidate),
  );
  this.directoryWatchers.set(dirPath, watcher);
}
```

### refresh() 改动

```typescript
refresh(): void {
  // 清所有缓存（含新增的目录缓存）
  this.directoryCache.clear();
  this.directoryWatchers.clear();  // watcher 已通过 disposables 管理
  this.thumbnailCache.clear();
  this.metadataCache.clear();
  this.pendingThumbnails.clear();
  this._onDidChangeTreeData.fire(undefined);
}
```

注：watcher dispose 已在 `this.disposables` 中，`directoryWatchers.clear()` 只清 Map 引用，不影响 dispose 链。新展开时会重新注册 watcher。

### dispose() 改动

无需改动：所有 watcher 已经 push 到 `this.disposables`，`dispose()` 时自动清理。

---

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `packages/neko-agent/packages/extension/src/index.ts` | 新增 `neko.agent.internalChat` 命令 |
| `packages/neko-assets/src/services/LLMClassifier.ts` | 新建，实现 `IAssetClassifier` |
| `packages/neko-assets/src/extension.ts` | 使用 `LLMClassifier` 替换 `RuleClassifier` |
| `packages/neko-assets/packages/asset/src/service/AssetHealthService.ts` | 修复并发池 bug |
| `packages/neko-assets/src/providers/MediaLibraryTreeProvider.ts` | 增量缓存 + FileSystemWatcher |

# neko-assets Three Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** (1) Fix AssetHealthService concurrency pool bug, (2) add MediaLibraryTreeProvider directory caching with file watchers, (3) implement LLMClassifier connecting neko-assets to neko-agent's LLM service.

**Architecture:** Task 1 & 2 are self-contained fixes within neko-assets. Task 3 spans two extensions: neko-agent gets a new `neko.agent.internalChat` internal command; neko-assets gets a new `LLMClassifier` service that calls it and falls back to `RuleClassifier` on any error. The core `@neko/asset` package is NOT changed — the classifier is injected from the extension layer.

**Tech Stack:** TypeScript, VSCode Extension API, `@neko/platform` Service (chat), `@neko/asset` IAssetClassifier interface, Node.js `fs/promises` for base64 encoding.

**Design doc:** `docs/plans/2026-03-07-neko-assets-improvements-design.md`

---

## Task 1: Fix AssetHealthService Concurrency Pool Bug

**Files:**
- Modify: `packages/neko-assets/packages/asset/src/service/AssetHealthService.ts`
- Test: `packages/neko-assets/packages/asset/src/__tests__/service/AssetHealthService.test.ts`

### Step 1: Read the existing test file to understand patterns

```bash
cat packages/neko-assets/packages/asset/src/__tests__/service/AssetHealthService.test.ts
```

### Step 2: Add a failing test that exposes the concurrency bug

Open `packages/neko-assets/packages/asset/src/__tests__/service/AssetHealthService.test.ts` and add this test inside the describe block:

```typescript
it('respects concurrency limit during validateAll', async () => {
  // Create 10 files, concurrency = 2
  const entities = Array.from({ length: 10 }, (_, i) =>
    createEntity({ id: `e${i}`, variants: [createVariant({ id: `v${i}`, files: [createFile({ id: `f${i}`, path: `/file${i}` })] })] })
  );
  for (const e of entities) await storage.saveEntity(e);

  let activeCount = 0;
  let maxActive = 0;

  const checker: FileAccessChecker = async () => {
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);
    await new Promise(r => setTimeout(r, 10)); // simulate async I/O
    activeCount--;
    return 'online';
  };

  const service = new AssetHealthService({ storage, fileAccessChecker: checker, concurrency: 2 });
  await service.validateAll();

  expect(maxActive).toBeLessThanOrEqual(2);
});
```

### Step 3: Run the test to verify it fails

```bash
cd packages/neko-assets/packages/asset && npx vitest run --reporter=verbose 2>&1 | grep -A5 "concurrency"
```

Expected: FAIL — `maxActive` will be 10 (all run in parallel) because the pool never shrinks.

### Step 4: Fix `validateAll` in AssetHealthService.ts

Replace the `pool` management section in `validateAll`. The method currently has a `pool: Promise<void>[]` array. Replace the entire loop + pool logic with:

```typescript
async validateAll(onProgress?: HealthCheckProgress): Promise<FileHealthResult[]> {
  const entities = await this.storage.getAllEntities();
  const results: FileHealthResult[] = [];

  // Flatten all files with parent info
  const fileEntries: Array<{
    fileId: string;
    variantId: string;
    entityId: string;
    entityName: string;
    path: string;
    previousStatus?: AssetFileStatus;
  }> = [];

  for (const entity of entities) {
    for (const variant of entity.variants) {
      for (const file of variant.files) {
        fileEntries.push({
          fileId: file.id,
          variantId: variant.id,
          entityId: entity.id,
          entityName: entity.name,
          path: file.path,
          previousStatus: file.status,
        });
      }
    }
  }

  const total = fileEntries.length;
  if (total === 0) return [];

  // Process single entry and update storage
  const processEntry = async (entry: typeof fileEntries[number]): Promise<void> => {
    const status = await this.checker(entry.path);

    const file = await this.storage.getFile(entry.variantId, entry.fileId);
    if (file) {
      file.status = status;
      file.lastCheckedAt = Date.now();
      await this.storage.saveFile(entry.variantId, file);
    }

    results.push({
      fileId: entry.fileId,
      variantId: entry.variantId,
      entityId: entry.entityId,
      entityName: entry.entityName,
      path: entry.path,
      status,
      previousStatus: entry.previousStatus,
    });

    onProgress?.(results.length, total);
  };

  // Correct concurrency pool using Set + .finally() removal
  const active = new Set<Promise<void>>();
  for (const entry of fileEntries) {
    let task!: Promise<void>;
    task = processEntry(entry).finally(() => active.delete(task));
    active.add(task);
    if (active.size >= this.concurrency) {
      await Promise.race(active);
    }
  }
  await Promise.all(active);

  return results;
}
```

### Step 5: Run tests to verify fix

```bash
cd packages/neko-assets/packages/asset && npx vitest run --reporter=verbose
```

Expected: ALL PASS including the new concurrency test.

### Step 6: Commit

```bash
git add packages/neko-assets/packages/asset/src/service/AssetHealthService.ts \
        packages/neko-assets/packages/asset/src/__tests__/service/AssetHealthService.test.ts
git commit -m "fix(neko-assets): fix concurrency pool bug in AssetHealthService.validateAll

Promise.race + Promise.resolve(false) pattern never removed settled promises from pool,
causing unbounded parallelism. Replace with Set<Promise> + .finally() removal pattern."
```

---

## Task 2: MediaLibraryTreeProvider Incremental Directory Cache

**Files:**
- Modify: `packages/neko-assets/src/providers/MediaLibraryTreeProvider.ts`

No unit tests here (TreeProvider requires full VSCode API mock — integration test only). Verify manually by running the extension.

### Step 1: Read the current provider

```bash
cat packages/neko-assets/src/providers/MediaLibraryTreeProvider.ts
```

Pay attention to: existing cache fields, `refresh()`, `listDirectory()`, `dispose()`.

### Step 2: Add new cache fields after existing cache declarations

In `MediaLibraryTreeProvider` class, after the existing cache fields (`thumbnailCache`, `metadataCache`, `pendingThumbnails`, `refreshDebounceTimer`), add:

```typescript
// Directory listing cache — keyed by absolute dir path
private directoryCache = new Map<string, MediaLibraryItem[]>();
// One FileSystemWatcher per watched directory
private directoryWatchers = new Map<string, vscode.FileSystemWatcher>();
```

### Step 3: Add `watchDirectory` private method

Add this method before `createPlaceholder()`:

```typescript
private watchDirectory(dirPath: string): void {
  if (this.directoryWatchers.has(dirPath)) return; // already watching

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(dirPath, '*'),
  );

  const invalidate = () => {
    // Invalidate directory listing
    this.directoryCache.delete(dirPath);
    // Invalidate metadata/thumbnail for files in this dir
    const prefix = dirPath + path.sep;
    for (const key of this.metadataCache.keys()) {
      if (key.startsWith(prefix)) this.metadataCache.delete(key);
    }
    for (const key of this.thumbnailCache.keys()) {
      if (key.startsWith(prefix)) this.thumbnailCache.delete(key);
    }
    // Debounced tree refresh
    this.debouncedRefresh(dirPath);
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

### Step 4: Modify `listDirectory` to use cache

Replace the entire `listDirectory` method body with a cache-check first:

```typescript
private async listDirectory(dirPath: string): Promise<MediaLibraryItem[]> {
  // Return cached listing if available
  const cached = this.directoryCache.get(dirPath);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items: MediaLibraryItem[] = [];

    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name));

    const files = entries
      .filter(e => e.isFile() && isMediaFile(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const mediaFileCount = files.length;

    for (const dir of dirs) {
      items.push(new DirectoryItem(path.join(dirPath, dir.name), dir.name, mediaFileCount));
    }

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      const mediaType = detectMediaType(filePath);

      let metadata = this.metadataCache.get(filePath);
      if (!metadata) {
        this.extractMetadata(filePath);
      }

      let thumbnailPath: string | null | undefined = this.thumbnailCache.get(filePath);
      if (thumbnailPath === undefined && mediaType === 'video') {
        this.generateThumbnail(filePath);
        thumbnailPath = null;
      }

      items.push(new MediaFileItem(filePath, file.name, metadata, thumbnailPath));
    }

    // Cache result and watch for changes
    this.directoryCache.set(dirPath, items);
    this.watchDirectory(dirPath);

    return items;
  } catch {
    return [];
  }
}
```

### Step 5: Modify `refresh()` to clear directory cache

Replace the existing `refresh()` method:

```typescript
refresh(): void {
  // Clear all caches including directory listings
  this.directoryCache.clear();
  // Dispose existing watchers (new ones register on next expand)
  for (const [, watcher] of this.directoryWatchers) {
    watcher.dispose();
  }
  this.directoryWatchers.clear();
  this.thumbnailCache.clear();
  this.metadataCache.clear();
  this.pendingThumbnails.clear();
  this._onDidChangeTreeData.fire(undefined);
}
```

### Step 6: Check `dispose()` — no change needed

Watchers are already pushed to `this.disposables`, so they are disposed when the provider is disposed. Confirm `dispose()` iterates `this.disposables`.

### Step 7: TypeScript check

```bash
cd packages/neko-assets && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors.

### Step 8: Commit

```bash
git add packages/neko-assets/src/providers/MediaLibraryTreeProvider.ts
git commit -m "feat(neko-assets): add incremental directory cache to MediaLibraryTreeProvider

- Cache directory listings after first scan (Map<dirPath, items>)
- Register FileSystemWatcher per directory for automatic invalidation
- On file change: invalidate only that directory's cache + its files' metadata/thumbnail
- On manual refresh(): clear all caches and re-register watchers on next expand"
```

---

## Task 3: neko-agent — Add `neko.agent.internalChat` Command

**Files:**
- Modify: `packages/neko-agent/packages/extension/src/index.ts`

### Step 1: Read current index.ts and note imports

```bash
head -20 packages/neko-agent/packages/extension/src/index.ts
```

Note which imports exist. We need `IPlatform` from bootstrap and `ChatMessage` type from `@neko/platform`.

### Step 2: Check what's already imported from bootstrap

```bash
grep "import.*bootstrap\|import.*IPlatform\|import.*ChatMessage" \
  packages/neko-agent/packages/extension/src/index.ts
```

### Step 3: Add import for `IPlatform` and `ChatMessage` if missing

At the top of `index.ts`, ensure these imports exist:

```typescript
import { bootstrapCoreServices, logServicesStatus, IPlatform } from './bootstrap';
import type { ChatMessage } from '@neko/platform';
```

`IPlatform` is already exported from `bootstrap/index.ts` (it's used for `services.get(IPlatform)`).

### Step 4: Add `neko.agent.internalChat` inside `registerCommands()`

At the end of `registerCommands()`, before the closing `}`, add:

```typescript
// Internal API: allows other Neko extensions to use the configured LLM
// without depending on @neko/platform directly.
// Returns null if no service is configured or on any error.
context.subscriptions.push(
  vscode.commands.registerCommand(
    'neko.agent.internalChat',
    async (
      messages: ChatMessage[],
      options?: { maxTokens?: number },
    ): Promise<string | null> => {
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
    },
  ),
);
```

Note: `services` is the `ServiceCollection` created in `activate()`. Verify it is in scope of `registerCommands()`. If not, pass it as a parameter (check the current signature: `registerCommands(context, chatViewProvider)`). If needed, add `services: ServiceCollection` as a third parameter and update the call site.

### Step 5: TypeScript check for neko-agent extension

```bash
cd packages/neko-agent/packages/extension && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no new errors.

### Step 6: Commit

```bash
git add packages/neko-agent/packages/extension/src/index.ts
git commit -m "feat(neko-agent): expose neko.agent.internalChat internal API command

Allows other Neko extensions (e.g. neko-assets) to call the configured LLM
without taking a direct dependency on @neko/platform. Returns null on any error
so callers can gracefully degrade."
```

---

## Task 4: neko-assets — Implement LLMClassifier

**Files:**
- Create: `packages/neko-assets/src/services/LLMClassifier.ts`
- Modify: `packages/neko-assets/src/extension.ts`

### Step 1: Check IAssetClassifier interface

```bash
cat packages/neko-assets/packages/asset/src/classifier/IClassifier.ts
```

The interface has: `analyze()`, `suggestVariantAttributes()`, `suggestTags()`, `findSimilarEntities()`.

Also check what types are in `ClassificationResult` and `VariantAttributes`:

```bash
grep -n "ClassificationResult\|VariantAttributes\|EntityCategory" \
  packages/neko-types/src/types/*.ts | head -40
```

### Step 2: Create `LLMClassifier.ts`

Create `packages/neko-assets/src/services/LLMClassifier.ts`:

```typescript
/**
 * LLM Classifier
 *
 * Implements IAssetClassifier by calling neko-agent's LLM via the
 * 'neko.agent.internalChat' cross-extension command.
 * Falls back to the injected fallback classifier on any error.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { IAssetClassifier } from '@neko/asset';
import type {
  ClassificationResult,
  SuggestedEntity,
  VariantAttributes,
  EntityCategory,
  ClassifierOptions,
} from '@neko/shared';

// Image extensions that support vision analysis
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif',
]);

const SYSTEM_PROMPT_CLASSIFY = `\
You are a creative asset classifier for a video/game production pipeline.
Analyze the provided file and return ONLY valid JSON with this exact schema:
{
  "category": "character"|"creature"|"object"|"vehicle"|"environment"|"effect"|"ui"|"audio",
  "name": "human-readable name without extension",
  "description": "one sentence description",
  "tags": ["tag1", "tag2"],
  "attributes": {
    "view": "front"|"back"|"left"|"right"|"top"|"bottom"|"isometric"|"3/4" (optional),
    "expression": "neutral"|"happy"|"sad"|"angry"|"surprised"|"talking"|"sleeping" (optional),
    "action": "idle"|"walk"|"run"|"jump"|"attack"|"sit"|"lie" (optional)
  },
  "confidence": 0.0 to 1.0
}
Return only the JSON object, no markdown fences, no explanation.`;

const SYSTEM_PROMPT_TAGS = `\
You are a creative asset tagger. Given a file name, return ONLY a JSON array of relevant tags.
Example: ["character", "female", "warrior", "fantasy", "idle"]
Return only the JSON array, no markdown, no explanation.`;

const SYSTEM_PROMPT_ATTRIBUTES = `\
You are a creative asset analyzer. Given a file name, return ONLY a JSON object of variant attributes.
Schema: { "view"?: string, "expression"?: string, "action"?: string }
Return only the JSON object, no markdown, no explanation.`;

export class LLMClassifier implements IAssetClassifier {
  constructor(private readonly fallback: IAssetClassifier) {}

  // =========================================================================
  // IAssetClassifier
  // =========================================================================

  async analyze(
    filePath: string,
    _options?: ClassifierOptions,
  ): Promise<ClassificationResult> {
    try {
      const result = await this.callLLMForClassification(filePath);
      if (result) return result;
    } catch {
      // Fall through to fallback
    }
    return this.fallback.analyze(filePath, _options);
  }

  async suggestVariantAttributes(
    _entityId: string,
    filePath: string,
  ): Promise<VariantAttributes> {
    try {
      const fileName = path.basename(filePath);
      const content = await this.internalChat(
        [
          { role: 'system', content: SYSTEM_PROMPT_ATTRIBUTES },
          { role: 'user', content: `File: ${fileName}` },
        ],
        { maxTokens: 200 },
      );
      if (content) {
        const parsed = JSON.parse(this.stripJsonFences(content)) as VariantAttributes;
        return parsed;
      }
    } catch {
      // Fall through
    }
    return this.fallback.suggestVariantAttributes(_entityId, filePath);
  }

  async suggestTags(filePath: string): Promise<string[]> {
    try {
      const fileName = path.basename(filePath);
      const content = await this.internalChat(
        [
          { role: 'system', content: SYSTEM_PROMPT_TAGS },
          { role: 'user', content: `File: ${fileName}` },
        ],
        { maxTokens: 200 },
      );
      if (content) {
        const parsed = JSON.parse(this.stripJsonFences(content)) as string[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fall through
    }
    return this.fallback.suggestTags(filePath);
  }

  async findSimilarEntities(
    filePath: string,
    options?: ClassifierOptions,
  ): Promise<SuggestedEntity[]> {
    // Vector/semantic search is out of scope — delegate to fallback (returns [])
    return this.fallback.findSimilarEntities(filePath, options);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private async callLLMForClassification(
    filePath: string,
  ): Promise<ClassificationResult | null> {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.has(ext);

    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image'; imageUrl: string; detail?: 'auto' | 'low' | 'high' };

    const userContent: ContentPart[] = [];

    if (isImage) {
      try {
        const buffer = await fs.readFile(filePath);
        const mimeType = this.getMimeType(ext);
        const base64 = buffer.toString('base64');
        userContent.push({
          type: 'image',
          imageUrl: `data:${mimeType};base64,${base64}`,
          detail: 'low',
        });
      } catch {
        // Image read failed — fall back to text-only
      }
    }

    userContent.push({
      type: 'text',
      text: `Classify this asset file: ${fileName}`,
    });

    const content = await this.internalChat(
      [
        { role: 'system', content: SYSTEM_PROMPT_CLASSIFY },
        { role: 'user', content: userContent },
      ],
      { maxTokens: 400 },
    );

    if (!content) return null;

    const parsed = JSON.parse(this.stripJsonFences(content)) as {
      category: EntityCategory;
      name: string;
      description: string;
      tags: string[];
      attributes: Partial<VariantAttributes>;
      confidence: number;
    };

    return {
      suggestedCategory: parsed.category,
      confidence: parsed.confidence ?? 0.8,
      detectedAttributes: parsed.attributes ?? {},
      description: parsed.description,
      suggestedName: parsed.name,
      suggestedTags: parsed.tags ?? [],
    };
  }

  /**
   * Call neko.agent.internalChat cross-extension command.
   * Returns null if neko-agent is unavailable or on any error.
   */
  private async internalChat(
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string | Array<{ type: string; [k: string]: unknown }>;
    }>,
    options?: { maxTokens?: number },
  ): Promise<string | null> {
    return vscode.commands.executeCommand<string | null>(
      'neko.agent.internalChat',
      messages,
      options,
    );
  }

  private stripJsonFences(text: string): string {
    // Remove ```json ... ``` or ``` ... ``` wrappers if present
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  private getMimeType(ext: string): string {
    const map: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
    };
    return map[ext] ?? 'image/png';
  }
}
```

### Step 3: Update extension.ts to use LLMClassifier

In `packages/neko-assets/src/extension.ts`:

1. Add import at the top:
```typescript
import { LLMClassifier } from './services/LLMClassifier';
```

2. Find the line:
```typescript
classifier: new RuleClassifier(),
```
Replace with:
```typescript
classifier: new LLMClassifier(new RuleClassifier()),
```

### Step 4: TypeScript check

```bash
cd packages/neko-assets && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Watch for:
- Import path errors (`@neko/asset` exports — confirm `IAssetClassifier` is exported from `packages/asset/src/index.ts`)
- Type mismatches in `ContentPart` (the internal chat messages need to match what neko-agent expects)

If `IAssetClassifier` is not exported from `@neko/asset`, check:
```bash
grep "IAssetClassifier" packages/neko-assets/packages/asset/src/index.ts
```
And add it if missing.

### Step 5: Verify `IAssetClassifier` is exported from `@neko/asset/index.ts`

```bash
cat packages/neko-assets/packages/asset/src/index.ts
```

If `IAssetClassifier` is not exported, add:
```typescript
export type { IAssetClassifier } from './classifier/IClassifier';
```

### Step 6: TypeScript check again

```bash
cd packages/neko-assets && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors.

### Step 7: Commit

```bash
git add packages/neko-assets/src/services/LLMClassifier.ts \
        packages/neko-assets/src/extension.ts \
        packages/neko-assets/packages/asset/src/index.ts
git commit -m "feat(neko-assets): implement LLMClassifier via neko-agent cross-extension API

- LLMClassifier implements IAssetClassifier using neko.agent.internalChat command
- Image files (.png/.jpg/.webp etc.) sent as base64 for vision analysis
- Other files use text-only filename-based classification
- Gracefully falls back to RuleClassifier on any error (neko-agent not active, no API key, etc.)
- extension.ts wires LLMClassifier(new RuleClassifier()) as the classifier"
```

---

## Task 5: End-to-End Verification

### Step 1: Build both extensions

```bash
pnpm build:neko-agent 2>&1 | tail -5
pnpm build:neko-assets 2>&1 | tail -5
```

Expected: both build without errors.

### Step 2: Run all @neko/asset tests

```bash
cd packages/neko-assets/packages/asset && npx vitest run --reporter=verbose
```

Expected: all tests pass (including the new concurrency test from Task 1).

### Step 3: Manual smoke test (optional, requires VSCode)

1. Open extension dev host: `F5` in VSCode with neko-suite workspace
2. Ensure neko-agent is configured with a vision-capable model (e.g. claude-sonnet-4-6)
3. Right-click an image file in Explorer → "Import to Asset Library"
4. Observe the imported entity's category/name/tags — should reflect actual image content (not just filename)
5. Right-click a non-image media file — should still import correctly (falls back to RuleClassifier)

### Step 4: Final summary commit (if any loose ends)

```bash
git add -p  # review remaining changes
git commit -m "chore(neko-assets): final cleanup for AI classifier + health service improvements"
```

---

## Quick Reference

| Task | Files Changed | Test Command |
|------|---------------|--------------|
| 1 - Concurrency fix | `AssetHealthService.ts`, `AssetHealthService.test.ts` | `cd packages/neko-assets/packages/asset && npx vitest run` |
| 2 - Dir cache | `MediaLibraryTreeProvider.ts` | Manual (VSCode dev host) |
| 3 - internalChat cmd | `neko-agent/extension/src/index.ts` | `npx tsc --noEmit` |
| 4 - LLMClassifier | `LLMClassifier.ts`, `extension.ts` | `npx tsc --noEmit` + manual |
| 5 - Build check | — | `pnpm build:neko-agent && pnpm build:neko-assets` |

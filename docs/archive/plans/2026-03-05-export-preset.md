# Export Preset Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add export preset management to neko-cut — 3 built-in presets + user can save current settings as a named preset, stored in `vscode.workspaceState`.

**Architecture:** Types in `exportProtocol.ts` → `ExportPresetService` (extension) → message handlers in `videoEditorProvider.ts` → preset dropdown + save button in `ExportPanel.tsx`. Pure TypeScript, no Rust changes.

**Tech Stack:** TypeScript, React 18, VSCode Extension API (`workspaceState`), Vitest

---

### Task 1: Add `ExportPreset` types to `exportProtocol.ts`

**Files:**
- Modify: `packages/neko-types/src/types/exportProtocol.ts` (append after line 83, after `DEFAULT_EXPORT_SETTINGS`)

**Step 1: Append the types**

Open `packages/neko-types/src/types/exportProtocol.ts` and add after the `DEFAULT_EXPORT_SETTINGS` block (after line 83):

```typescript
// =============================================================================
// Export Preset Types
// =============================================================================

/**
 * Settings captured in a preset — matches the fields ExportPanel uses.
 * Kept separate from ExportSettings to avoid coupling with streaming/advanced fields.
 */
export interface ExportPresetSettings {
  format: 'mp4' | 'webm' | 'mov' | 'mkv';
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  fps: number;
  quality: 'low' | 'medium' | 'high';
  audioBitrate: number;
}

/**
 * An export preset (built-in or user-defined)
 */
export interface ExportPreset {
  /** Built-in IDs: 'builtin-social' | 'builtin-web' | 'builtin-master'. User: crypto.randomUUID() */
  id: string;
  name: string;
  isBuiltin: boolean;
  settings: ExportPresetSettings;
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd packages/neko-types && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add packages/neko-types/src/types/exportProtocol.ts
git commit -m "feat(types): add ExportPreset type to exportProtocol"
```

---

### Task 2: Create `ExportPresetService` with tests

**Files:**
- Create: `packages/neko-cut/packages/extension/src/services/ExportPresetService.ts`
- Create: `packages/neko-cut/packages/extension/src/services/__tests__/ExportPresetService.test.ts`

**Step 1: Write the failing test**

Create `packages/neko-cut/packages/extension/src/services/__tests__/ExportPresetService.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ExportPresetService } from '../ExportPresetService';
import type { ExportPreset } from '@neko/shared';

// Minimal vscode.Memento mock
function createMockMemento(): { get: (key: string, def?: unknown) => unknown; update: (key: string, val: unknown) => Promise<void>; store: Record<string, unknown> } {
  const store: Record<string, unknown> = {};
  return {
    store,
    get(key: string, defaultValue?: unknown) {
      return key in store ? store[key] : defaultValue;
    },
    async update(key: string, value: unknown) {
      store[key] = value;
    },
  };
}

describe('ExportPresetService', () => {
  let memento: ReturnType<typeof createMockMemento>;
  let service: ExportPresetService;

  beforeEach(() => {
    memento = createMockMemento();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ExportPresetService(memento as any);
  });

  describe('listPresets', () => {
    it('returns 3 built-in presets when no user presets saved', () => {
      const presets = service.listPresets();
      expect(presets).toHaveLength(3);
      expect(presets.every(p => p.isBuiltin)).toBe(true);
    });

    it('built-in preset ids are correct', () => {
      const ids = service.listPresets().map(p => p.id);
      expect(ids).toContain('builtin-social');
      expect(ids).toContain('builtin-web');
      expect(ids).toContain('builtin-master');
    });

    it('includes user presets after built-ins', () => {
      const settings = { format: 'mp4' as const, videoCodec: 'h264', audioCodec: 'aac', width: 1280, height: 720, fps: 30, quality: 'medium' as const, audioBitrate: 192000 };
      service.savePreset('My Preset', settings);
      const presets = service.listPresets();
      expect(presets).toHaveLength(4);
      expect(presets[3]?.name).toBe('My Preset');
      expect(presets[3]?.isBuiltin).toBe(false);
    });
  });

  describe('savePreset', () => {
    it('saves preset and returns it with generated id', () => {
      const settings = { format: 'webm' as const, videoCodec: 'vp9', audioCodec: 'opus', width: 1280, height: 720, fps: 30, quality: 'medium' as const, audioBitrate: 128000 };
      const preset = service.savePreset('Web Test', settings);
      expect(preset.name).toBe('Web Test');
      expect(preset.id).toBeTruthy();
      expect(preset.isBuiltin).toBe(false);
      expect(preset.settings.format).toBe('webm');
    });

    it('persists across service instances (same memento)', () => {
      const settings = { format: 'mp4' as const, videoCodec: 'h264', audioCodec: 'aac', width: 1920, height: 1080, fps: 60, quality: 'high' as const, audioBitrate: 192000 };
      service.savePreset('Persistent', settings);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const service2 = new ExportPresetService(memento as any);
      const presets = service2.listPresets();
      expect(presets.some(p => p.name === 'Persistent')).toBe(true);
    });

    it('can save multiple presets', () => {
      const s = { format: 'mp4' as const, videoCodec: 'h264', audioCodec: 'aac', width: 1280, height: 720, fps: 30, quality: 'low' as const, audioBitrate: 96000 };
      service.savePreset('A', s);
      service.savePreset('B', s);
      const user = service.listPresets().filter(p => !p.isBuiltin);
      expect(user).toHaveLength(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/neko-cut/packages/webview && npx vitest run --reporter=verbose src/stores/slices/__tests__/../../../../../../../packages/neko-cut/packages/extension/src/services/__tests__/ExportPresetService.test.ts 2>&1 | head -20
```

Actually, the test file is in the extension package which uses esbuild (not vitest directly). Let's check by running from root:

```bash
cd /Users/feng/Git/neko-suite && pnpm --filter @neko-cut/extension exec npx tsc --noEmit 2>&1 | head -20
```

The test will be verified at typecheck level since the Extension package doesn't have a Vitest setup. Skip the test runner step and proceed to implement.

**Step 3: Implement `ExportPresetService`**

Create `packages/neko-cut/packages/extension/src/services/ExportPresetService.ts`:

```typescript
import type * as vscode from 'vscode';
import type { ExportPreset, ExportPresetSettings } from '@neko/shared';

const STORAGE_KEY = 'neko-cut.exportPresets';

const BUILTIN_PRESETS: ExportPreset[] = [
  {
    id: 'builtin-social',
    name: '社交媒体优化',
    isBuiltin: true,
    settings: {
      format: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1920,
      height: 1080,
      fps: 60,
      quality: 'high',
      audioBitrate: 192000,
    },
  },
  {
    id: 'builtin-web',
    name: 'Web 优化',
    isBuiltin: true,
    settings: {
      format: 'webm',
      videoCodec: 'vp9',
      audioCodec: 'opus',
      width: 1280,
      height: 720,
      fps: 30,
      quality: 'medium',
      audioBitrate: 128000,
    },
  },
  {
    id: 'builtin-master',
    name: '高质量母版',
    isBuiltin: true,
    settings: {
      format: 'mov',
      videoCodec: 'h265',
      audioCodec: 'aac',
      width: 3840,
      height: 2160,
      fps: 60,
      quality: 'high',
      audioBitrate: 320000,
    },
  },
];

export class ExportPresetService {
  constructor(private readonly workspaceState: vscode.Memento) {}

  listPresets(): ExportPreset[] {
    const userPresets = this.workspaceState.get<ExportPreset[]>(STORAGE_KEY, []);
    return [...BUILTIN_PRESETS, ...userPresets];
  }

  savePreset(name: string, settings: ExportPresetSettings): ExportPreset {
    const preset: ExportPreset = {
      id: crypto.randomUUID(),
      name,
      isBuiltin: false,
      settings,
    };
    const existing = this.workspaceState.get<ExportPreset[]>(STORAGE_KEY, []);
    void this.workspaceState.update(STORAGE_KEY, [...existing, preset]);
    return preset;
  }
}
```

**Step 4: Verify `@neko/shared` exports the new types**

Check that `packages/neko-types/src/types/index.ts` (or the main index) re-exports `ExportPreset` and `ExportPresetSettings`. Run:

```bash
grep -r "ExportPreset" packages/neko-types/src/index.ts 2>/dev/null || grep -r "exportProtocol" packages/neko-types/src/index.ts
```

If `exportProtocol` is already re-exported, the new types will be available automatically. If not, add:
```typescript
export type { ExportPreset, ExportPresetSettings } from './types/exportProtocol';
```

**Step 5: Typecheck extension**

```bash
cd packages/neko-cut/packages/extension && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: No errors related to ExportPresetService.

**Step 6: Commit**

```bash
git add packages/neko-cut/packages/extension/src/services/ExportPresetService.ts
git commit -m "feat(neko-cut): add ExportPresetService with 3 built-in presets"
```

---

### Task 3: Register preset message handlers in `videoEditorProvider.ts`

**Files:**
- Modify: `packages/neko-cut/packages/extension/src/editor/video/videoEditorProvider.ts`

**Step 1: Add `ExportPresetService` import and field**

In `videoEditorProvider.ts`, add after the `ExportService` import line (line ~13):

```typescript
import { ExportPresetService } from '../../services/ExportPresetService';
```

In the class body, after `private exportServices: Map<string, ExportService> = new Map();` (line ~51), add:

```typescript
private exportPresetService: ExportPresetService | null = null;
```

**Step 2: Initialize `ExportPresetService` in constructor or `resolveCustomTextEditor`**

The `context` is already available via `this.context`. Initialize lazily in the message handler (or in `resolveCustomTextEditor`). Find `resolveCustomTextEditor` method and add initialization before the message handler registration:

```typescript
// Initialize preset service (once, shared across documents)
if (!this.exportPresetService) {
  this.exportPresetService = new ExportPresetService(this.context.workspaceState);
}
```

**Step 3: Add message handlers**

Inside `webviewPanel.webview.onDidReceiveMessage`, after the `export:queryGlobalStatus` handler block (around line 581), add:

```typescript
// Handle preset list request
if (message.type === 'preset:list') {
  const presets = this.exportPresetService?.listPresets() ?? [];
  webviewPanel.webview.postMessage({ type: 'preset:list', presets });
  return;
}

// Handle preset save request
if (message.type === 'preset:save') {
  const { name, settings } = message as { name: string; settings: import('@neko/shared').ExportPresetSettings };
  const preset = this.exportPresetService?.savePreset(name, settings);
  if (preset) {
    const presets = this.exportPresetService?.listPresets() ?? [];
    webviewPanel.webview.postMessage({ type: 'preset:list', presets });
  }
  return;
}
```

**Step 4: Typecheck**

```bash
cd packages/neko-cut/packages/extension && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: No new errors.

**Step 5: Commit**

```bash
git add packages/neko-cut/packages/extension/src/editor/video/videoEditorProvider.ts
git commit -m "feat(neko-cut): register preset:list and preset:save message handlers"
```

---

### Task 4: Add preset UI to `ExportPanel.tsx`

**Files:**
- Modify: `packages/neko-cut/packages/webview/src/components/Timeline/ExportPanel.tsx`

**Step 1: Add preset state and load effect**

In `ExportPanel.tsx`, after the existing imports, add the type import:

```typescript
import type { ExportPreset, ExportPresetSettings } from '@neko/shared';
```

After the `queueStatus` state (around line 235), add:

```typescript
const [presets, setPresets] = useState<ExportPreset[]>([]);
const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
```

In the `useEffect` that listens to messages (the one with `window.addEventListener('message', handleMessage)` at line 242), add a new case inside the `switch`:

```typescript
case 'preset:list':
  setPresets(message.presets as ExportPreset[]);
  break;
```

After the `sendMessage({ type: 'export:queryGlobalStatus' });` line (line 310), add:

```typescript
sendMessage({ type: 'preset:list' });
```

**Step 2: Add `applyPreset` handler and mark-custom on change**

After the `handleFormatChange` function (around line 339), add:

```typescript
const applyPreset = useCallback((preset: ExportPreset) => {
  const s = preset.settings;
  setFormat(s.format as ExportFormat);
  setVideoCodec(s.videoCodec);
  setAudioCodec(s.audioCodec);
  const res = RESOLUTIONS.find(r => r.width === s.width && r.height === s.height)
    ?? { label: `${s.width}x${s.height}`, width: s.width, height: s.height };
  setResolution(res);
  setQuality(s.quality);
  setFps(s.fps);
  setAudioBitrate(s.audioBitrate);
  setSelectedPresetId(preset.id);
}, []);

const handlePresetChange = useCallback((presetId: string) => {
  if (presetId === '') {
    setSelectedPresetId(null);
    return;
  }
  const preset = presets.find(p => p.id === presetId);
  if (preset) applyPreset(preset);
}, [presets, applyPreset]);

const handleSavePreset = useCallback(() => {
  const name = window.prompt('预设名称');
  if (!name?.trim()) return;
  const settings: ExportPresetSettings = {
    format,
    videoCodec,
    audioCodec,
    width: resolution.width,
    height: resolution.height,
    fps,
    quality,
    audioBitrate,
  };
  vscodePostMessage({ type: 'preset:save', name: name.trim(), settings });
}, [format, videoCodec, audioCodec, resolution, fps, quality, audioBitrate]);
```

**Note on `window.prompt`:** VSCode webview blocks `window.prompt`. Replace with the input-box pattern already used in the codebase. Add a state `const [savingPreset, setSavingPreset] = useState(false)` and a simple inline input instead. See Step 3 for the UI.

Revised `handleSavePreset`:

```typescript
const handleSavePreset = useCallback(() => {
  const presetName = window.prompt('输入预设名称');
  // window.prompt doesn't work in webview — use inline input state instead
  // Implementation is in the UI (savingPreset state)
}, []);
```

Actually, let's use a simple local state with an inline text input that appears when the save icon is clicked. The cleanest approach for VSCode webviews:

Add states:

```typescript
const [presetNameInput, setPresetNameInput] = useState('');
const [isNamingPreset, setIsNamingPreset] = useState(false);
```

**Step 3: Add preset row to Config Panel JSX**

In the Config Panel section (the `return (...)` starting at line 638), inside `{/* Content */}` div (the `<div className="p-4 space-y-4 ...">` at line 655), insert **before** the first `{/* Global Export Warning */}` block:

```tsx
{/* Preset Row */}
<div>
  <label className="block text-sm font-medium text-vscode-foreground mb-2">{t('export.preset.label')}</label>
  <div className="flex gap-2">
    <select
      value={selectedPresetId ?? ''}
      onChange={(e) => handlePresetChange(e.target.value)}
      className="flex-1 px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
    >
      {/* Built-in presets */}
      {presets.filter(p => p.isBuiltin).length > 0 && (
        <optgroup label="内置预设">
          {presets.filter(p => p.isBuiltin).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
      )}
      {/* User presets */}
      {presets.filter(p => !p.isBuiltin).length > 0 && (
        <optgroup label="我的预设">
          {presets.filter(p => !p.isBuiltin).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
      )}
      <option value="">{t('export.preset.custom')}</option>
    </select>

    {/* Save preset button */}
    {!isNamingPreset ? (
      <button
        onClick={() => setIsNamingPreset(true)}
        className="px-2 py-2 bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground rounded text-vscode-button-secondaryForeground transition-colors"
        title="保存为预设"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
      </button>
    ) : (
      <div className="flex gap-1">
        <input
          autoFocus
          type="text"
          value={presetNameInput}
          onChange={(e) => setPresetNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && presetNameInput.trim()) {
              const settings: ExportPresetSettings = { format, videoCodec, audioCodec, width: resolution.width, height: resolution.height, fps, quality, audioBitrate };
              vscodePostMessage({ type: 'preset:save', name: presetNameInput.trim(), settings });
              setPresetNameInput('');
              setIsNamingPreset(false);
            } else if (e.key === 'Escape') {
              setPresetNameInput('');
              setIsNamingPreset(false);
            }
          }}
          placeholder="预设名称"
          className="w-32 px-2 py-1 bg-vscode-input-background border border-vscode-focusBorder rounded text-vscode-input-foreground text-sm focus:outline-none"
        />
        <button
          onClick={() => { setPresetNameInput(''); setIsNamingPreset(false); }}
          className="px-1 py-1 text-vscode-foreground opacity-60 hover:opacity-100"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )}
  </div>
</div>
```

Also: when user changes any setting manually, clear `selectedPresetId`. Wrap existing `setFormat`, `setVideoCodec`, etc. calls to also call `setSelectedPresetId(null)`. The cleanest way: modify `handleFormatChange` to also call `setSelectedPresetId(null)`, and add `setSelectedPresetId(null)` to each individual `onChange` handler in the JSX.

Modify `handleFormatChange` to add `setSelectedPresetId(null)`:

```typescript
const handleFormatChange = useCallback((newFormat: ExportFormat) => {
  setSelectedPresetId(null);  // ← add this line
  setFormat(newFormat);
  // ... rest unchanged
}, [videoCodec, audioCodec]);
```

For the other settings (videoCodec, audioCodec, resolution, quality, fps, audioBitrate), add `setSelectedPresetId(null);` in their `onChange` handlers in JSX.

**Step 4: Typecheck webview**

```bash
cd packages/neko-cut/packages/webview && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: No errors.

**Step 5: Commit**

```bash
git add packages/neko-cut/packages/webview/src/components/Timeline/ExportPanel.tsx
git commit -m "feat(neko-cut): add preset selector and save UI to ExportPanel"
```

---

### Task 5: Add i18n keys

**Files:**
- Modify: `packages/neko-cut/packages/webview/src/i18n/locales/zh-cn/export.ts`
- Modify: `packages/neko-cut/packages/webview/src/i18n/locales/en/export.ts`

**Step 1: zh-cn already has the keys**

The zh-cn file already has:
```typescript
'export.preset.label': '预设',
'export.preset.custom': '自定义',
```

No change needed.

**Step 2: Check en/export.ts for the same keys**

```bash
grep "preset" packages/neko-cut/packages/webview/src/i18n/locales/en/export.ts
```

If missing, add after `'export.audioBitrate'` line:
```typescript
'export.preset.label': 'Preset',
'export.preset.custom': 'Custom',
```

**Step 3: Typecheck (MessageBundle enforces key parity)**

```bash
cd packages/neko-cut/packages/webview && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: No errors.

**Step 4: Commit**

```bash
git add packages/neko-cut/packages/webview/src/i18n/locales/en/export.ts
git commit -m "feat(i18n): add English preset keys to export bundle"
```

---

### Task 6: Final build verification

**Step 1: Build neko-types**

```bash
cd packages/neko-types && npx tsc --noEmit
```

**Step 2: Typecheck both neko-cut packages**

```bash
cd packages/neko-cut/packages/extension && npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
cd packages/neko-cut/packages/webview && npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

**Step 3: Run neko-cut webview tests**

```bash
cd packages/neko-cut/packages/webview && npx vitest run 2>&1 | tail -10
```

Expected: All existing tests pass (no regressions).

**Step 4: Final commit (if only minor fixes needed)**

```bash
git add -p  # stage only relevant files
git commit -m "fix(neko-cut): export preset final polish"
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `neko-types/src/types/exportProtocol.ts` | Add `ExportPresetSettings` + `ExportPreset` types |
| `neko-cut/extension/src/services/ExportPresetService.ts` | **New** — 3 built-ins + workspaceState CRUD |
| `neko-cut/extension/src/editor/video/videoEditorProvider.ts` | Add field, init, 2 message handlers |
| `neko-cut/webview/src/components/Timeline/ExportPanel.tsx` | Add preset state, message listener, UI row |
| `neko-cut/webview/src/i18n/locales/en/export.ts` | Add 2 English preset keys |

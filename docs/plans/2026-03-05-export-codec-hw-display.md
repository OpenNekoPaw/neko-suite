# Export Codec Format Expansion + Hardware Acceleration Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose AVI/MPEG-TS container formats in the Export UI and show real-time hardware acceleration availability per video codec via a `nodes:hw_capabilities` API.

**Architecture:** Add `hw_capabilities` to the existing `nodes` group in the Rust `NodeController` (calls the already-existing `detect_hw_encoders()` free function). The Extension Host proxies the query from Webview via postMessage. The ExportPanel displays a per-codec HW badge below the video codec selector.

**Design doc:** `docs/plans/2026-03-05-export-codec-hw-display-design.md`

**Tech Stack:** Rust (neko-native-core, neko-native-api, neko-types), TypeScript (VSCode extension host), React 18 (webview)

---

## Task 1: Expose `hw_capabilities` in Rust registry

**Files:**
- Modify: `packages/neko-engine/packages/types/src/registry.rs:29`

**Step 1: Add action to NODES slice**

In `registry.rs`, change:
```rust
pub const NODES: &[&str] = &["health", "metric", "gpu"];
```
to:
```rust
pub const NODES: &[&str] = &["health", "metric", "gpu", "hw_capabilities"];
```

**Step 2: Verify compile**

```bash
cd packages/neko-engine && cargo check --package neko-types 2>&1 | tail -5
```
Expected: `Finished` with no errors.

**Step 3: Commit**

```bash
git add packages/neko-engine/packages/types/src/registry.rs
git commit -m "feat(engine): add hw_capabilities to nodes action registry"
```

---

## Task 2: Implement `nodes:hw_capabilities` handler in NodeController

**Files:**
- Modify: `packages/neko-engine/packages/native-api/src/controllers/node.rs`

**Step 1: Write the failing test first**

At the bottom of `node.rs`, inside `#[cfg(test)] mod tests`, add:

```rust
#[tokio::test]
async fn test_node_controller_hw_capabilities() {
    let node_service = Arc::new(NodeService::new(None));
    let controller = NodeController::new(node_service);

    let response = controller
        .handle("hw_capabilities", None, Value::Null, None)
        .await
        .unwrap();

    assert!(response.is_ok());
    // Response data must contain all 5 codec keys
    let data = response.data.as_object().unwrap();
    assert!(data.contains_key("h264"));
    assert!(data.contains_key("h265"));
    assert!(data.contains_key("av1"));
    assert!(data.contains_key("vp9"));
    assert!(data.contains_key("prores"));
    // VP9 is always null (no hardware encoder exists)
    assert!(data["vp9"].is_null());
}
```

**Step 2: Run test to verify it fails**

```bash
cd packages/neko-engine && cargo test --package neko-native-api test_node_controller_hw_capabilities 2>&1 | tail -10
```
Expected: FAIL — falls through to `UnknownAction` error arm.

**Step 3: Add imports at the top of `node.rs`**

After the existing `use` block (around line 9), add:
```rust
use neko_native_core::encoder::codec_ext::HwEncoderTypeExt;
use neko_native_core::encoder::hwaccel::detect_hw_encoders;
use neko_types::{HwEncoderType, VideoCodec};
```

**Step 4: Add the match arm in `handle()`**

Inside `impl Controller for NodeController`, in the `match action` block, before the `_ =>` fallthrough, add:

```rust
"hw_capabilities" => {
    let available = detect_hw_encoders();
    let best = available.into_iter().next().unwrap_or(HwEncoderType::None);

    let codecs = serde_json::json!({
        "h264":   best.encoder_name(VideoCodec::H264),
        "h265":   best.encoder_name(VideoCodec::H265),
        "av1":    best.encoder_name(VideoCodec::Av1),
        "vp9":    best.encoder_name(VideoCodec::Vp9),
        "prores": best.encoder_name(VideoCodec::ProRes),
    });
    Ok(ActionResponse::ok("", codecs))
}
```

**Step 5: Run test to verify it passes**

```bash
cd packages/neko-engine && cargo test --package neko-native-api test_node_controller_hw_capabilities 2>&1 | tail -5
```
Expected: `test ... ok`

**Step 6: Run all node controller tests**

```bash
cd packages/neko-engine && cargo test --package neko-native-api 2>&1 | tail -10
```
Expected: all pass.

**Step 7: Commit**

```bash
git add packages/neko-engine/packages/native-api/src/controllers/node.rs
git commit -m "feat(engine): implement nodes:hw_capabilities action"
```

---

## Task 3: Add `queryHwCapabilities()` to ExportService + expand format types

**Files:**
- Modify: `packages/neko-cut/packages/extension/src/services/ExportService.ts`

**Step 1: Expand `ExportConfig.format` type** (line ~33)

Change:
```typescript
format: 'mp4' | 'webm' | 'mov' | 'mkv';
```
to:
```typescript
format: 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' | 'ts';
```

**Step 2: Expand `FORMAT_TO_VIDEO_CODEC`** (around line 100)

```typescript
const FORMAT_TO_VIDEO_CODEC: Record<string, string> = {
    mp4: 'h264',
    mov: 'h264',
    webm: 'vp9',
    mkv: 'h264',
    avi: 'h264',
    ts: 'h264',
};
```

**Step 3: Expand `FORMAT_TO_AUDIO_CODEC`** (around line 108)

```typescript
const FORMAT_TO_AUDIO_CODEC: Record<string, string> = {
    mp4: 'aac',
    mov: 'aac',
    webm: 'opus',
    mkv: 'aac',
    avi: 'mp3',
    ts: 'aac',
};
```

**Step 4: Add `queryHwCapabilities()` method**

In the `Public API` section, after `getQueueStatus()`:
```typescript
/**
 * Query hardware encoder availability for each video codec.
 * Returns a map of codec name → hw encoder name (or null if software-only).
 * Example: { h264: "h264_videotoolbox", vp9: null }
 */
async queryHwCapabilities(): Promise<Record<string, string | null>> {
    try {
        const response = await this.dispatch({
            group: 'nodes',
            action: 'hw_capabilities',
        });
        return (response.data as Record<string, string | null>) ?? {};
    } catch {
        return {};
    }
}
```

**Step 5: Type-check extension**

```bash
cd packages/neko-cut/packages/extension && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: no errors related to the changed files (pre-existing errors in neko-assets are acceptable).

**Step 6: Commit**

```bash
git add packages/neko-cut/packages/extension/src/services/ExportService.ts
git commit -m "feat(neko-cut): add queryHwCapabilities + expand format types to avi/ts"
```

---

## Task 4: Handle `export:queryHwCapabilities` message in `videoEditorProvider.ts`

**Files:**
- Modify: `packages/neko-cut/packages/extension/src/editor/video/videoEditorProvider.ts`

**Step 1: Locate the insertion point**

Find the block that handles `export:queryGlobalStatus` (around line 568). Add the new handler immediately after the `export:cancel` block (around line 565) and before the `export:queryGlobalStatus` block.

**Step 2: Add the message handler**

```typescript
// Handle hardware capabilities query
if (message.type === 'export:queryHwCapabilities') {
    const exportService = this.exportServices.get(docUri);
    if (exportService) {
        const codecs = await exportService.queryHwCapabilities();
        webviewPanel.webview.postMessage({
            type: 'export:hwCapabilities',
            codecs,
        });
    }
    return;
}
```

**Step 3: Type-check**

```bash
cd packages/neko-cut/packages/extension && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: no new errors.

**Step 4: Commit**

```bash
git add packages/neko-cut/packages/extension/src/editor/video/videoEditorProvider.ts
git commit -m "feat(neko-cut): proxy export:queryHwCapabilities message to ExportService"
```

---

## Task 5: Expand ExportPanel with AVI/TS formats and HW badge

**Files:**
- Modify: `packages/neko-cut/packages/webview/src/components/Timeline/ExportPanel.tsx`

**Step 1: Add `hwCapabilities` state** (after the existing state declarations, around line 221)

```typescript
const [hwCapabilities, setHwCapabilities] = useState<Record<string, string | null> | null>(null);
```

**Step 2: Handle `export:hwCapabilities` message**

In the `switch (message.type)` block inside the `useEffect` message handler (around line 246), add:

```typescript
case 'export:hwCapabilities':
    setHwCapabilities(message.codecs as Record<string, string | null>);
    break;
```

**Step 3: Send query on mount**

In the same `useEffect`, after the existing `sendMessage({ type: 'export:queryGlobalStatus' })` call (around line 310), add:

```typescript
sendMessage({ type: 'export:queryHwCapabilities' });
```

**Step 4: Add `ExportFormat` type to include AVI and TS**

Change (around line 13):
```typescript
type ExportFormat = 'mp4' | 'webm' | 'mov' | 'mkv';
```
to:
```typescript
type ExportFormat = 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' | 'ts';
```

**Step 5: Expand `FORMAT_OPTIONS`** (around line 173)

```typescript
const FORMAT_OPTIONS: Array<{ label: string; value: ExportFormat }> = [
    { label: 'MP4', value: 'mp4' },
    { label: 'WebM', value: 'webm' },
    { label: 'MOV', value: 'mov' },
    { label: 'MKV', value: 'mkv' },
    { label: 'AVI', value: 'avi' },
    { label: 'MPEG-TS', value: 'ts' },
];
```

**Step 6: Expand `CONTAINER_VIDEO_CODECS`** (around line 198)

```typescript
const CONTAINER_VIDEO_CODECS: Record<string, string[]> = {
    mp4: ['h264', 'h265', 'av1', 'prores'],
    mov: ['h264', 'h265', 'av1', 'prores'],
    webm: ['vp9', 'av1'],
    mkv: ['h264', 'h265', 'vp9', 'av1', 'prores'],
    avi: ['h264', 'h265'],
    ts: ['h264', 'h265'],
};
```

**Step 7: Expand `CONTAINER_AUDIO_CODECS`** (around line 206)

```typescript
const CONTAINER_AUDIO_CODECS: Record<string, string[]> = {
    mp4: ['aac', 'mp3', 'flac'],
    mov: ['aac', 'mp3', 'flac', 'pcm'],
    webm: ['opus', 'vorbis'],
    mkv: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm'],
    avi: ['mp3', 'aac'],
    ts: ['aac', 'mp3'],
};
```

**Step 8: Expand `DEFAULT_CODECS`** (around line 214)

```typescript
const DEFAULT_CODECS: Record<string, { video: string; audio: string }> = {
    mp4: { video: 'h264', audio: 'aac' },
    mov: { video: 'h264', audio: 'aac' },
    webm: { video: 'vp9', audio: 'opus' },
    mkv: { video: 'h264', audio: 'aac' },
    avi: { video: 'h264', audio: 'mp3' },
    ts: { video: 'h264', audio: 'aac' },
};
```

**Step 9: Add `HwBadge` helper component**

Before the `ExportPanel` function declaration, add:

```tsx
/** Shows hardware encoder name (green) or "软件编码" (muted) */
function HwBadge({ encoder }: { encoder: string | null | undefined }) {
    if (encoder == null) {
        return (
            <span className="text-xs text-vscode-descriptionForeground opacity-60">
                💻 软件编码
            </span>
        );
    }
    return (
        <span
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{
                backgroundColor: 'color-mix(in srgb, var(--vscode-charts-green) 15%, transparent)',
                color: 'var(--vscode-charts-green)',
            }}
        >
            ⚡ {encoder}
        </span>
    );
}
```

**Step 10: Add HW badge below video codec selector**

Find the "Video Codec" section (around line 685). After the closing `</div>` of the `<select>`, add:

```tsx
{/* Hardware acceleration badge */}
<div className="mt-1 h-5 flex items-center">
    {hwCapabilities === null
        ? (
            <span className="text-xs text-vscode-descriptionForeground opacity-40">
                检测硬件加速...
            </span>
        )
        : <HwBadge encoder={hwCapabilities[videoCodec]} />
    }
</div>
```

**Step 11: Type-check webview**

```bash
cd packages/neko-cut/packages/webview && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

**Step 12: Commit**

```bash
git add packages/neko-cut/packages/webview/src/components/Timeline/ExportPanel.tsx
git commit -m "feat(neko-cut): add AVI/TS formats + hardware acceleration badge to ExportPanel"
```

---

## Task 6: Final verification

**Step 1: Run all Rust tests**

```bash
cd packages/neko-engine && cargo test --package neko-native-api 2>&1 | tail -10
```
Expected: all pass.

**Step 2: Run Rust core tests (codec_ext)**

```bash
cd packages/neko-engine && cargo test --package neko-native-core encoder::codec_ext 2>&1 | tail -5
```
Expected: all pass.

**Step 3: Type-check extension and webview**

```bash
cd packages/neko-cut/packages/extension && npx tsc --noEmit 2>&1 | grep "ExportService\|videoEditorProvider" | head -10
cd packages/neko-cut/packages/webview && npx tsc --noEmit 2>&1 | head -10
```
Expected: no errors in the changed files.

**Step 4: Update ROADMAP.md**

In `ROADMAP.md`, under the neko-engine `更多编码格式支持` section, mark the new items complete:

```markdown
- [ ] 更多编码格式支持
    - [x] ProRes 硬件加速（macOS VideoToolbox → `prores_videotoolbox`）
    - [x] AVI / MPEG-TS 容器格式暴露（ExportPanel + ExportService）
    - [x] 硬件加速动态显示（nodes:hw_capabilities API + ExportPanel badge）
```

**Step 5: Final commit**

```bash
git add ROADMAP.md
git commit -m "docs: update roadmap — codec format expansion + hw badge complete"
```

---

## Summary of All Changed Files

| File | Change |
|------|--------|
| `neko-engine/packages/types/src/registry.rs` | +1 line: `hw_capabilities` in NODES actions |
| `native-api/src/controllers/node.rs` | +1 match arm + 3 imports + 1 test |
| `neko-cut/extension/src/services/ExportService.ts` | format type, 2 codec maps, 1 new method |
| `neko-cut/extension/.../videoEditorProvider.ts` | +1 message handler block |
| `neko-cut/webview/.../ExportPanel.tsx` | state, message case, query, format maps, HwBadge component, badge render |

**No new files created. 5 files modified.**

# Export Codec Format Expansion + Hardware Acceleration Display

**Date**: 2026-03-05
**Status**: Implemented

## Problem

The Export Panel supports 4 container formats (mp4/webm/mov/mkv) but the Rust engine already
supports 6 (adding avi/ts). Users cannot tell which video codec will use hardware acceleration
on their current machine.

## Goals

1. Expose AVI and MPEG-TS container formats in the Export UI
2. Show per-codec hardware acceleration status (dynamic, queried from engine at panel open)

## Non-Goals

- Audio codec hardware acceleration (all audio encoding is software)
- Hardware encoder selection (remains `auto`)
- Codec-level quality controls beyond existing preset/bitrate

---

## Architecture

### Feature A — `nodes:hw_capabilities` API

```
ExportPanel mounts
  → postMessage { type: 'export:queryHwCapabilities' }
  → videoEditorProvider.ts
  → exportService.queryHwCapabilities()
  → EngineClient.dispatch('nodes', 'hw_capabilities')
  → NodeController  [node.rs]
      detect_hw_encoders()           // already exists in hwaccel.rs
      best = available.first()
      for each VideoCodec → best.encoder_name(codec)
  → JSON response
  → postMessage { type: 'export:hwCapabilities', codecs: {...} }
  → ExportPanel stores in state, renders badge per codec option
```

**Response schema** (keyed by serde lowercase codec name):

```json
{
  "h264":   "h264_videotoolbox",
  "h265":   "hevc_videotoolbox",
  "av1":    null,
  "vp9":    null,
  "prores": "prores_videotoolbox"
}
```

`null` = software-only encoding.

### Feature B — Format Expansion (AVI / MPEG-TS)

Pure TypeScript changes. Rust backend already supports both via `codec_ext.rs`.

Codec compatibility mirrors the Rust `ContainerFormatExt::supports_codec()` implementation:

| Container | Video Codecs       | Audio Codecs | Default video | Default audio |
|-----------|--------------------|--------------|---------------|---------------|
| avi       | h264, h265         | mp3, aac     | h264          | mp3           |
| ts        | h264, h265         | aac, mp3     | h264          | aac           |

---

## Detailed Changes

### 1. `neko-engine/packages/types/src/registry.rs`

Add `hw_capabilities` to `actions::NODES`:

```rust
pub const NODES: &[&str] = &["health", "metric", "gpu", "hw_capabilities"];
```

### 2. `native-api/src/controllers/node.rs`

Add match arm (no service needed — calls free function directly):

```rust
"hw_capabilities" => {
    use neko_native_core::encoder::hwaccel::{detect_hw_encoders, HwEncoderTypeExt};
    use neko_native_core::encoder::codec_ext::HwEncoderTypeExt as _;
    use neko_types::{HwEncoderType, VideoCodec};

    let available = detect_hw_encoders();
    let best = available.into_iter().next().unwrap_or(HwEncoderType::None);

    let codecs = serde_json::json!({
        "h264":   best.encoder_name(VideoCodec::H264),
        "h265":   best.encoder_name(VideoCodec::H265),
        "av1":    best.encoder_name(VideoCodec::Av1),
        "vp9":    best.encoder_name(VideoCodec::Vp9),   // always null
        "prores": best.encoder_name(VideoCodec::ProRes),
    });
    Ok(ActionResponse::ok("", codecs))
}
```

### 3. `neko-cut/extension/src/services/ExportService.ts`

**Type change:**
```typescript
format: 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' | 'ts';
```

**New codec maps:**
```typescript
const FORMAT_TO_VIDEO_CODEC: Record<string, string> = {
    mp4: 'h264', mov: 'h264', webm: 'vp9', mkv: 'h264',
    avi: 'h264', ts: 'h264',
};

const FORMAT_TO_AUDIO_CODEC: Record<string, string> = {
    mp4: 'aac', mov: 'aac', webm: 'opus', mkv: 'aac',
    avi: 'mp3', ts: 'aac',
};
```

**New method:**
```typescript
async queryHwCapabilities(): Promise<Record<string, string | null>> {
    const response = await this.dispatch({ group: 'nodes', action: 'hw_capabilities' });
    return (response.data as Record<string, string | null>) ?? {};
}
```

### 4. `videoEditorProvider.ts`

```typescript
case 'export:queryHwCapabilities': {
    const codecs = await this._exportService.queryHwCapabilities();
    this._panel.webview.postMessage({ type: 'export:hwCapabilities', codecs });
    break;
}
```

### 5. `ExportPanel.tsx`

**New state:**
```typescript
const [hwCapabilities, setHwCapabilities] = useState<Record<string, string | null> | null>(null);
```

**Message handler addition:**
```typescript
case 'export:hwCapabilities':
    setHwCapabilities(message.codecs);
    break;
```

**Query on mount** (inside existing `useEffect` that already calls `sendMessage`):
```typescript
sendMessage({ type: 'export:queryHwCapabilities' });
```

**Format options expansion:**
```typescript
const FORMAT_OPTIONS = [
    { label: 'MP4', value: 'mp4' },
    { label: 'WebM', value: 'webm' },
    { label: 'MOV', value: 'mov' },
    { label: 'MKV', value: 'mkv' },
    { label: 'AVI', value: 'avi' },
    { label: 'MPEG-TS', value: 'ts' },
];
```

**Container codec compatibility expansion:**
```typescript
const CONTAINER_VIDEO_CODECS: Record<string, string[]> = {
    mp4: ['h264', 'h265', 'av1', 'prores'],
    mov: ['h264', 'h265', 'av1', 'prores'],
    webm: ['vp9', 'av1'],
    mkv: ['h264', 'h265', 'vp9', 'av1', 'prores'],
    avi: ['h264', 'h265'],
    ts:  ['h264', 'h265'],
};

const CONTAINER_AUDIO_CODECS: Record<string, string[]> = {
    mp4: ['aac', 'mp3', 'flac'],
    mov: ['aac', 'mp3', 'flac', 'pcm'],
    webm: ['opus', 'vorbis'],
    mkv: ['aac', 'opus', 'mp3', 'flac', 'vorbis', 'pcm'],
    avi: ['mp3', 'aac'],
    ts:  ['aac', 'mp3'],
};

const DEFAULT_CODECS: Record<string, { video: string; audio: string }> = {
    mp4: { video: 'h264', audio: 'aac' },
    mov: { video: 'h264', audio: 'aac' },
    webm: { video: 'vp9', audio: 'opus' },
    mkv: { video: 'h264', audio: 'aac' },
    avi: { video: 'h264', audio: 'mp3' },
    ts:  { video: 'h264', audio: 'aac' },
};
```

**Custom codec selector with HW badge** — replace `<select>` for video codec with a
button-group or styled `<select>` with a sibling badge element:

```tsx
// Helper
function HwBadge({ encoder }: { encoder: string | null | undefined }) {
    if (encoder == null) {
        return <span className="text-xs text-vscode-descriptionForeground">💻 软件</span>;
    }
    return (
        <span className="text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--vscode-charts-green)20', color: 'var(--vscode-charts-green)' }}>
            ⚡ {encoder}
        </span>
    );
}

// Usage: below the video codec <select>, show badge for the currently selected codec
<div className="mt-1">
    {hwCapabilities !== null
        ? <HwBadge encoder={hwCapabilities[videoCodec]} />
        : <span className="text-xs text-vscode-descriptionForeground opacity-50">检测中...</span>
    }
</div>
```

Badge is shown **below** the select (not inside it) to avoid replacing `<select>` with a
custom component — keeps the change minimal.

---

## UI Wireframe

```
视频编码
┌──────────────────────────────────────────┐
│ H.264 (AVC)  ⚡ 硬件              ▼     │  ← each option shows inline tag
│ H.265 (HEVC)  ⚡ 硬件                    │
│ AV1  💻 软件                             │
│ ProRes  ⚡ 硬件                           │
└──────────────────────────────────────────┘
⚡ h264_videotoolbox                         ← selected codec: green badge with encoder name

视频编码 (VP9 selected)
┌──────────────────────────────────────────┐
│ VP9  💻 软件                      ▼     │
└──────────────────────────────────────────┘
💻 软件编码                                  ← muted gray

视频编码 (loading, hwCapabilities === null)
┌──────────────────────────────────────────┐
│ H.264 (AVC)                      ▼     │  ← no tags while detecting
└──────────────────────────────────────────┘
检测硬件加速...                               ← loading state
```

Two layers of HW info:
- **Dropdown options**: inline `⚡ 硬件` / `💻 软件` tag — lets users compare at a glance
- **Below select**: `HwBadge` showing the exact FFmpeg encoder name (e.g. `h264_videotoolbox`) for the selected codec

---

## File Change Summary

| File | Change |
|------|--------|
| `neko-engine/packages/types/src/registry.rs` | Add `hw_capabilities` to `NODES` actions |
| `native-api/src/controllers/node.rs` | Add `hw_capabilities` match arm |
| `neko-cut/extension/src/services/ExportService.ts` | Add `avi`/`ts` to format type + maps + `queryHwCapabilities()` |
| `neko-cut/extension/.../videoEditorProvider.ts` | Handle `export:queryHwCapabilities` message |
| `neko-cut/webview/.../ExportPanel.tsx` | Add `hwCapabilities` state + badge + AVI/TS format options |

Total: 5 files, no new files created.

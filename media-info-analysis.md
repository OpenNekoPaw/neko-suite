# Media Info Extraction Analysis - neko-cut Package

## Summary

The neko-cut package uses a **centralized FFmpeg-based approach** for media info extraction. All duration/metadata queries go through the Extension Host → Rust NativeEngine pipeline. There is **NO direct HTML5 media element usage** for metadata extraction in the main codebase.

---

## 1. Webview Side (packages/webview/src/)

### 1.1 Primary Service: MediaInfoService.ts

**Location**: `packages/webview/src/services/MediaInfoService.ts`

**Architecture**:
```
MediaInfoService → MediaRequestProxy → Extension Host → Rust NativeEngine (FFmpeg)
```

**Key Methods**:
- `getDuration(filePath: string): Promise<number>` (lines 49-52)
- `getMediaInfo(filePath: string): Promise<MediaInfo>` (lines 54-86)
- `preload(filePath: string): void` (lines 88-93)

**Implementation Details**:
```typescript
// Line 113-128: FFmpeg probe via Extension
private async _fetchMediaInfoViaFFmpeg(filePath: string): Promise<MediaInfo> {
  try {
    const probeResult = await getMediaProxy().probeMediaInfo(filePath, {
      timeoutMs: 10000,
    });

    return {
      duration: probeResult.duration > 0 ? probeResult.duration : DEFAULT_VIDEO_DURATION,
      width: probeResult.width || undefined,
      height: probeResult.height || undefined,
    };
  } catch (error) {
    console.warn('[MediaInfoService] FFmpeg probe failed for:', filePath, error);
    return { duration: DEFAULT_VIDEO_DURATION };
  }
}
```

**Features**:
- ✅ Caching (Map-based, lines 46-47)
- ✅ Request deduplication (lines 61-65)
- ✅ Image file detection (no probe needed, lines 67-73)
- ✅ Fallback to default duration on error (line 126)

**Exported API**:
```typescript
// Line 147-149: Convenience function
export async function getMediaDuration(filePath: string): Promise<number> {
  return getMediaInfoService().getDuration(filePath);
}
```

---

### 1.2 IPC Layer: MediaRequestProxy.ts

**Location**: `packages/webview/src/services/MediaRequestProxy.ts`

**Key Method**:
```typescript
// Lines 417-438: Probe media info via IPC
async probeMediaInfo(videoPath: string, options?: MediaRequestOptions): Promise<MediaInfo> {
  const requestId = this.generateRequestId();

  const request: MediaRequest = {
    type: 'media:probeMediaInfo',
    requestId,
    timestamp: Date.now(),
    payload: { videoPath },
  };

  const response = await this.sendRequest<ProbeMediaInfoResponse>(request, options);

  if (response.error) {
    throw new Error(response.error);
  }

  if (!response.payload) {
    throw new Error('No payload in response');
  }

  return response.payload;
}
```

**Features**:
- ✅ Request queuing with priority (lines 240-250)
- ✅ Concurrency control (MAX_CONCURRENT_REQUESTS)
- ✅ Timeout handling (default: MEDIA_REQUEST_TIMEOUT)
- ✅ AbortSignal support (lines 183-184)

---

### 1.3 Usage in Components/Hooks

#### useTimelineDragDrop.ts
**Location**: `packages/webview/src/hooks/useTimelineDragDrop.ts`

**Usage**:
```typescript
// Lines 139-146: Get audio duration
let duration = DEFAULT_VIDEO_DURATION;
try {
  duration = await getMediaInfoService().getDuration(filePath);
} catch (e) {
  console.warn('[useTimelineDragDrop] Failed to get audio duration:', e);
}
addMediaElement(audioTrackId, filePath, displayName, duration, startTime);

// Lines 158-167: Get video duration
let duration = DEFAULT_IMAGE_DURATION;
if (fileType === 'video') {
  try {
    duration = await getMediaInfoService().getDuration(filePath);
  } catch (e) {
    console.warn('[useTimelineDragDrop] Failed to get video duration:', e);
    duration = DEFAULT_VIDEO_DURATION;
  }
  await addMediaElementWithAudio(mediaTrackId, filePath, displayName, duration, startTime);
}
```

#### elementOpsSlice.ts
**Location**: `packages/webview/src/stores/slices/elementOpsSlice.ts`

**Usage**:
```typescript
// Lines 22-30: Detect if video has audio
async function detectVideoHasAudio(src: string): Promise<boolean> {
  try {
    const mediaInfo = await getMediaProxy().probeMediaInfo(src);
    return mediaInfo?.hasAudio ?? false;
  } catch (error) {
    console.warn('[detectVideoHasAudio] Failed to detect audio:', error);
    return false;
  }
}
```

---

### 1.4 HTML5 Media Elements (Limited Usage)

**IMPORTANT**: HTML5 `<video>` and `<audio>` elements are **ONLY used for playback/preview**, NOT for metadata extraction.

#### VideoDiffViewer.tsx
**Location**: `packages/webview/src/components/MediaDiff/VideoDiffViewer.tsx`

**Usage**: Lines 66-73
```typescript
<video
  ref={videoRef}
  src={src}
  className="max-w-full max-h-full object-contain"
  onTimeUpdate={handleTimeUpdate}
  muted={muted}
  playsInline
/>
```
- ✅ Used for **playback only**
- ✅ No `.duration` property access for metadata
- ✅ Time sync via `currentTime` property (lines 48-50)

#### AudioDiffViewer.tsx
**Location**: `packages/webview/src/components/MediaDiff/AudioDiffViewer.tsx`

**Usage**: Lines 394-395
```typescript
<audio ref={currentAudioRef} src={currentSrc} />
<audio ref={previousAudioRef} src={previousSrc} />
```
- ✅ Used for **playback only**
- ✅ Duration comes from `details.duration` prop (lines 585-588), NOT from element
- ✅ Time sync via `currentTime` property (lines 357-362)

**Duration Source**:
```typescript
// Lines 585-588: Duration from external source
const duration = Math.max(
  details?.duration.current ?? 0,
  details?.duration.previous ?? 0
);
```

---

## 2. Extension Side (packages/extension/src/)

### 2.1 MediaService.ts

**Location**: `packages/extension/src/services/MediaService.ts`

**Key Handler**:
```typescript
// Lines 267-284: Handle probe media request
private async handleProbeMedia(
  request: ProbeMediaInfoRequest
): Promise<MediaResponse> {
  const { videoPath } = request.payload;
  const absolutePath = this.resolveMediaPath(videoPath);

  const result = await this.dispatch({
    group: 'videos',
    action: 'probe',
    id: absolutePath,
  });

  return {
    requestId: request.requestId,
    type: 'media:response:probeMediaInfo' as never,
    payload: result.data as never,
  };
}
```

**Flow**:
```
Webview IPC → handleMessage() → handleStandardMedia() → handleProbeMedia() →
dispatch({ group: 'videos', action: 'probe' }) → Rust NativeEngine
```

**Path Resolution** (lines 723-737):
```typescript
private resolveMediaPath(mediaPath: string): string {
  if (path.isAbsolute(mediaPath)) return mediaPath;

  if (this.documentDir) {
    return path.resolve(this.documentDir, mediaPath);
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    return path.join(workspaceRoot, mediaPath);
  }

  return mediaPath;
}
```

---

### 2.2 AssetService.ts

**Location**: `packages/extension/src/services/AssetService.ts`

**Note**: AssetService does NOT directly probe media files. It delegates to the asset library's classification system, which may internally use FFmpeg, but this is separate from the timeline media info flow.

---

## 3. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Webview (React)                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  useTimelineDragDrop / elementOpsSlice                         │
│           ↓                                                     │
│  getMediaInfoService().getDuration(filePath)                   │
│           ↓                                                     │
│  MediaInfoService._fetchMediaInfoViaFFmpeg()                   │
│           ↓                                                     │
│  getMediaProxy().probeMediaInfo(filePath)                      │
│           ↓                                                     │
│  MediaRequestProxy.probeMediaInfo()                            │
│           ↓                                                     │
│  postMessage({ type: 'media:probeMediaInfo', ... })           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓ IPC
┌─────────────────────────────────────────────────────────────────┐
│ Extension Host (Node.js)                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MediaService.handleMessage()                                  │
│           ↓                                                     │
│  MediaService.handleStandardMedia()                            │
│           ↓                                                     │
│  MediaService.handleProbeMedia()                               │
│           ↓                                                     │
│  dispatch({ group: 'videos', action: 'probe', id: path })     │
│           ↓                                                     │
│  FrameServerService.dispatch(actionJson)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                          ↓ Native Call
┌─────────────────────────────────────────────────────────────────┐
│ Rust NativeEngine                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  videos:probe action                                           │
│           ↓                                                     │
│  FFmpeg probe (ffprobe or libavformat)                         │
│           ↓                                                     │
│  Return { duration, width, height, hasAudio, bitrate, ... }   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Key Findings

### ✅ Strengths

1. **Centralized Architecture**: All media info goes through one service (MediaInfoService)
2. **Reliable Metadata**: Uses FFmpeg instead of HTML5 (avoids codec limitations)
3. **Caching**: Prevents redundant probes for the same file
4. **Request Deduplication**: Multiple concurrent requests for same file are merged
5. **Error Handling**: Graceful fallback to default durations
6. **Image Optimization**: Skips probe for image files (uses default duration)

### ⚠️ Potential Issues

1. **No Bypass Detection**: No mechanism to detect if code bypasses MediaInfoService
2. **Cache Invalidation**: Cache never expires (file changes not detected)
3. **Timeout Handling**: 10s timeout may be too long for UI responsiveness
4. **Error Logging**: Warnings only, no error reporting to UI

### 🔍 No HTML5 Metadata Usage

**Confirmed**: The codebase does NOT use HTML5 media elements for metadata extraction:
- ❌ No `video.duration` access
- ❌ No `audio.duration` access
- ❌ No `loadedmetadata` event listeners for metadata
- ❌ No `new Audio()` or `new Video()` for probing

**HTML5 elements are ONLY used for**:
- ✅ Playback in diff viewers (VideoDiffViewer, AudioDiffViewer)
- ✅ Time synchronization during playback
- ✅ User-facing preview/comparison features

---

## 5. Recommendations

### For Ensuring Consistent Usage

1. **Add ESLint Rule**: Detect direct `.duration` access on HTMLMediaElement
2. **Type Guard**: Wrap HTMLMediaElement in a type that hides `.duration`
3. **Audit Tool**: Script to search for `video.duration` or `audio.duration` patterns
4. **Documentation**: Add warning in CLAUDE.md about bypassing MediaInfoService

### For Cache Improvements

1. **TTL**: Add time-to-live for cache entries
2. **File Watcher**: Invalidate cache when file changes
3. **Size Limit**: Prevent unbounded cache growth

### For Error Handling

1. **User Feedback**: Show toast/notification on probe failure
2. **Retry Logic**: Automatic retry with exponential backoff
3. **Telemetry**: Track probe success/failure rates

---

## 6. File Locations Summary

### Webview
- `packages/webview/src/services/MediaInfoService.ts` - Main service
- `packages/webview/src/services/MediaRequestProxy.ts` - IPC layer
- `packages/webview/src/hooks/useTimelineDragDrop.ts` - Usage in drag-drop
- `packages/webview/src/stores/slices/elementOpsSlice.ts` - Usage in audio detection
- `packages/webview/src/components/MediaDiff/VideoDiffViewer.tsx` - Playback only
- `packages/webview/src/components/MediaDiff/AudioDiffViewer.tsx` - Playback only

### Extension
- `packages/extension/src/services/MediaService.ts` - IPC handler (lines 267-284)
- `packages/extension/src/services/FrameServerService.ts` - Rust bridge (not shown)

### Shared
- `packages/shared/src/types/media.ts` - MediaInfo type definition (assumed)
- `packages/shared/src/constants.ts` - DEFAULT_VIDEO_DURATION, etc. (assumed)

---

## 7. Search Patterns Used

```bash
# Webview searches
grep -r "probeMediaInfo\|probe\|getDuration\|getMediaInfo\|mediaInfo" packages/webview/src/
grep -r "media:probeMediaInfo" packages/webview/src/
grep -r "HTMLVideoElement\|HTMLAudioElement\|video\.duration\|audio\.duration\|loadedmetadata" packages/webview/src/
grep -r "new Audio\|new Video\|createElement.*video\|createElement.*audio" packages/webview/src/

# Extension searches
grep -r "handleProbeMedia" packages/extension/src/
grep -r "probeVideo\|probeMedia\|probe" packages/extension/src/

# Store searches
grep -r "duration" packages/webview/src/stores/
grep -r "mediaInfo" packages/webview/src/stores/
```

---

## Conclusion

The neko-cut package has a **well-architected, centralized media info extraction system** that correctly uses FFmpeg via the Extension Host → Rust pipeline. There is **no problematic HTML5 metadata usage** in the codebase. The only HTML5 media elements are used for playback/preview purposes, which is the correct approach.

The architecture follows VSCode extension best practices:
- ✅ Webview has no direct file system access
- ✅ All media operations go through Extension Host
- ✅ Rust NativeEngine handles heavy lifting (FFmpeg)
- ✅ Clear separation of concerns

**No refactoring needed** for media info extraction. The current implementation is solid.

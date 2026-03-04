# ADR: External Media Library Support

> Status: Accepted (P0/P1 Implemented)
> Date: 2026-03-04
> Implementation: 2026-03-04
> Context: Whether neko-suite should support browsing/referencing files outside the project workspace without copying them in.

## 1. Background

Video/audio production workflows commonly involve:
- Shared media stored on NAS (SMB/NFS/AFP mount)
- Team-shared asset libraries on network drives
- Personal media libraries outside the project directory
- Large footage that should NOT be duplicated per project

Currently, neko-suite **implicitly supports** external file references — `MediaElement.src` stores absolute paths, the Rust engine accepts any accessible path, and `showOpenDialog` allows selecting files from anywhere. However, this capability is **not explicitly designed** and lacks proper UX, error handling, and collaboration support.

## 2. Current State

### What Already Works

| Layer | Behavior |
|-------|----------|
| File Picker | `showOpenDialog` allows system-wide file selection |
| Asset Import | Stores absolute path reference, does NOT copy file |
| Timeline Element | `MediaElement.src: string` — no path restriction |
| Rust Engine | `PathBuf::from(source_path)` — accepts any accessible path |
| Asset Metadata | `.neko/assets/library.json` in workspace, referenced files can be anywhere |

### Data Flow

```
User selects file (any location)
  → uri.fsPath (absolute path)
  → Stored in asset metadata as reference (NOT copied)
  → Timeline element: src = /absolute/path/to/file.mp4
  → Engine probes via HTTP with absolute path
  → File processed (no workspace boundary check)
```

## 3. Decision

**Formally support external media libraries** — formalize the implicit capability with proper configuration, browsing UI, error handling, and collaboration support.

**Do NOT copy files into the project** — the reference-based model is correct for media production workflows where assets are large and shared.

**NAS access relies on OS-level mount** — no application-layer SMB/NFS protocol implementation needed. Mounted NAS paths (`/Volumes/NAS/...`) work transparently.

## 4. Problems to Solve

| Problem | Current Risk | Solution |
|---------|-------------|----------|
| **Path invalidation** | External file moved/NAS disconnected, no user feedback | "Offline asset" detection + path remapping UI |
| **Collaboration portability** | Absolute paths in `library.json` are machine-specific | Path variables: `${MEDIA_LIB}/footage/clip.mp4` |
| **Browsing experience** | No UI to browse external directories | Media Library panel in asset view |
| **Performance** | Large NAS directory scanning is slow | Lazy loading + metadata cache + incremental indexing |
| **Thumbnails** | Where to store thumbnails for external files | Cache in `.neko/cache/thumbnails/` keyed by file hash |

## 5. Proposed Design

### 5.1 Media Library Configuration

```jsonc
// <workspace>/.neko/settings.json
{
  "mediaLibraries": [
    {
      "name": "Team Footage",
      "path": "/Volumes/NAS/footage",
      "variable": "TEAM_FOOTAGE"    // used in path variables
    },
    {
      "name": "Personal SFX",
      "path": "/Users/xxx/SFX",
      "variable": "PERSONAL_SFX"
    }
  ]
}
```

### 5.2 Path Variable System

```
Storage format:   ${TEAM_FOOTAGE}/scene01/clip.mp4
Resolved at runtime to: /Volumes/NAS/footage/scene01/clip.mp4

Per-machine override: .neko/settings.local.json (gitignored)
{
  "mediaLibraryOverrides": {
    "TEAM_FOOTAGE": "/mnt/nas/footage"    // Linux mount point
  }
}
```

### 5.3 Asset Status Model

```typescript
type AssetStatus =
  | 'online'       // file accessible
  | 'offline'      // path not accessible (NAS disconnected, file moved)
  | 'remapped'     // original path invalid, user provided new path
  | 'missing';     // file confirmed deleted

interface AssetHealthCheck {
  checkAccessibility(path: string): Promise<AssetStatus>;
  promptRemap(assetId: string): Promise<string | undefined>;
  batchValidate(assets: AssetFile[]): Promise<Map<string, AssetStatus>>;
}
```

### 5.4 Media Library TreeView

```
Asset Panel
├── Project Assets          ← existing (.neko/assets/)
├── Media Libraries         ← NEW
│   ├── Team Footage (/Volumes/NAS/footage)
│   │   ├── scene01/
│   │   └── scene02/
│   └── Personal SFX (/Users/xxx/SFX)
│       ├── impacts/
│       └── ambience/
└── Recent Files            ← NEW (cross-session history)
```

### 5.5 Cache Strategy

```
<workspace>/.neko/cache/
├── thumbnails/             ← keyed by file content hash
│   ├── ab3f...c7.jpg
│   └── d91e...a2.jpg
├── metadata/               ← probe results cache
│   └── probe-cache.json    ← { [hash]: ProbeResult }
└── waveforms/              ← audio waveform cache
    └── ab3f...c7.wav.json
```

Cache invalidation: compare `file mtime + size` before using cached data.

## 6. Implementation Priority

### P0 — Path Resilience (✅ Implemented 2026-03-04)

- [x] Asset accessibility check on project open
- [x] Friendly error UI for offline/missing assets
- [x] "Relocate file" action for moved assets
- [x] Asset status indicator in timeline and asset panel

**Implementation**:
- `AssetFile` extended with `status`, `lastCheckedAt`, `remap` fields
- `AssetHealthService` provides batch validation with concurrency control
- `AssetHealthMonitor` runs initial check with progress UI, shows warning notifications
- `AssetFileDecorationProvider` shows offline (⚡ orange) and missing (✕ red) badges
- Commands: `validateAll`, `relocateFile`, `showHealthReport`

### P1 — Media Library Management (✅ Implemented 2026-03-04)

- [x] `.neko/settings.json` media library configuration
- [x] Path variable system (`${VAR}/path`) in asset references
- [x] `.neko/settings.local.json` per-machine overrides (gitignored)
- [x] External directory browsing TreeView
- [x] Drag-and-drop from media library to timeline

**Implementation**:
- `MediaLibrarySettingsService` manages settings files with file watcher (300ms debounce)
- `PathResolver` handles `${VAR}/path` ↔ absolute path conversion
- `MediaLibraryTreeProvider` with lazy directory loading, drag-and-drop controller
- `AssetLibrary.importFile()` contracts paths before storage
- Commands: `addMediaLibrary`, `removeMediaLibrary`, `setLocalOverride`, `importFromLibrary`

### P2 — Performance & Polish (mid-term)

- [ ] Metadata/thumbnail local cache with hash-based invalidation
- [ ] Incremental directory indexing for large libraries
- [ ] Search across media libraries (filename, metadata, tags)
- [ ] Low-resolution proxy file auto-generation for NAS media
- [ ] Batch import with progress indication

## 7. Architecture Impact

### Implemented Components (P0/P1)

```
@neko/shared (neko-types)
  ├── types/asset/entity.ts — AssetFileStatus, AssetFileRemap, AssetFile fields
  └── types/asset/settings.ts — MediaLibraryEntry, MediaLibrarySettings, ResolvedMediaLibrary

@neko/asset (neko-assets/packages/asset)
  ├── service/types.ts — FileAccessChecker, FileHealthResult, PathVariableMap
  ├── service/PathResolver.ts — path variable resolution (resolve/contract)
  ├── service/AssetHealthService.ts — batch validation, relocate, summary
  ├── service/FileService.ts — add() sets status='online', lastCheckedAt
  └── service/AssetLibrary.ts — health facade methods, path variable sync, importFile contracts paths

neko-assets/src (extension layer)
  ├── services/AssetHealthMonitor.ts — createFileAccessChecker, initial check, commands
  ├── services/MediaLibrarySettingsService.ts — settings file management, file watcher
  ├── providers/MediaLibraryTreeProvider.ts — TreeView with drag-and-drop
  ├── providers/AssetManagerTreeProvider.ts — status indicators on entities/variants
  ├── providers/AssetFileDecorationProvider.ts — offline/missing badges
  └── extension.ts — wiring, command registration (8 new commands)

package.json
  └── views: neko.mediaLibraries, commands: validateAll, relocateFile, showHealthReport,
      addMediaLibrary, removeMediaLibrary, setLocalOverride, importFromLibrary
```

### Tests Added

- `PathResolver.test.ts` — 19 tests (resolve, contract, round-trip, variables)
- `AssetHealthService.test.ts` — 13 tests (validateAll, validateFile, relocate, summary)

### No Changes Required

- Rust engine — already accepts any filesystem path
- EngineClient — path resolution happens before dispatch
- neko-preview — works with resolved absolute paths

## 8. Rejected Alternatives

| Alternative | Reason for Rejection |
|-------------|---------------------|
| Copy files into project | Wastes disk space, breaks shared library workflows |
| Application-layer SMB/NFS client | Enormous complexity, OS mount already works |
| Symlink files into workspace | Fragile, cross-platform issues, Git doesn't track symlinks well |
| Cloud-first storage (S3/GCS) | Different use case — NAS is local network, not cloud |

## 9. Related Documents

- [Asset Management Design](./asset-management-design.md) — Phase 3 asset system
- [ADR: Cross-Cutting Concerns](./adr-cross-cutting-concerns.md) — shared infrastructure
- [Unified Engine Architecture](../adr-unified-engine.md) — EngineClient file path handling

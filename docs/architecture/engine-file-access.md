# Engine File Access

> Status: Active. This document records the unified local binary file boundary for preview,
> media, model, puppet, subtitle, and agent attachment sources.
>
> Related: [intent-aware-content-access.md](./intent-aware-content-access.md)

## 目标

`neko-engine` 是本地二进制源文件的授权与读取边界。Extension Host 负责 VS Code UI、项目文档和设置编排，但不再为媒体/文档/模型/木偶/字幕源文件各自实现 Range 读取、ZIP entry 读取或 base64 转发。

## 数据流

```
Extension Host
  └─ ContentAccessService.resolve({ intent, target: "engine-source" | "local-path" })
       └─ PathResolver expands stable source refs
       └─ EngineClient.registerFile({ filePath, purpose })
       └─ host-api FileAccessRegistry
            ├─ canonicalize path
            ├─ validate allowed roots and symlink escapes
            └─ return opaque token + metadata

Webview / Extension
  ├─ GET /v1/files/:token                 # Range / full file
  ├─ GET /v1/files/:token/entries/*path   # ZIP/container entry
  └─ GET /v1/files/:token/resources/*path # sibling model/document resources

Engine actions
  └─ sourceRef: { token } or { path }
       └─ resolve inside engine before opening the file
```

Compatibility aliases remain:

- `/v1/preview/register`
- `/v1/preview/file/:token`
- `/v1/preview/epub/:token/*path`
- `previews:*token`
- legacy action `source: string`

New code should prefer `files:*` actions, `/v1/files/*` HTTP routes, and `sourceRef`.

## Intent-aware registration

Engine file access receives already-resolved source-intent inputs. Callers must not register Webview URI, thumbnail path, preview cache path, proxy path, preview token URL, blob/object URL, or legacy `cachePath` as an export/package/verify source.

| Operation                        | Required content intent                   | Engine input                                                               |
| -------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| Final export                     | `final-export`                            | original local source path or engine source token                          |
| Package/archive assembly         | `package`                                 | original source token, original entry bytes, or original local source path |
| Hash/probe/dependency validation | `verify`                                  | original local source path or source token                                 |
| Webview range reads              | `verify` or source-backed preview request | source path resolved through `PathResolver`                                |
| Edit playback/proxy              | `edit-playback`                           | proxy/runtime stream allowed only for playback                             |

Draft/proxy export is allowed only when the request explicitly sets `qualityMode: "draft-proxy"` and records diagnostics.

## Runtime handle persistence

Engine file tokens, stream ids, range URLs, preview token URLs and websocket URLs are runtime handles. They can be passed during one operation, but persisted project files, Canvas nodes, Agent durable payloads and package manifests must store the stable source ref instead.

If a resumed operation has a runtime ref with a stable `source`, it should discard the expired token and resolve/register the source again. If it only has the token or URL, it must report `missing-source` / `unrecoverable`; it must not infer a file path from token text or nearby cache paths.

## Extension 侧允许读取

The boundary is not a blanket ban on filesystem access. Extension code may still read or write:

- project JSON CustomDocuments such as `.nkv`, `.nkm`, `.nkp`, `.nka`, `.nks`
- workspace settings and preferences, including `neko/settings.json` and `.neko/settings.local.json`
- small text sidecars, lyrics, manifests, and shader/LUT text files
- generated export or recording outputs chosen by the user
- test fixtures

Extension code should not read source media/model/puppet/document/subtitle binaries once an engine path exists. Examples that must use engine file access:

- subtitle byte ranges in `neko-cut`
- PDF/EPUB/CBZ/DOCX preview bytes and ZIP entries
- `.moc3` puppet loading in `neko-puppet` and `neko-live`
- `.gltf/.glb/.vrm` model loading and sibling resources
- media capture, waveform, preview stream, and transcode inputs

## Model Resource URLs

Model Webviews may need external glTF buffers or textures. Register the model source once, then load the source file through:

```
/v1/files/:token/resources/<model-file-name>
```

Relative resources referenced by the glTF resolve against:

```
/v1/files/:token/resources/
```

The route canonicalizes resource paths relative to the registered source directory and rejects parent traversal.

## Testing

Boundary coverage lives in `packages/neko-client/src/__tests__/engineFileAccessArchitecture.test.ts`.
It scans affected Extension packages for binary read APIs and keeps an explicit allowlist for project JSON, settings, sidecars, tests, and generated writes.

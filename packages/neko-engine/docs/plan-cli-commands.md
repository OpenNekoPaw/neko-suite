# 重构方案：CLI 命令与 native-api Controller 完全对齐

## 目标

将 CLI 从 5 个命令（serve/export/probe/extract/action）重构为与 native-api 10 个 Controller 对齐的子命令体系。不支持 stream 相关命令。异步任务使用触发+轮询 `tasks:probe` 处理。

## native-api Controller 清单

| Group | Actions | CLI 支持 |
|-------|---------|---------|
| `videos` | probe, capture, extract, transcode, keyframes, waveform, proxy | ✅ |
| `audios` | probe, transcode, waveform | ✅ |
| `images` | probe, capture, encode | ✅ |
| `models` | probe, capture | ✅ |
| `timelines` | probe, composite, export, export_progress, export_cancel | ✅ |
| `nodes` | health, metric, gpu | ✅ |
| `tasks` | probe, pause, resume, cancel, list | ✅ |
| `canvas` | composite, capture, export | ✅ |
| `scenes` | composite, capture | ✅ |
| `streams` | — | ❌ 不支持 |

## 设计思路

### 核心原则
1. **每个 group 对应一个 CLI 子命令**（`video`/`audio`/`image`/`model`/`timeline`/`node`/`task`/`canvas`/`scene`）
2. **每个 action 对应子命令的 subcommand**（`neko-engine video probe -i file.mp4`）
3. **异步任务统一模式**：触发 action → 返回 task_id → 轮询 `tasks:probe` → 显示进度条
4. **保留 `serve` 和 `action`**：serve 用于启动服务器，action 用于通用调度
5. **删除旧的 `export`/`probe`/`extract`**：被新的 `timeline export`/`video probe`/`video capture` 替代

### 异步任务处理模式

对于 transcode、proxy、export 等长时间运行的操作：

```
1. dispatch(group, action, options) → response { task_id }
2. loop:
     dispatch("tasks", "probe", task_id) → { state, progress, ... }
     if state == "completed" → break
     if state == "error" → exit(1)
     update progress bar
```

### CLI 命令树

```
neko-engine
├── serve                          # 启动 HTTP/WS 服务器
├── video                          # videos group
│   ├── probe -i <file>            # 探测视频元数据
│   ├── capture -i <file> -o <out> # 截取帧（原 extract）
│   ├── extract -i <file> -o <out> # 提取字幕等
│   ├── transcode -i <file> -o <out> [--codec] [--bitrate]  # 转码（异步）
│   ├── keyframes -i <file>        # 获取关键帧列表
│   ├── waveform -i <file>         # 生成波形数据
│   └── proxy -i <file> -o <out>   # 生成代理文件（异步）
├── audio                          # audios group
│   ├── probe -i <file>            # 探测音频元数据
│   ├── transcode -i <file> -o <out>  # 转码（异步）
│   └── waveform -i <file>         # 生成波形数据
├── image                          # images group
│   ├── probe -i <file>            # 探测图片元数据
│   ├── capture -i <file> -o <out> # 截取/转换
│   └── encode --data <base64> -o <out>  # 编码图片
├── model                          # models group
│   ├── probe -i <file>            # 探测 3D 模型元数据
│   └── capture -i <file> -o <out> # 截取模型预览
├── timeline                       # timelines group
│   ├── probe -i <file.jvi>        # 探测时间线元数据
│   ├── composite --body <json>    # 合成单帧
│   ├── export -i <file.jvi> -o <out>  # 导出视频（异步，带进度条）
│   └── cancel --id <job_id>       # 取消导出
├── node                           # nodes group
│   ├── health                     # 健康检查
│   ├── metric                     # 系统指标
│   └── gpu                        # GPU 信息
├── task                           # tasks group
│   ├── list                       # 列出所有任务
│   ├── probe --id <task_id>       # 查询任务进度
│   ├── pause --id <task_id>       # 暂停任务
│   ├── resume --id <task_id>      # 恢复任务
│   └── cancel --id <task_id>      # 取消任务
├── canvas                         # canvas group
│   ├── composite --body <json>    # 合成画布
│   ├── capture --body <json> -o <out>  # 截取画布
│   └── export --body <json> -o <out>   # 导出画布（异步）
├── scene                          # scenes group
│   ├── composite --body <json>    # 合成场景
│   └── capture --body <json> -o <out>  # 截取场景
└── action <group> <action>        # 通用调度（保留）
    [--id] [--options JSON] [--body JSON] [-f json|pretty]
```

## 修改文件清单

### 1. `packages/native-cli/src/args.rs` — 完全重写

- 删除旧的 `Export`/`Probe`/`Extract` variant
- 新增 `Video`/`Audio`/`Image`/`Model`/`Timeline`/`Node`/`Task`/`Canvas`/`Scene` 子命令
- 每个子命令内部再定义 subcommand enum
- 保留 `Serve` 和 `Action`

### 2. `packages/native-cli/src/runner.rs` — 大幅重构

- 删除 `run_export`/`run_probe`/`run_extract` 方法
- 新增通用辅助方法：
  - `dispatch_simple()` — 同步 dispatch + 输出结果
  - `dispatch_with_progress()` — 异步任务 dispatch + 轮询进度条
  - `dispatch_and_save()` — dispatch + 将 base64 数据写入文件
- 每个 group 一个 handler 方法（`run_video`/`run_audio`/...）
- export 使用 `dispatch_with_progress()` 统一处理

### 3. `packages/native-cli/src/main.rs` — 更新 log_level match

- 更新所有新子命令的 log_level 映射

## 不修改的文件

- native-api/* — Controller 层不变
- native-core/* — Service 层不变
- native-http/* — HTTP 层不变

## 验证方案

```bash
# 编译
cargo build --workspace

# 测试
cargo test -p neko-native-cli

# 功能验证
neko-engine video probe -i /path/to/video.mp4
neko-engine video capture -i /path/to/video.mp4 -o frame.jpg
neko-engine audio probe -i /path/to/audio.mp3
neko-engine image probe -i /path/to/image.png
neko-engine timeline probe -i /path/to/project.jvi
neko-engine node health
neko-engine node gpu
neko-engine task list
neko-engine action nodes health  # 通用调度仍可用
```

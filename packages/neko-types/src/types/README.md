# types/

纯类型定义模块，不含任何运行时代码。所有类型均从 `@neko/shared` Layer 0 导出。

## 文件索引

### 时间线核心

| 文件 | 说明 |
|------|------|
| `project.ts` | VideoProject — 顶层项目数据结构 |
| `element.ts` | TimelineElement — 视频/音频/图片/文字元素联合类型 |
| `track.ts` | Track — 轨道基础类型 |
| `timelineTrack.ts` | TimelineTrack — 含元素列表的完整轨道 |

### 动画与关键帧

| 文件 | 说明 |
|------|------|
| `animation.ts` | AnimationClip / AnimationTrack |
| `keyframe.ts` | Keyframe / KeyframeValue |
| `easing.ts` | EasingType 枚举（linear / ease-in / ease-out…） |

### 视觉效果

| 文件 | 说明 |
|------|------|
| `effects.ts` | VideoEffect 联合类型（blur / glow / shadow…） |
| `transition.ts` | TransitionType + TransitionConfig |
| `mask.ts` | MaskLayer / MaskShape |
| `shape.ts` | ShapeElement / ShapeFill / ShapeStroke |
| `blendMode.ts` | BlendMode 枚举 |
| `colorCorrection.ts` | ColorCorrectionParams（brightness / contrast / curves…） |

### 媒体与几何

| 文件 | 说明 |
|------|------|
| `audio.ts` | AudioTrack / VolumeKeyframe / LoudnessInfo |
| `subtitle.ts` | SubtitleEntry / SubtitleStyle |
| `speed.ts` | SpeedControl / SpeedRamp |
| `transform.ts` | Transform（position / scale / rotation / anchor） |
| `geometry.ts` | Rect / Point / Size |

### IPC 通信协议

| 文件 | 说明 |
|------|------|
| `message.ts` | ExtensionToWebviewMessage / WebviewToExtensionMessage 联合类型 |
| `config.ts` | ExtensionConfig + 默认值 |
| `exportProtocol.ts` | ExportSettings / ExportJobStatus / ExportPreset（流式导出、背压控制） |
| `mediaDiffProtocol.ts` | MediaDiff IPC 消息类型 |
| `mediaProtocol.ts` | 媒体操作 IPC 协议 |
| `proxyProtocol.ts` | Extension ↔ Webview 代理消息协议 |
| `ui-state.ts` | UI 状态同步协议 |
| `extension-api.ts` | VSCode Extension API 代理类型 |

### Agent / AI

| 文件 | 说明 |
|------|------|
| `agent.ts` | Agent / AgentSession / AgentConfig |
| `agent-message.ts` | AgentMessage / ConversationMessage |
| `aiAction.ts` | AIAction / AIActionResult（Timeline 操作指令） |
| `task.ts` | AgentTask / TaskStatus |
| `task-view.ts` | TaskView（UI 展示用任务快照） |
| `prompt.ts` | PromptTemplate / PromptContext |
| `memory.ts` | AgentMemory / MemoryEntry |
| `skill.ts` | Skill / SkillConfig / SkillResult |
| `skill-conflict.ts` | SkillConflict 解析类型 |
| `subagent.ts` | SubAgent / SubAgentTask |
| `hook.ts` | AgentHook / HookContext（AOP 钩子） |
| `context-manager.ts` | ContextManager 接口类型 |
| `context-persistence.ts` | 持久化上下文类型 |
| `conversation-compressor.ts` | ConversationCompressor 接口 |

### 工具系统

| 文件 | 说明 |
|------|------|
| `tool.ts` | Tool / ToolSchema / ToolCall / ToolResult |
| `tool-category.ts` | ToolCategory 枚举 |
| `tool-group.ts` | ToolGroup（工具集合） |
| `tool-injection.ts` | 工具注入上下文类型 |

### MCP & 平台

| 文件 | 说明 |
|------|------|
| `mcp.ts` | MCPServer / MCPTool / MCPResource |
| `platform.ts` | LLMProvider / ModelConfig / PlatformCapabilities |

### 画布

| 文件 | 说明 |
|------|------|
| `canvas.ts` | CanvasNode / CanvasEdge / CanvasViewport |

### 子目录

| 目录 | 说明 |
|------|------|
| `asset/` | 资产管理（AssetManifest / AssetEntity / IAssetRegistry / AssetHandler…）详见 asset/index.ts |
| `mediaEngine/` | 媒体引擎接口（IMediaEngine / IDecoder / IEncoder…）详见 [mediaEngine/README.md](./mediaEngine/README.md) |

## 设计约束

- 纯类型：所有文件只含 `type` / `interface` / `const enum` / 常量枚举，无运行时逻辑
- 零导入循环：types/ 内文件只允许导入 types/ 内其他文件
- 向后兼容：新增字段使用可选属性（`?`），不删除已有字段

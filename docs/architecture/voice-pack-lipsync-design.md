# Voice Pack 与 Lip-Sync 设计

> 状态：Design Follow-up（P2）  
> 关联：`adr-puppet-model-format-integration.md`、`agent-media-architecture.md`、`device-management.md`

## 背景

`voice-pack` 是 puppet/model 共享的角色音频维度。当前变更只实现 media kind、Market install target、dependency manifest 与 character-pack 引用；生产级口型驱动不在本轮实现范围内。

## 目标

- 定义可由 Market、AssetLibrary、Agent 和 runtime 共同理解的 voice-pack 元数据。
- 定义 `ILipSyncDriver`，把音频转换为目标特定的 face parameter timeline。
- 明确 puppet 与 VRM/model 的参数输出差异、恢复规则和存储边界。

## 非目标

- 不在本轮实现 ML lip-sync。
- 不要求所有 voice-pack 都包含 viseme timeline。
- 不把 audio decoding、phoneme alignment 或模型推理放入 `@neko/shared`。

## Voice Pack Contract

```ts
export interface VoicePackManifest {
  readonly format: 'voice-pack';
  readonly version: 1;
  readonly speaker?: {
    readonly id?: string;
    readonly name?: string;
    readonly language?: string;
    readonly locale?: string;
  };
  readonly clips: readonly VoicePackClip[];
  readonly timelines?: readonly VoicePackTimeline[];
}

export interface VoicePackClip {
  readonly id: string;
  readonly path: string;
  readonly mimeType: 'audio/wav' | 'audio/ogg' | 'audio/flac';
  readonly transcript?: string;
  readonly durationSec?: number;
  readonly tags?: readonly string[];
}

export interface VoicePackTimeline {
  readonly clipId: string;
  readonly target: 'puppet' | 'vrm';
  readonly path: string;
  readonly driverId?: string;
}
```

Market 表现为 `type: 'media'`、`mediaKind: 'voice-pack'`。AssetLibrary 记录 `assetDimension: 'audio'`，character-pack 的 `.nkentity` 使用 `role: 'voice'` 绑定。

## Lip-Sync Driver

```ts
export interface ILipSyncDriver {
  readonly id: string;
  readonly supportedTargets: readonly ('puppet' | 'vrm')[];
  audioToFaceParams(input: LipSyncInput): Promise<FaceParamTimeline>;
}

export interface LipSyncInput {
  readonly audio: ArrayBuffer;
  readonly sampleRate: number;
  readonly target: 'puppet' | 'vrm';
  readonly transcript?: string;
  readonly language?: string;
}

export interface FaceParamTimeline {
  readonly fps: number;
  readonly target: 'puppet' | 'vrm';
  readonly frames: readonly FaceParamFrame[];
}

export interface FaceParamFrame {
  readonly time: number;
  readonly params: Record<string, number>;
}
```

Driver 是运行时能力，不是文件格式能力。`@neko/shared` 只允许保存 contract；具体实现属于 host/engine/agent provider。

## Target Mapping

| Target | 输出参数 | 说明 |
| --- | --- | --- |
| `puppet` | `ParamMouthOpenY`、`ParamMouthForm`、可选 cheek/breath | 面向 Live2D/MOC3 参数。 |
| `vrm` | `aa`、`ih`、`ou`、`ee`、`oh` 或 VRM expression preset | 面向 VRM blendshape/expression。 |

Puppet timeline 可以降级为单通道 mouth open。VRM timeline 可以降级为 `aa` 权重。降级必须写入 `metadata.degraded: true`，避免 Agent 误判为高质量结果。

## Storage And Recovery

- voice-pack 安装路径：`~/.neko/presets/voice-pack/{publisherId}/{name}`。
- 项目依赖：`neko/assets/manifest.json` 记录 `sourceKind: 'market' | 'import' | 'workspace'`、`mediaKind: 'voice-pack'`、`dimensions: ['audio']`。
- timeline 文件可以作为 voice-pack 内部文件，也可以作为项目缓存生成物；缓存生成物不得作为唯一可恢复来源。
- 若音频存在但 timeline 缺失，系统可以重新运行 driver；若 driver 不可用，报告 `missing-lipsync-driver`，但 voice asset 仍可使用。

## Roadmap

1. 规则映射：基于 transcript/phoneme 的 viseme lookup，输出 puppet/VRM timeline。
2. STT/phoneme alignment：复用 engine Whisper 或 provider STT，加入时间对齐。
3. ML 驱动：模型直接预测 mouth/viseme 曲线，作为可安装 AI model/provider。
4. 编辑器集成：在 puppet/model timeline 中可视化并手工修正 face parameter curve。

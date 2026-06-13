# ADR: Puppet × Model 格式集成与 Agent 能力补全

## 状态

Proposed (2026-05-19)

## 关联 ADR

- 项目格式治理: [format-strategy.md](./format-strategy.md) — nk\* 命名、JSON Schema SSOT、Format SDK
- 上层依赖: [adr-asset-federation.md](./adr-asset-federation.md) — AssetHandler trait、子包自治、联邦注册
- 上层依赖: [adr-capability-protocol.md](./adr-capability-protocol.md) — AgentCapabilityProvider 两阶段模型（Registration/Injection）
- 平行配合: [adr-device-management.md](./adr-device-management.md) — TrackingService/VMC 模式（语音/lip-sync 相关）
- 平行配合: [adr-engine-puppet-renderer.md](./adr-engine-puppet-renderer.md) — PuppetRenderer wgpu 架构
- P2 设计补充: [voice-pack-lipsync-design.md](./voice-pack-lipsync-design.md) — voice-pack / `ILipSyncDriver` / face parameter timeline
- P2 设计补充: [psd-to-puppet-bridge-design.md](./psd-to-puppet-bridge-design.md) — PSD layer tree → puppet rig draft

---

## 背景

### neko-puppet 现状

| 格式 | 类型 | 状态 |
|------|------|------|
| `.moc3` | Live2D Cubism 3 二进制 | Rust parser 完整支持（ArtMesh/Deformer/Expression/Motion/Physics） |
| `.nkp` | Neko Puppet 项目 JSON | 引用 .moc3 + 参数覆盖 + 视口状态 |
| `.nkpm` | Motion/Expression 预设 | motion3.json + exp3.json + 参数绑定 |
| `.inp` | Inochi2D 二进制 | **已废弃并从生产入口移除（2026-06-13 清理）** |

已有集成：
- **Agent**: 3 个 AI 工具（`PuppetGenerateParams` / `PuppetFromImage` / `PuppetAdjust`）via AgentCapabilityProvider
- **Market**: `PuppetMotionInstallTarget`（`mediaKind: 'puppet-motion'`，动作预设分发）
- **Live Mode**: `PuppetLiveModeService` + ARKit→Live2D 参数映射

### neko-model 现状

| 格式 | 方向 | 状态 |
|------|------|------|
| `.glb` | 导入/导出 | glTF 2.0 二进制，主力格式 |
| `.gltf` | 导入 | glTF 2.0 ASCII |
| `.vrm` | 导入/导出 | VRM 1.0（GLB + VRMC 扩展），13 种表情预设 |
| `.nkm` | 项目 | Neko Model 场景 JSON |
| `.fbx` | 导出 | 仅 character baking |

已有能力：
- **渲染**: PBR Metallic-Roughness 全管线（base color / metallic / roughness / normal / occlusion / emissive）
- **动画**: 骨骼动画 + Morph Targets + Crossfade + GPU Skinning
- **IK**: FABRIK / CCD / TwoBone
- **Live Mode**: `ModelLiveModeService` + VMC protocol
- **场景编辑**: SceneDocument 提供 node transform / material / light / camera / animation 完整命令

已有集成：**无**。neko-model 是唯一具备场景编辑能力却零 Agent / 零 Market / 零搜索集成的创作子包。

### 缺口汇总

| 维度 | neko-puppet | neko-model |
|------|:-----------:|:----------:|
| Agent 工具 | 3 个 | **0** |
| Market InstallTarget | 动作预设 | **无** |
| 统一实体搜索 | **无** | **无** |
| Zip 包加载 | **无**（Live2D zip 是用户主要获取方式） | 无（GLB 自包含，需求弱） |
| 语音包 / lip-sync | **无** | **无** |
| PSD 转换 | **无**（neko-sketch 有 ag-psd 但无桥接） | N/A |

---

## 问题分析

### 问题 1 (P0): Live2D zip 包加载缺失

用户从 Booth / nizima 下载的 Live2D 模型均为 zip 包，内部结构：

```
model.zip/
├── model3.json          # 索引清单
├── model.moc3           # 二进制模型
├── textures/
│   ├── texture_00.png
│   └── texture_01.png
├── motions/
│   ├── idle.motion3.json
│   └── wave.motion3.json
├── expressions/
│   ├── happy.exp3.json
│   └── sad.exp3.json
└── physics/
    └── physics3.json
```

当前 neko-puppet 只能加载裸 `.moc3` 文件，丢失 motion / expression / physics 配置。整个代码库无 `model3.json` 解析逻辑（经 grep 确认）。

### 问题 2 (P0): Agent 对 3D 场景完全盲区

neko-model 无 `agentCapabilityProvider.ts`、无 `NekoModelAPI` 接口定义。Agent 无法：
- 查询场景图（节点列表、层级、材质、灯光）
- 操作节点（transform / visibility / material）
- 控制动画（play / seek / blend）

对比其他子包：puppet 有 3 工具、canvas 有完整 provider、cut 有工具、audio 有 9+ 工具。

### 问题 3 (P1): 统一实体搜索缺失

两个子包均未注册 `ProjectSearchAdapter`。`createAgentProjectSearchAdapters()` 仅聚合 compatibility adapters、dashboard entity sources 和 context script candidates，无 puppet / model 文件发现能力。

Agent 无法发现工作区中的 `.nkp` / `.moc3` / `.nkm` / `.glb` / `.vrm` 文件及其内部实体（骨骼、动画、材质等）。

### 问题 4 (P1): Market 集成不完整

- neko-model 无 market 目录，完全脱离 marketplace 生态
- neko-puppet 仅有动作预设分发（`puppet-motion`），缺少完整模型分发（`puppet-model`）
- `BuiltinInstallTargets` 中 `MediaInstallTarget` 已支持 `mediaKind` 路由，只需补充具体 target

### 问题 5 (P2): 语音包 + lip-sync 管线空白

类型系统已铺垫：
- `EntityAssetBindingRole` 含 `'voice'`
- `RepresentationFileRole` 含 `'voice'` / `'lipsync'`
- `ICapabilityMediaService.generateVoice()` 已定义

但 puppet / model 侧零消费。缺少：
- 语音包格式定义
- Audio → 口型参数自动映射（viseme 驱动）
- `generateVoice` 输出到 puppet / model face params 的管线

### 问题 6 (P2): PSD→Puppet 转换缺失

neko-sketch 有 `ag-psd` 适配器（`psd-ag-adapter.ts`，支持图层解析、混合模式映射），但无 PSD 图层树→puppet 骨骼层级的桥接。该管线是 Live2D 创作核心工作流（绘制部件 → 导入模型 → 绑骨），但图层→骨骼映射复杂度高。

---

## 决策

### 决策 1: INP 格式废弃，MOC3 单线

- `puppetEditorProvider.ts` 移除 `.inp` 文件过滤器、新建流程入口和直接打开读取路径
- 不保留 `.inp` 后向兼容读取；当前未上线服务不需要保护旧格式
- i18n 字符串更新（`en.ts` / `zh-cn.ts` 移除 INP 相关提示）
- Rust `runtime-puppet/src/loader.rs` INP parser 标记 `#[deprecated]`
- `.nkp` 项目文件 doc comment 更新：引用目标从 `.inp` 改为 `.moc3`

### 决策 2: Live2D zip bundle loader（内存加载，零解包）

引入 `Live2dBundleLoader`，**从 zip 内存读取所有内容，不解包到磁盘**：

```typescript
/** zip bundle 内部条目的逻辑定位符，仅用于索引/引用，不是文件系统路径 */
export interface BundleEntryLocator {
  /** zip 文件路径；存储时必须是相对 .nkp 或 ${WORKSPACE}/... 形式 */
  readonly bundlePath: string;
  /** zip 内部路径；始终使用 POSIX 分隔符 */
  readonly entryPath: string;
  /** 展示/索引用 fragment 形式，不直接传给 engine 或 webview */
  readonly fragmentRef: string; // `${bundlePath}#${entryPath}`
}

/** Live2D model3.json 清单结构（Live2D Cubism JSON 标准） */
export interface Live2dBundleManifest {
  readonly Version: number;
  readonly FileReferences: {
    readonly Moc: string;
    readonly Textures: string[];
    readonly Motions?: Record<string, Array<{
      File: string;
      FadeInTime?: number;
      FadeOutTime?: number;
    }>>;
    readonly Expressions?: Array<{ Name: string; File: string }>;
    readonly Physics?: string;
  };
}

/** 从 zip 内存读取的 bundle 内容 */
export interface Live2dBundleContent {
  readonly manifest: Live2dBundleManifest;
  readonly mocData: ArrayBuffer;                    // .moc3 二进制（内存）
  readonly textures: Array<{                        // 纹理图片数据（内存）
    index: number;
    data: ArrayBuffer;
    name: string;
    locator: BundleEntryLocator;
  }>;
  readonly motions: Record<string, Array<{          // 动作 JSON（内存）
    name: string;
    data: object;
    locator: BundleEntryLocator;
    fadeIn?: number;
    fadeOut?: number;
  }>>;
  readonly expressions: Array<{                     // 表情 JSON（内存）
    name: string;
    data: object;
    locator: BundleEntryLocator;
  }>;
  readonly physics?: {                              // 物理配置（内存）
    data: object;
    locator: BundleEntryLocator;
  };
}

export interface Live2dBundleLoadResult {
  readonly projectPath: string;     // 生成的 .nkp 路径（唯一磁盘写入）
  readonly motionPresets: string[];  // 生成的 .nkpm 路径列表（可选磁盘写入）
  readonly content: Live2dBundleContent; // 内存中的完整 bundle 内容
}

/** 纯函数，可独立测试 */
export async function loadLive2dBundle(
  zipPath: string,
  projectDir: string,
  deps: {
    readZipEntry: (zip: AdmZip, entryName: string) => Buffer;
    writeFile: (path: string, content: string) => Promise<void>;
  },
): Promise<Live2dBundleLoadResult>;
```

#### 2.1 zip 逻辑虚拟路径契约（P0）

先处理**逻辑虚拟路径**，不先实现 VSCode `zip://` FileSystemProvider。

`bundlePath#entryPath` 是 AssetLibrary / ProjectSearch / `bundleIndex` 之间共享的 locator 约定：

- `bundlePath` 表示 zip 文件本身，持久化时必须使用相对路径或 `${WORKSPACE}/...` 变量路径，不写绝对路径
- `entryPath` 表示 zip 内部条目，统一规范化为 POSIX 路径
- `fragmentRef` 仅用于搜索、展示、日志和 AssetFile 内部元数据
- engine、webview、Rust runtime **不得直接消费** `fragmentRef`
- 运行时加载前必须通过 `Live2dBundleLoader` 把 locator 解析成 `ArrayBuffer` / JSON 字符串 / ImageBitmap 可消费数据

路径安全规则：

- 禁止绝对 entry path（如 `/textures/a.png`、`C:\...`）
- 禁止 `..` 穿越和空 segment
- 禁止重复 entry 名覆盖；重复时导入失败并提示
- 限制单 entry 大小和 zip 总展开大小，避免 zip bomb
- 解析 `model3.json` 中的相对路径时，以 `model3.json` 所在目录作为 base，而不是 zip 根目录

加载流程（内存优先）：

```
AdmZip 打开 zip（内存）
  │
  ├─ 1. 定位 *.model3.json → JSON.parse → Live2dBundleManifest
  │
  ├─ 2. 校验：manifest.FileReferences.Moc + Textures 条目在 zip 中存在
  │
  ├─ 3. 读取所有内容到内存 → Live2dBundleContent
  │      .moc3 → mocData (ArrayBuffer)
  │      textures/*.png → textures[] (ArrayBuffer)
  │      motions/*.motion3.json → motions (parsed JSON)
  │      expressions/*.exp3.json → expressions (parsed JSON)
  │      physics3.json → physics (parsed JSON)
  │
  ├─ 4. 生成 .nkp 项目文件（写入磁盘）
  │      puppet.bundle = "./sakura.zip"（引用 zip 路径）
  │      puppet.src = null（不引用裸 .moc3）
  │      expressions 配置写入 .nkp
  │
  ├─ 5. 可选：生成 .nkpm 动作预设（写入磁盘）
  │      每组 motions → 一个 .nkpm 文件
  │
  └─ 6. 返回 Live2dBundleLoadResult
         content 字段持有内存数据 → 传给引擎加载
```

运行时加载（每次打开 .nkp）：

```
打开 .nkp → 读取 puppet.bundle 字段
  → AdmZip 读 zip → 内存解析
  → puppets:load(mocData.toBase64()) → 引擎加载模型
  → textures[] 作为图片字节交给 Webview Canvas 或后续 engine 纹理上传通道
  → puppets:load_auxiliary(expressions, motions, physics) → 引擎加载辅助 JSON
  → 应用 .nkp 中的 parameters 覆盖
```

> 注意：当前 `puppets:set_texture` 只表示把已有 texture index 绑定到 node，不是图片字节上传 API。Live2D zip 的 P0 前置是定义 MOC3 外部纹理数据通道；在该通道落地前，`bundlePath#entryPath` 只能解决索引/引用问题，不能替代运行时数据传输。

注册命令：`neko.puppet.importLive2dBundle`。

### 决策 3: NekoModelAPI + AgentCapabilityProvider

在 `@neko/shared/types/extension-api.ts` 新增接口：

```typescript
export interface NekoModelAPI {
  getSceneGraph(): SceneGraphSnapshot | undefined;
  getNodeProperties(nodeId: string): NodeProperties | undefined;
  setNodeTransform(nodeId: string, transform: Partial<{
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
  }>): Promise<void>;
  setNodeVisible(nodeId: string, visible: boolean): Promise<void>;
  updateMaterial(materialId: string, params: Record<string, unknown>): Promise<void>;
  playAnimation(nameOrIndex: string | number): Promise<void>;
  stopAnimation(): Promise<void>;
  seekAnimation(time: number): Promise<void>;
  listAnimations(): AnimationInfo[];
  getActiveModelPath(): string | undefined;
}

export interface SceneGraphSnapshot {
  nodes: SceneNodeInfo[];
  materials: SceneMaterialInfo[];
  animations: AnimationInfo[];
}

export interface SceneNodeInfo {
  id: string;
  name: string;
  parentId: string | null;
  visible: boolean;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  type: 'mesh' | 'light' | 'camera' | 'bone' | 'empty';
  materialIds?: string[];
}

export interface SceneMaterialInfo {
  id: string;
  name: string;
  roughness: number;
  metallic: number;
}

export interface AnimationInfo {
  name: string;
  index: number;
  duration: number;
}
```

AgentCapabilityProvider 提供 3 个工具：

| 工具 | 类别 | 用途 |
|------|------|------|
| `ModelSceneQuery` | query | 查询场景图：节点/材质/灯光/相机/动画列表 |
| `ModelNodeManipulate` | editing | 操作节点：transform / visibility / material 参数 |
| `ModelAnimationControl` | editing | 动画控制：play / stop / seek / list |

### 决策 4: Puppet + Model 统一实体注册

Puppet / Model 的实体搜索不直接各自注册同一个 `partition: 'asset-library'` adapter。当前 `ProjectIndexCoordinator` 以 `partition` 为 key 保存 adapter，同 partition 后注册会替换先注册者；因此必须先引入聚合策略。

选择：由 `asset-library` adapter 统一读取 AssetLibrary 中的 puppet/model 维度资产；子包通过 ImportHandler / AssetHandler 写入 AssetLibrary 元数据。

| 子包 | 扫描格式 | 实体元数据 |
|------|----------|------------|
| puppet | `.nkp`, `.moc3` | 模型名、参数数量、动画列表 |
| model | `.nkm`, `.glb`, `.gltf`, `.vrm` | 节点数、材质数、动画数、是否 VRM |

落地规则：

- P0/P1 初期：扩展现有 AssetLibraryProjectSearchAdapter，使其识别 `mediaKind` / `assetDimension` / `bundlePath#entryPath`
- 如果后续需要子包独立 adapter，必须先把 ProjectSearch registry 改成同 partition 多 adapter composite，而不是直接重复注册 `asset-library`
- 返回 `ProjectSearchItem`（`kind: 'asset'`），metadata 包含 `mediaKind`、`assetDimension`、`storageMode`
- Agent 只通过 ProjectSearch 查询，不直接调用 puppet/model 的文件扫描逻辑

### 决策 5: Market InstallTarget 补全

| 新 Target | type | mediaKind | 安装路径 | 子包 |
|-----------|------|-----------|----------|------|
| `ModelAssetInstallTarget` | `media` | `model-3d` | `~/.neko/models/3d/{publisherId}/{name}` | neko-model |
| `PuppetModelInstallTarget` | `media` | `puppet-model` | `~/.neko/presets/puppet-model/{publisherId}/{name}` | neko-puppet |

均实现 `IInstallTarget<'media'>` 接口，遵循 `PuppetMotionInstallTarget` 模式（`validateManifest` / `getInstallPath` / `onPostInstall`）。

### 决策 6: 导入架构 — 外部导入 vs 工作区拖拽

#### 6.1 两种场景区分

neko-suite 基于 VSCode 工作区目录，文件进入编辑器有两条完全不同的路径：

| 场景 | 文件来源 | 触发方式 | 预期行为 |
|------|----------|----------|----------|
| **外部导入** | 工作区外（下载目录、Booth zip 等） | 导入命令 / 文件对话框 | 复制/引用到项目 → 按格式零解包或磁盘解包 → 拆分资产元数据 → 生成项目文件 → 注册实体 → 打开编辑器 |
| **工作区拖拽** | 已在工作区内 | 双击打开 / 拖入编辑器 / Explorer 右键 | 直接引用（零复制）→ 打开编辑器 → 按需注册实体 |

neko-model 已有的 `createModelProjectImportPlan` 正确区分了这两种（`useSource` vs `copy`），但 neko-puppet 没有——统一补齐。

#### 6.2 外部导入流程

```
用户触发导入（命令/对话框/Agent）
  │
  ├─ 单文件（.glb / .vrm / .moc3 / .psd / .mp4 ...）
  │    → 子包 ImportHandler.import(sourcePath, documentPath)
  │        1. validateFormat() — 校验格式支持
  │        2. planImport() — useSource（工作区内）/ copy（工作区外→ .neko/imports/{kind}/）
  │        3. executeImport() — 复制文件 + 生成项目文件(.nkp/.nkm)
  │        4. registerEntity() — 写入 AssetLibrary / asset manifest
  │        5. openEditor() — 打开对应编辑器
  │
  └─ zip 包
       → ImportDispatcher.detectZipContent(zipPath)
           嗅探规则（按优先级）:
           1. 含 manifest.json (type: bundle)  → Market InstallManager（orchestration 编排）
           2. 含 *.model3.json                 → Live2dBundleLoader（决策 2）
           3. 含 *.glb/*.vrm + animations/     → Model3dBundleLoader（拆分模型+动画）
           4. 含 *.moc3（无 model3.json）       → 单文件导入（提取 moc3）
           5. 混合内容                          → 提示用户选择目标子包
       → 按格式选择存储策略：
          Live2D zip: 零解包，注册 bundle-memory 虚拟维度（决策 2 / 6.8 / 6.10）
          3D glTF zip: 解包到 .neko/imports/models/（决策 6.8）
       → 各维度资产走各自 ImportHandler
```

#### 6.3 工作区文件拖拽 / 打开

```
用户双击/拖拽工作区内文件
  │
  ├─ 裸资产文件（.glb/.vrm/.moc3 等，已注册 CustomEditorProvider）
  │    → VSCode 自动路由到对应编辑器 → 零导入开销
  │
  ├─ 拖入已打开的编辑器（puppet:dropFile / model drag-drop）
  │    → 子包内部处理（写引用到项目文件）→ 不复制
  │
  └─ 工作区内 zip 文件 → 见 §6.3.1
```

##### 6.3.1 工作区内 zip 处理策略

**现状**：工作区内 zip 完全不支持——model 明确拒绝 `.zip`，puppet 文件对话框过滤掉 zip，AssetLibrary 不处理 zip。

**解包位置选择（仅适用于需要磁盘路径的 zip，例如 `.gltf + .bin + textures`）**：

| 方案 | 解包位置 | 优点 | 缺点 |
|------|----------|------|------|
| A: 就近解包 | `{zip所在目录}/{zip名}/` | 直觉自然；解包产物与 zip 同级便于管理 | 污染用户目录结构；git 中同时存在 zip + 解包目录（冗余） |
| B: 统一到 .neko/imports/ | `.neko/imports/{kind}/{name}/` | 解包产物集中管理；gitignored 不污染工作区 | zip 和解包物理分离，心智负担；删 zip 后解包残留 |

**选择方案 B**：需要解包时统一解包到 `.neko/imports/`。理由：

1. **与外部导入一致** — 无论 zip 来源（外部/工作区），解包位置相同，逻辑简单
2. **git 友好** — zip 可提交 git 作为原始素材源，解包产物在 gitignored 的 `.neko/imports/` 中不污染仓库
3. **团队协作** — 其他成员 clone 后，manifest.json 记录 `source: "import"` + zip 路径 → 自动从工作区内 zip 恢复解包

**工作区内 zip 完整流程**：

```
工作区内 zip 的触发方式:

1. Explorer 右键 "导入 Live2D 包" / "导入 3D 模型包"
   → 注册 context menu（当选中 .zip 时显示）
   → ImportDispatcher.dispatchZip(zipPath, context)

2. 拖入已打开的编辑器
   → 编辑器检测到 .zip → 委托给 ImportDispatcher

3. 命令面板 "导入模型包"
   → 文件对话框（过滤器增加 .zip）→ ImportDispatcher

共同流程:
  ImportDispatcher.dispatchZip(zipPath, context)
    │
    ├─ detectZipContent() 嗅探 zip 类型
    │
    ├─ 判断 zip 是否在工作区内
    │    → isPathInsideOrEqual(zipPath, workspaceFolders)
    │
    ├─ 按类型选择存储模式
    │    ├─ Live2D model3.json → bundle-memory，零解包，只记录 bundlePath#entryPath
    │    └─ 3D .gltf zip       → disk，解包到 .neko/imports/{kind}/{name}/
    │
    ├─ 生成项目文件 (.nkp/.nkm)
    │    ├─ .nkp → 引用 zip bundle 路径
    │    └─ .nkm → 引用解包后的主 .gltf/.glb/.vrm 路径
    │
    ├─ 写入 manifest.json
    │    → source: "import"
    │    → originalFile: "${WORKSPACE}/path/to/original.zip"  ← 工作区内 zip 的关键
    │    → contentHash: sha256 of zip
    │
    ├─ 注册到 AssetLibrary，并触发 ProjectSearch refresh
    │
    └─ 打开编辑器
```

**与外部 zip 导入的唯一区别**：`manifest.json` 中 `originalFile` 使用 `${WORKSPACE}/` 变量路径（而非绝对路径），使得：
- 其他成员 clone 后，zip 在 git 中 → 自动从工作区内 zip 恢复
- 无需用户手动重新提供 zip 文件

**zip 读取/提取工具统一**：当前代码中 Market 用系统 `unzip` 命令，document-reader 用 `AdmZip`（JS 库）。统一为 `AdmZip`：
- 跨平台一致（不依赖系统安装的 unzip）
- 已有依赖（neko-agent/platform 已使用）
- Live2D 走 `.getData()` 内存读取
- 3D glTF zip 走受控提取，禁止 zip-slip，避免直接无校验 `.extractAllTo()`

#### 6.4 统一导入接口

各子包实现统一的 `ImportHandler` 接口，由 `ImportDispatcher` 路由：

```typescript
/** 各子包实现，注册到 ImportDispatcher */
export interface ImportHandler {
  readonly id: string;
  readonly supportedExtensions: readonly string[];

  /** 校验文件是否可导入 */
  validateFormat(filePath: string): ImportValidation;

  /** 规划导入策略（零复制 / 复制到项目） */
  planImport(input: ImportPlanInput): ImportPlan;

  /** 执行导入（复制+生成项目文件+注册实体） */
  executeImport(plan: ImportPlan): Promise<ImportResult>;
}

export interface ImportPlanInput {
  readonly sourcePath: string;
  readonly documentPath?: string;        // 目标项目文件路径（如有）
  readonly workspaceFolderPaths: readonly string[];
}

export type ImportPlan =
  | { action: 'useSource'; sourcePath: string; projectRef: string }
  | { action: 'copy'; sourcePath: string; targetPath: string; targetDir: string; projectRef: string };

export interface ImportResult {
  readonly projectFilePath: string;      // 生成的 .nkp / .nkm 路径
  readonly importedAssets: ImportedAsset[];
  readonly openEditorUri?: string;
}

export interface ImportedAsset {
  readonly dimension: 'model' | 'motion' | 'config' | 'audio' | 'text';
  readonly path: string;
  readonly mediaKind: string;
}
```

#### 6.5 ImportDispatcher（调度层）

```typescript
/**
 * 统一导入调度器。
 *
 * 类型契约可放在 @neko/shared；具体实现必须放在 host-vscode / neko-assets 层，
 * 因为实现依赖 VSCode workspace、Node fs、AdmZip 和用户交互。
 */
export interface ImportDispatcher {
  /** 注册子包的 ImportHandler */
  registerHandler(handler: ImportHandler): void;

  /** 按扩展名路由到 handler */
  dispatch(filePath: string, context: ImportPlanInput): Promise<ImportResult>;

  /** zip 内容嗅探 + 路由 */
  dispatchZip(zipPath: string, context: ImportPlanInput): Promise<ImportResult>;
}
```

分层约束：

- `@neko/shared` 只放 `ImportHandler` / `ImportPlan` / `ImportResult` 等纯类型，不引入 `vscode`、`fs`、`AdmZip`
- `neko-assets` 或 `@neko/shared/vscode/extension` host 层实现 `ImportDispatcher`
- 子包只注册自己的 `ImportHandler`，不直接扫描其他子包格式
- Webview 不参与 zip 读取、路径判断、磁盘写入，仍只通过 `postMessage` 请求 Extension Host

路由规则：

| 扩展名 | 路由目标 |
|--------|----------|
| `.glb`, `.gltf`, `.vrm` | neko-model ImportHandler |
| `.moc3` | neko-puppet ImportHandler |
| `.nkp` | neko-puppet（直接打开） |
| `.nkm` | neko-model（直接打开） |
| `.psd` | neko-sketch ImportHandler |
| `.mp4`, `.mov`, `.wav`, `.mp3` | neko-cut / neko-audio ImportHandler |
| `.zip` | `detectZipContent()` → 按内容路由 |
| `.nkbundle` / `.zip` (含 manifest.json) | Market InstallManager |

#### 6.6 导入后处理

导入完成后统一触发的后处理管线：

```
ImportResult
  │
  ├─ 1. 文件写入完成（已在 executeImport 中完成）
  │
  ├─ 2. 注册统一实体
  │     → ImportDispatcher 写入 AssetLibrary / asset manifest
  │     → ProjectSearchAdapter 通过 refresh() 重新读取 AssetLibrary
  │     → 每个 dimension 的资产独立投影为 ProjectSearchItem
  │
  ├─ 3. 通知相关子包
  │     → vscode.commands.executeCommand('neko.{package}.onAssetImported', result)
  │     → 子包可更新素材面板、预设列表等
  │
  ├─ 4. 打开编辑器（可选）
  │     → vscode.commands.executeCommand('vscode.openWith', uri, editorId)
  │
  └─ 5. Agent 可感知
        → 通过 ProjectSearchAdapter 查询新导入的资产
        → AgentCapabilityProvider 可操作导入后的模型/动作
```

#### 6.7 资产不可变性：zip 和运行时素材均为只读

**结论：zip 导入后冻结；Live2D zip 以 bundle-memory 方式只读加载，3D glTF zip 的解包产物只读；用户编辑写入项目文件覆盖层。**

数据流是单向的——原始资产从不被修改：

```
zip / workspace asset (冻结或只读引用)
  → runtime asset layer
      ├─ bundle-memory: Live2D zip 内部条目，按 bundlePath#entryPath 读取
      └─ disk imports: .neko/imports/ 中的 3D glTF 解包产物
      → 项目文件引用 (.nkp/.nkm，可写覆盖层)
          → 导出 → 新文件（不回写原始）
```

| 层 | 文件 | 可变性 | 角色 |
|----|------|:------:|------|
| 原始源 | `.zip` | 冻结 | 导入源，团队共享，类比 npm tarball |
| bundle-memory 资产 | `bundlePath#entryPath` 指向的 zip 内 .moc3/textures/motions/config | 只读 | Live2D 运行时素材索引，不落盘 |
| 解包产物 | `.neko/imports/` 中的 .gltf/.bin/textures | 只读 | 3D glTF 运行时素材，类比 node_modules |
| 项目文件 | `.nkp` / `.nkm` | **可写** | 用户编辑状态的覆盖层 |
| 衍生预设 | `.nkpm`（动作）/ `.nkma`（动画） | 可写 | 用户创建的新预设，独立于原始资产 |
| 导出产物 | 新 .glb / .vrm / .zip | 新建 | 导出生成新文件，不修改原始 |

项目文件是**覆盖层**（overlay）：

- `.nkp` 的 `parameters: Record<string, number>` 覆盖 .moc3 默认参数值
- `.nkm` 的 `customClips` / `camera` / `editorState` 覆盖 .glb 默认场景状态
- 原始 .moc3 / .glb 保持不变，项目文件只记录差异

这意味着：

- **不需要"更新 zip"** — zip 是历史快照，修改走项目文件
- **不需要 zip ↔ 解包双向同步** — 数据只从 zip 流向项目，不回流
- **替换 Live2D 原始素材** = 替换 zip 或重新导入新 zip → `.nkp` bundle 引用更新
- **替换 3D glTF zip 原始素材** = 重新导入新 zip → 生成新解包 → 项目文件引用自动更新
- **磁盘解包目录可安全重建** — 从 zip 重新解包即可恢复（manifest.json 记录了来源）

> 例外：用户通过外部工具（Live2D Cubism Editor / Blender）修改了原始文件后，需要**重新导入**而非就地更新。这与 npm 包更新的模型一致——修改 node_modules 不是正确做法，应该更新包源。

##### 6.7.1 不解包 zip 的更新策略

在"zip 内存加载 + .nkp 覆盖层"模型下，"更新"的各场景处理：

| 场景 | 频率 | 处理方式 |
|------|:----:|----------|
| **参数调整** | 高 | 写入 .nkp 的 `parameters`，zip 不变 |
| **添加新动作/表情** | 中 | 创建独立 .nkpm 文件，不修改 zip |
| **替换整个 zip（新版本）** | 低 | 覆盖 zip 文件 → 下次打开自动加载新版 |
| **Market 包更新** | 低 | InstalledRegistry 管理，已有机制 |
| **替换纹理（换皮）** | 低 | 需要新 zip（从创作工具导出） |

**场景详解——替换 zip**：

```
用户获得新版 sakura-v2.zip

方式 1: 同名覆盖（推荐）
  workspace/characters/sakura.zip ← 直接替换文件
  .nkp 的 puppet.bundle = "./sakura.zip" ← 路径未变
  下次打开 → AdmZip 读新 zip → 加载新模型 → 自动生效

方式 2: 新文件名
  将 sakura-v2.zip 放入工作区
  更新 .nkp 的 puppet.bundle = "./sakura-v2.zip"
  或通过 "重新导入" 命令选择新 zip → 自动更新 .nkp
```

**覆盖层兼容性检查**（替换 zip 后首次打开）：

```
打开 .nkp → 加载新 zip → 获取新模型参数列表
  → 对比 .nkp 中的 parameters 键与新模型参数
  → 有效键：保留并应用
  → 无效键（旧模型独有，新模型不存在）：忽略 + 提示用户
  → 新增键（新模型新参数）：使用默认值
  → 可选：manifest.json 中 contentHash 变化 → 标记版本更新
```

> 不需要"合并"或"迁移"工具——覆盖层只是键值对，丢弃无效键即可。动作预设 (.nkpm) 按参数名引用，如果参数名不变则兼容。

#### 6.8 存储策略：按格式区分（Live2D 内存加载 / 3D 磁盘解包）

**修正结论：Live2D zip 不需要解包到磁盘，3D 模型 zip 仍需解包。**

> **补充发现**：当前 MOC3 渲染存在纹理加载缺口——MOC3 只记录 texture index，外部 PNG 来自 model3.json 的 Textures 列表；当前没有从 Live2D PNG 字节进入 Webview Canvas 或 engine atlas 的完整通道。`puppets:load_auxiliary` 只承载 expressions / motions / physics，`puppets:set_texture` 只切换节点的 texture index，不上传图片字节。bundle loader 实现时必须同时补齐 MOC3 外部纹理数据通道。这是 Live2D zip 加载的 P0 前置依赖。

引擎加载器实际能力重新评估：

| 组件 | 引擎 API | 接受数据形式 | 需要磁盘？ |
|------|----------|-------------|:---------:|
| `.moc3` | `puppets:load(base64)` | 字节流 | **否** |
| Live2D 纹理 PNG | **待新增/明确**：Webview `ImageBitmap` 通道或 engine atlas 上传 API | 图片字节 | **否** |
| `motion3.json` | TS 侧 JSON.parse | 字符串 | **否** |
| `exp3.json` | TS 侧 JSON.parse | 字符串 | **否** |
| `physics3.json` | `puppets:load_auxiliary` | JSON 字符串 | **否** |
| `.glb` / `.vrm` | `load_gltf(world, path: &Path)` | **磁盘路径** | **是** |

##### Live2D zip：内存加载，零解包

```
AdmZip 打开 zip（内存读取）
  ├── 定位 *.model3.json → JSON.parse → 获取 FileReferences
  ├── 读取 .moc3 字节 → puppets:load(base64) → 引擎加载模型
  ├── 读取 textures/*.png 字节 → 解码为 ImageBitmap 或上传到后续 engine atlas API
  ├── 读取 motions/*.motion3.json → TS 解析 → 生成 .nkpm 动作预设
  ├── 读取 expressions/*.exp3.json → TS 解析 → 写入 .nkp 表情配置
  └── 读取 physics3.json → 通过 puppets:load_auxiliary 传给引擎物理模块

写入磁盘的仅有:
  ├── .nkp 项目文件（用户编辑状态覆盖层）            ← 必须，1 个文件
  └── .nkpm 动作预设（从 motions/ 生成，按需）         ← 可选，少量文件
```

文件数量对比：

| 方案 | 磁盘文件数/角色 | 管理复杂度 |
|------|:--------------:|:---------:|
| 全量解包到 .neko/imports/ | 20-80 | 高（大量小文件 + 生命周期管理 + git 同步） |
| **内存加载 + 仅写项目文件** | **1-3** | **低（只管 .nkp + .nkpm）** |

> zip 本身作为原始素材源可提交 git（或保存在工作区外），.nkp 引用 zip 路径而非解包后的文件路径。每次打开 .nkp 时，从 zip 内存加载——类比浏览器从 .woff 加载字体，不需要先解包。

**NkpProjectData 引用方式调整**：

```typescript
interface NkpProjectData {
  puppet: {
    src: string | null;     // 裸 .moc3 文件路径（向后兼容，简单场景）
    bundle?: string | null; // Live2D zip 包路径（新增，bundle 加载模式）
    format?: 'moc3';
  };
  // ...
}
```

- `bundle` 优先于 `src`：有 bundle 时从 zip 内存加载，无 bundle 时回退 src 裸路径
- 打开 .nkp → 检测 bundle 字段 → AdmZip 读 zip → 内存加载全部内容
- 用户导入裸 .moc3（无 zip）→ 走 src 路径，与当前行为一致

##### 3D 模型 zip：仍需磁盘解包

glTF 加载器 `gltf::import(path)` 需要磁盘路径解析相对引用（.bin / textures），但 3D 模型 zip 的实际情况：

| 格式 | 内部文件数 | 解包问题 |
|------|:--------:|:-------:|
| `.glb` | 1（自包含二进制） | **无文件爆炸** |
| `.vrm` | 1（GLB + VRMC 扩展） | **无文件爆炸** |
| `.gltf` + assets | 3-10（JSON + .bin + textures） | 少量文件 |

3D 模型 zip 解包到 `.neko/imports/models/`，但文件数极少（通常 1 个 GLB）。

##### 汇总：分格式存储策略

| 来源 | Live2D (puppet) | 3D (model) |
|------|----------------|------------|
| **zip 导入** | **零解包**，从 zip 内存加载 | 解包到 `.neko/imports/models/` |
| **Market 安装** | 安装到 `~/.neko/presets/puppet-model/`（Market 包已解包） | 安装到 `~/.neko/models/3d/` |
| **裸文件导入** | .moc3 直接引用（src 路径） | .glb/.vrm 按 useSource/copy 策略 |
| **manifest.json 记录** | `source: "import", originalFile: "path/to.zip"` | `source: "import", importedTo: ".neko/imports/models/"` |

**团队协作（git 同步）**：

```
Live2D:
  git 中: sakura.zip + sakura.nkp (bundle: "./sakura.zip")
  其他成员 clone → 打开 .nkp → 从 zip 内存加载 → 零恢复步骤

3D:
  git 中: character.glb + character.nkm (src: "./character.glb")
  其他成员 clone → 打开 .nkm → 直接加载 .glb → 零恢复步骤
  
  或 git 中: character-pack.zip + manifest.json
  其他成员 clone → 恢复流程解包 → .neko/imports/models/
```

> 当 GLB/VRM 直接在工作区内提交 git 时（最常见），3D 也不需要 `.neko/imports/`。只有从 zip 导入且 zip 内含 gltf（非 glb）多文件结构时才需要解包。

#### 6.9 解包素材生命周期管理

**现状问题**：三套独立管理系统互不相通。

| 系统 | 管理对象 | 追踪方式 | 缺口 |
|------|----------|----------|------|
| **neko-assets** AssetLibrary | 项目素材引用 | Entity→Variant→File + status + remap | 与子包脱节，puppet/model 未接入 |
| **neko-market** InstalledRegistry | 全局已安装包 | packageId→manifest + installedPath + refCount | 不知道项目是否依赖 |
| **子包各自管理** | .nkp `puppet.src` / .nkm `model.src` | 裸相对路径字符串 | 无状态追踪，无来源记录，断裂时无修复 |

**四个更新场景**：

| 场景 | 当前行为 | 应有行为 |
|------|----------|----------|
| 重新导入同名 zip | nonce 避免冲突写新目录，旧目录残留 | 检测同名 → 覆盖或版本化 → 更新引用 |
| Market 包更新 | InstallManager 覆盖 + InstalledRegistry 更新 | 基本完整，但项目侧不感知 |
| 手动删除解包文件 | .nkp/.nkm 加载失败，无提示 | status → missing，提示重新导入或 remap |
| 文件被移动/重命名 | 引用断裂 | PathResolver remap 修复（AssetFile 已有 `remap` 字段，未接入 puppet/model） |

**收敛方向：AssetLibrary 升级为素材引用 SSOT**

```
当前（各自管理）:
  neko-puppet → .nkp 裸路径 puppet.src
  neko-model  → .nkm 裸路径 model.src + .neko/imports/ 独立管理
  neko-assets → library.json 记录但与子包脱节

收敛后（统一管理）:
  neko-assets AssetLibrary = 素材引用 SSOT
    ├── Entity → Variant → File（每个维度独立 File 记录）
    ├── File.status（online / offline / missing / remapped）
    ├── File.sourceOrigin（import / market / workspace）
    ├── File.sourceHash（内容摘要，用于完整性校验）
    └── onDidChange 变更通知 → 所有消费者

  neko-puppet / neko-model = 素材消费者
    ├── .nkp/.nkm 保留 src 裸路径（向后兼容 + 简单场景直接可用）
    ├── 新增可选 assetRef 字段（AssetFile ID，用于 library 联动）
    └── 订阅 onDidChange 响应素材更新/迁移/remap

  neko-market = 素材供给者
    ├── 安装后注册到 AssetLibrary
    └── 更新时通过 AssetLibrary 统一通知消费者
```

> 五维解耦后，模型管理本质就是素材管理。每类资产需要独立的生命周期（导入/更新/删除/导出）、版本追踪、跨引用管理——这些都是 AssetLibrary 已有或可扩展的能力。与 `adr-asset-federation.md` 联邦架构一致：子包贡献 `AssetHandler`（领域知识），AssetLibrary 统一管理生命周期。

#### 6.10 Live2D zip 统一实体注册策略（虚拟维度 + 零解包）

**核心矛盾**：§6.8 决定 Live2D zip 零解包内存加载，但 §9 五维解耦要求各维度独立注册/搜索/流通。两者看似冲突——zip 是原子文件，维度独立需要拆开。

**解决方案：元数据层虚拟注册 + 数据层内存 API + 物理解包延迟到导出**

##### 虚拟路径可行性分析

能否通过 VSCode `FileSystemProvider` 注册 `zip://` scheme 直接访问 zip 内部？

| 消费场景 | `zip://` FileSystemProvider | 评估 |
|----------|:---------------------------:|------|
| Explorer 浏览 zip 内容 | ✓ | 可行（代码库已有 `asset-variant-diff://` 先例） |
| Agent 搜索 zip 内资产 | ✓ | ProjectSearchAdapter 可索引虚拟路径 |
| 引擎加载 moc3/纹理 | ✗ | Rust `load_gltf(path: &Path)` 不识别虚拟 scheme；`puppets:load(base64)` 只接受字节流 |
| Webview 纹理渲染 | ✗ | CSP 限制 `zip://` scheme，`<img>` / Canvas 无法直接引用 |
| 跨进程传递 | ✗ | 虚拟 scheme 仅在 Extension Host 进程内可解析 |

**结论**：FileSystemProvider 可做浏览层辅助，但不能作为数据加载通道。引擎和 Webview 只接受 `file://`、`http://127.0.0.1:*` 或原始字节流。

**推荐方案**：不引入新虚拟文件系统 scheme，而是在 AssetLibrary 层面做虚拟注册：

```
AssetLibrary Entity: "Sakura"
  └── Variant: "live2d-bundle"
       ├── AssetFile[model]:  { bundlePath: "sakura.zip#model.moc3",       mediaKind: "puppet-model" }
       ├── AssetFile[motion]: { bundlePath: "sakura.zip#motions/",          mediaKind: "puppet-motion",
       │                        metadata: { names: ["idle","wave"], count: 2 } }
       ├── AssetFile[config]: { bundlePath: "sakura.zip#expressions/",      mediaKind: "puppet-config",
       │                        metadata: { expressions: ["happy","sad"], physics: true } }
       └── AssetFile[audio]:  null  (zip 内无语音，可后续独立绑定)
```

- `bundlePath` 使用 `zip路径#内部路径` 约定（fragment 语义），不是文件系统路径
- AssetFile 用 `storageMode: 'bundle-memory'` 标识零解包资产（区别于 `'disk'` 普通资产）
- 数据访问统一走 `Live2dBundleContent` API（決策 2），消费者不需要关心底层是 zip 还是裸文件

##### 三层架构

```
搜索/引用层（AssetLibrary + ProjectSearchAdapter）:
  → 虚拟 AssetFile 注册，Agent 可按维度搜索
  → "Sakura 的动作" → metadata.assetDimension = 'motion' 匹配

数据加载层（Live2dBundleContent API）:
  → .nkp 打开时 AdmZip 内存读取 → 引擎/Webview 消费字节流
  → 与搜索层解耦——搜索返回 AssetFile ID，加载通过 BundleLoader 获取数据

物理导出层（按需，用户显式操作）:
  → "导出动作为独立 .nkpm" → 从 zip 提取 motion3.json → 写入磁盘 → 注册为独立 AssetFile
  → "导出模型包" → 从 zip 提取 moc3+textures → zip 打包 → 输出
  → 解包是用户主动操作，不是系统自动行为
```

##### 元数据提取时机

导入 Live2D zip 时一次性解析 `model3.json`，提取并缓存：

| 维度 | 提取的元数据 | 来源 |
|------|------------|------|
| 模型 | parameterCount, textureCount, drawableCount | moc3 header + FileReferences.Textures |
| 动作 | motionGroupNames, motionCount, fadeIn/fadeOut 默认值 | FileReferences.Motions |
| 配置 | expressionNames, hasPhysics | FileReferences.Expressions + Physics |
| 音频 | — | zip 内不含（Live2D 标准无语音） |

缓存位置：.nkp 项目文件新增 `bundleIndex` 字段（避免每次打开时重新解析 zip）：

```typescript
interface NkpProjectData {
  puppet: {
    src: string | null;
    bundle?: string | null;
    format?: 'moc3';
  };
  bundleIndex?: {                       // 导入时一次性提取，缓存于 .nkp
    motionGroups?: Record<string, string[]>;  // group → motionName[]
    expressionNames?: string[];
    parameterNames?: string[];
    textureCount?: number;
    hasPhysics?: boolean;
  };
  // ...
}
```

##### 与 AssetRefScheme 的关系

`AssetRefScheme`（`project://` / `market://` / `shared://` / `external://`）**不需要扩展**。bundlePath 是 AssetFile 内部实现细节，外部引用仍使用 `project://sakura-model` → `AssetRefResolver.resolve()` → 获取 AssetFile → 通过 `storageMode` 判断数据访问方式（`'disk'` → readFile / `'bundle-memory'` → Live2dBundleContent API）。

### 决策 7: Voice pack + lip-sync roadmap (P2, 仅设计)

本 ADR 范围内不实现，仅定义接口方向：

```typescript
/** Audio → 口型参数驱动接口（P2 远期） */
export interface ILipSyncDriver {
  readonly id: string;
  readonly supportedTargets: ('puppet' | 'vrm')[];
  audioToFaceParams(
    audio: ArrayBuffer,
    sampleRate: number,
    target: 'puppet' | 'vrm',
  ): Promise<FaceParamTimeline>;
}

export interface FaceParamTimeline {
  readonly fps: number;
  readonly frames: Array<{ time: number; params: Record<string, number> }>;
}
```

两阶段实现路线：
1. 规则 viseme 映射（phoneme → mouth 参数查找表）
2. ML 驱动（Whisper 音素提取 → 时间对齐 → 参数插值）

### 决策 8: PSD→Puppet roadmap (P2, 仅设计)

本 ADR 范围内不实现，仅定义桥接方向：

```typescript
/** PSD 图层 → Puppet 骨骼桥接接口（P2 远期） */
export interface IPsdToPuppetBridge {
  convertLayerTree(
    layers: PsdLayerNode[],
    options: { autoRig: boolean; meshDensity: 'low' | 'medium' | 'high' },
  ): Promise<PuppetRigDefinition>;
}
```

复用 neko-sketch 的 `ag-psd` 适配器解析图层树，映射 PSD group → puppet bone hierarchy。

### 决策 9: 解耦资产管理 + 统一打包协议

#### 9.1 问题

当前 puppet / model 的资产以**紧耦合**形式存在：Live2D zip 包内模型+动作+表情+物理混为一体，3D 模型的 GLB 内嵌动画+材质。但创作场景需要**解耦**：

- 换皮（替换模型，保留动作库）
- 动作复用（同一组动作应用于不同角色）
- 配音替换（独立更换语音包，不影响模型/动作）
- AI 驱动组装（Agent 按需搜索+组合各类资产）

#### 9.2 五类资产独立管理

将 puppet / model 的资产拆分为五个独立维度，每类有独立 manifest 和版本：

| 资产维度 | puppet 具体形态 | model 具体形态 | mediaKind | 独立流通 |
|----------|----------------|----------------|-----------|:--------:|
| **模型** | `.moc3` + 纹理 | `.glb` / `.vrm` | `puppet-model` / `model-3d` | Yes |
| **动作** | `motion3.json` / `.nkpm` | glTF animation clips / `.nkma` | `puppet-motion` / `model-motion` | Yes |
| **配置** | `exp3.json` + `physics3.json` | VRM expressions + material presets | `puppet-config` / `model-config` | Yes |
| **音频** | 语音包（`.wav`/`.ogg` + viseme 时间轴） | 同左 | `voice-pack` | Yes |
| **文本** | 角色台词绑定 | 场景描述 | — (via entity binding) | Yes |

每类资产对应一个 `IInstallTarget<'media'>` 实现，通过 `mediaKind` 路由：

```
InstallTargetRegistry
├── media.puppet-model   → PuppetModelInstallTarget     (~/.neko/presets/puppet-model/)
├── media.puppet-motion  → PuppetMotionInstallTarget    (~/.neko/presets/puppet-motion/)  [已有]
├── media.puppet-config  → PuppetConfigInstallTarget    (~/.neko/presets/puppet-config/)
├── media.model-3d       → ModelAssetInstallTarget      (~/.neko/models/3d/)
├── media.model-motion   → ModelMotionInstallTarget     (~/.neko/models/3d-motion/)
├── media.model-config   → ModelConfigInstallTarget     (~/.neko/models/3d-config/)
└── media.voice-pack     → VoicePackInstallTarget       (~/.neko/presets/voice-pack/)
```

#### 9.3 统一打包协议：复用 Bundle 编排

**不引入新容器格式**。复用已有的 `BundleInstallTarget`（`distributionKind: 'orchestration'`）：

```jsonc
// 角色包 manifest 示例
{
  "name": "sakura-character-pack",
  "type": "bundle",
  "typeMetadata": {
    "type": "bundle",
    "data": {
      "installPolicy": "all",
      "bundleType": "character-pack"
    }
  },
  "distributionKind": "orchestration",
  "contents": [
    { "packageId": "sakura-puppet-model@1.0.0", "role": "模型" },
    { "packageId": "sakura-idle-motions@1.0.0", "role": "待机动作", "optional": true },
    { "packageId": "sakura-expressions@1.0.0", "role": "表情配置", "optional": true },
    { "packageId": "sakura-voice-jp@1.0.0", "role": "日语语音包", "optional": true },
    { "packageId": "sakura-voice-en@1.0.0", "role": "英语语音包", "optional": true }
  ]
}
```

安装流程（已有实现，无需新增）：
1. `InstallManager.installBundleContents()` 递归安装每个 content
2. 每个 content 按 `type.mediaKind` 路由到对应 InstallTarget
3. 引用计数管理（bundle 卸载时递减 content 引用）

#### 9.4 本地 zip 导入 → 虚拟维度注册

用户从 Booth / nizima 下载的 Live2D zip 包不是 market bundle，需要本地适配层。

**Live2D zip：虚拟注册，零解包**（与 §6.8 + §6.10 一致）

```
用户导入 .zip
  → Live2dBundleLoader（决策 2）内存读取 + 解析 model3.json
  → 一次性提取元数据：motionNames / expressionNames / parameterNames / textureCount
  → 生成 .nkp 项目文件（bundle 字段引用 zip 路径 + bundleIndex 缓存元数据）
  → AssetLibrary 注册虚拟 AssetFile（每个维度一条，storageMode: 'bundle-memory'）
  → ProjectSearchAdapter 暴露各维度搜索条目

磁盘写入：仅 .nkp（1 文件）+ 可选 .nkpm 动作预设
不写入 .neko/imports/——Live2D 资产完全零解包
```

**按需物理解包**（用户显式操作）：

```
用户操作: "导出 Sakura 的动作为独立资产"
  → 从 zip 读取 motions/*.motion3.json（内存）
  → 生成独立 .nkpm 文件 → 写入用户指定位置
  → 注册为独立 AssetFile（storageMode: 'disk'，脱离原 bundle）

用户操作: "把 A 的表情配置复制给 B"
  → 从 A 的 zip 读取 expressions/*.exp3.json（内存）
  → 写入 B 的 .nkp 表情配置覆盖层
  → 不需要物理解包——内存读取 → 内存写入
```

**3D 模型（GLB/VRM）**：本身是自包含的，但动画可拆分：

```
用户导入 .glb（含多个 animation clips）
  → ModelEditorProvider 加载（.glb 自包含，直接磁盘路径）
  → 可选操作: "导出动画为独立资产"
      → 拆出 animation clips → .nkma（Neko Model Animation，JSON 引用 + binary）
      → 写入用户指定位置
      → 注册为独立 AssetFile（storageMode: 'disk'）
```

> 3D 模型 zip（含 .gltf + .bin + textures）仍需解包到 `.neko/imports/models/`（引擎 `load_gltf(path)` 要求磁盘路径）。但最常见的 .glb/.vrm 是自包含二进制，无文件爆炸问题。

#### 9.5 统一实体注册（解耦后）

解耦后的每类资产独立注册为 `ProjectSearchItem`：

```typescript
// 一个角色包解耦后在搜索系统中的呈现
[
  { kind: 'asset', label: 'Sakura - Model',       partition: 'asset-library', metadata: { assetDimension: 'model' } },
  { kind: 'asset', label: 'Sakura - Idle Motions', partition: 'asset-library', metadata: { assetDimension: 'motion' } },
  { kind: 'asset', label: 'Sakura - Expressions',  partition: 'asset-library', metadata: { assetDimension: 'config' } },
  { kind: 'asset', label: 'Sakura - Voice JP',     partition: 'asset-library', metadata: { assetDimension: 'audio' } },
]
```

Agent 可按维度搜索和组合：
- "给 Sakura 换一组动作" → 搜索 `assetDimension: 'motion'`，兼容 puppet-model 的预设
- "用这个语音包配音" → 搜索 `assetDimension: 'audio'`，绑定到当前角色
- "把 A 角色的表情配置复制给 B" → 读取 A 的 config 资产，写入 B 的 config

#### 9.6 导出能力

当前导出现状及补全计划（实现以“新 artifact/package 输出”为边界，不反写原始 ZIP、GLB、GLTF 或 VRM）：

| 导出维度 | puppet (2D) | model (3D) | 现状 |
|----------|:-----------:|:----------:|------|
| 模型 | `.moc3` + textures → zip | GLB / VRM / FBX | puppet 新增 package 导出；model 原始模型导出沿用既有路径 |
| 动作 | `.motion3.json` / `.nkpm` package | `.nkma`（custom clips） | 新增独立 artifact/package 导出 |
| 配置 | exp3.json + physics3.json package | `.nkmc`（face/camera/editor config） | 新增独立 artifact/package 导出 |
| 统一实体 | `.nkentity`（实体元数据 + 绑定资产引用） | 同左 | 新增导出 |
| 素材包 | character-pack zip | 同左 | 新增 bundle manifest + subpackages 导出 |

##### 单资产导出

每类资产可独立导出为 archive（zip）：

```
导出命令                          输出
─────────────────────────────────────────────────────
neko.puppet.exportModel          → {name}-model.zip       (moc3 + textures/)
neko.puppet.exportMotions        → {name}-motions.zip     (*.nkpm)
neko.puppet.exportConfig         → {name}-config.zip      (expressions + physics)
neko.model.exportModel           → {name}.glb / .vrm      (已有)
neko.model.exportMotions         → {name}-motions.nkma    (custom animation clips)
neko.model.exportConfig          → {name}-config.nkmc     (face params + camera + editor state)
```

Live2D bundle-backed puppet 导出从原 ZIP 读取所需 entry 后写入新 package；导出服务不修改原 ZIP。Model motion/config 导出读取 `.nkm` 项目状态，写出 `.nkma` / `.nkmc` 和旁路 manifest，不修改 `model.src` 指向的 `.glb` / `.gltf` / `.vrm`。

##### 统一实体导出

导出 `DashboardCreativeEntity` + 绑定的资产引用为 `.nkentity`（JSON）：

```jsonc
// sakura.nkentity
{
  "format": "nkentity",
  "version": 1,
  "entity": {
    "kind": "character",
    "name": "Sakura",
    "aliases": ["桜", "さくら"],
    "description": "主角，活泼开朗的高中生"
  },
  "bindings": [
    { "role": "live2d", "ref": "./sakura-model.zip", "mediaKind": "puppet-model", "dimension": "model" },
    { "role": "motion", "ref": "./sakura-motions.zip", "mediaKind": "puppet-motion", "dimension": "motion" },
    { "role": "style", "ref": "./sakura-config.zip", "mediaKind": "puppet-config", "dimension": "config" },
    { "role": "voice", "ref": "./sakura-voice-jp.zip", "mediaKind": "voice-pack", "dimension": "audio" }
  ],
  "exportedAt": "2026-05-20T00:00:00.000Z"
}
```

##### 素材包导出

将实体 + 所有绑定资产打包为完整分发包：

```
neko.assets.exportCharacterPack / neko.entity.exportCharacterPack
  → 收集实体元数据 + 所有绑定维度资产
  → 生成 bundle manifest（orchestration 模式）
  → 打包为 {name}-character-pack.zip
  → 可直接上传 market 或本地分享
```

打包结构：

```
sakura-character-pack.zip/
├── manifest.json            # AssetManifest (type: bundle, bundleType: character-pack)
├── sakura-model/            # 模型子包
│   ├── manifest.json
│   ├── model.moc3
│   └── textures/
├── sakura-motions/          # 动作子包
│   ├── manifest.json
│   └── *.nkpm
├── sakura-config/           # 配置子包
│   ├── manifest.json
│   └── *.exp3.json
└── sakura-voice-jp/         # 语音子包（可选）
    ├── manifest.json
    └── *.wav
```

导入时由 `InstallManager` 识别 bundle manifest → 递归安装各子包 → 注册到各 InstallTarget → 注册到 ProjectSearchAdapter。

#### 9.7 Market 接入策略

| 上架形式 | 说明 | 用户体验 |
|----------|------|----------|
| **单资产** | 独立上架模型 / 动作 / 语音包 | 精确购买所需 |
| **角色包 (character-pack)** | Bundle 编排，含模型+默认动作+表情 | 一键获取完整角色 |
| **动作库包 (motion-pack)** | Bundle 编排，含多组通用动作 | 适用于多个角色 |
| **语音包 (voice-pack)** | 独立上架，含音频 + viseme 时间轴 | 按语言/声优选择 |

已有 `BundleMetadata.bundleType` 可扩展：

```typescript
bundleType?: 'style-pack' | 'workflow-pack' | 'character-pack' | 'motion-pack' | 'mixed';
```

### 决策 10: 项目资产依赖清单（Git 同步）

#### 10.1 问题

`.neko/imports/` 是 gitignored 的，`~/.neko/presets/` 是全局目录——两者中的素材文件都不在 git 中。团队协作时：

| 场景 | git 中有什么 | git 中没有什么 | 后果 |
|------|-------------|---------------|------|
| zip 导入 | .nkp + library.json 引用 | `.neko/imports/` 中的解包文件 | 其他成员 clone 后加载失败 |
| Market 安装 | .nkp + library.json 引用 | `~/.neko/presets/` 中的包文件 | 其他成员未安装同款包 |
| 工作区内资产 | .nkp + .moc3/.glb 文件 | — | 正常（文件在 git 中） |

场景 A（工作区内资产直接提交 git）无问题，但场景 B/C 存在**引用断裂**——没有机制让其他协作者知道需要重新导入或安装什么。

#### 10.2 资产依赖清单

引入 `neko/assets/manifest.json`（git tracked），声明项目依赖的外部资产来源：

```jsonc
// neko/assets/manifest.json (git tracked)
{
  "version": 1,
  "assets": {
    "sakura-model": {
      "source": "import",
      "originalFile": "sakura-live2d.zip",
      "contentHash": "sha256:abc123...",
      "storageMode": "bundle-memory",
      "mediaKind": "puppet-model",
      "dimensions": {
        "model": { "mocFile": "model.moc3", "textureCount": 2 },
        "motion": { "names": ["idle", "wave"], "count": 2 },
        "config": { "expressions": ["happy", "sad"], "physics": true }
      }
    },
    "character-3d-pack": {
      "source": "import",
      "originalFile": "character-3d.zip",
      "contentHash": "sha256:def456...",
      "storageMode": "disk",
      "importedTo": ".neko/imports/models/character/",
      "mediaKind": "model-3d",
      "files": ["scene.gltf", "scene.bin", "textures/diffuse.png"]
    },
    "sakura-idle-motions": {
      "source": "market",
      "packageId": "booth/sakura-idle-motions@1.0.0",
      "mediaKind": "puppet-motion"
    },
    "studio-hdr": {
      "source": "workspace",
      "path": "assets/env/studio.hdr"
    }
  }
}
```

新增字段：

| 字段 | 说明 |
|------|------|
| `storageMode` | `'bundle-memory'`（Live2D 零解包，数据从 zip 内存读取）或 `'disk'`（物理解包到磁盘） |
| `dimensions` | 仅 `bundle-memory` 模式：zip 内各维度的元数据索引，避免每次恢复时重新解析 zip |
| `importedTo` | 仅 `disk` 模式：解包目标路径 |

三种 `source` 类型：

| source | 含义 | 恢复方式 |
|--------|------|----------|
| `workspace` | 文件在工作区内，已提交 git | 无需恢复 |
| `import` + `bundle-memory` | Live2D zip 导入，零解包 | 检查 zip 存在 + hash → 重新从 zip 内存加载 |
| `import` + `disk` | 3D 模型 zip 导入，已解包 | 用户重新提供原始 zip → 自动解包到 `importedTo` |
| `market` | 来自 Market 全局安装 | 检查 InstalledRegistry → 未安装则提示安装 |

#### 10.3 项目打开恢复流程

```
项目打开 → 扫描 neko/assets/manifest.json
  │
  ├─ source: workspace
  │    → 检查文件存在 → ✓ 或标记 missing
  │
  ├─ source: market
  │    → 检查 InstalledRegistry 是否已安装
  │    ├─ 已安装 + 版本匹配 → ✓
  │    ├─ 已安装 + 版本不匹配 → 提示 "需要更新到 x.y.z"
  │    └─ 未安装 → 提示 "项目需要 {packageId}，是否安装？"
  │
  └─ source: import
       ├─ storageMode: bundle-memory（Live2D zip）
       │    → 检查 originalFile（zip）是否存在
       │    ├─ 存在 + hash 匹配 → ✓（打开 .nkp 时自动从 zip 内存加载）
       │    ├─ 存在 + hash 不匹配 → 提示 "zip 已变更，重新导入以更新元数据"
       │    └─ 不存在 → 提示 "缺少 {originalFile}，请重新提供 zip"
       │
       └─ storageMode: disk（3D 模型 zip 解包）
            → 检查 importedTo 路径是否存在
            ├─ 存在 + hash 匹配 → ✓
            ├─ 存在 + hash 不匹配 → 提示 "资产已变更，建议重新导入"
            └─ 不存在 → 提示 "缺少 {originalFile}，请重新导入"
                 → 用户选择 zip → 校验 hash → 解包到 importedTo
```

#### 10.4 manifest.json 维护时机

| 事件 | 动作 |
|------|------|
| ImportDispatcher 完成导入 | 写入 `source: "import"` 条目，记录 contentHash |
| Market 包 onPostInstall | 写入 `source: "market"` 条目，记录 packageId + version |
| 用户在工作区内直接操作资产 | 写入 `source: "workspace"` 条目 |
| 资产删除/卸载 | 移除对应条目 |
| Market 包更新 | 更新 version 字段 |

#### 10.5 与 library.json 的关系

```
neko/assets/manifest.json  — "项目需要什么"（依赖声明，类比 package.json）
neko/assets/library.json   — "项目有什么"（实际引用，类比 node_modules 状态）

manifest.json 是 library.json 的子集:
  manifest.json 只记录外部来源资产（import + market）
  library.json 记录所有资产（含 workspace 内的）
  workspace 内资产不需要 manifest 条目（git 已管理）
```

---

## 迁移计划

### Phase 1: Foundation (P0)

| PR | 标题 | 内容 | 依赖 | 估时 |
|----|------|------|------|------|
| PR-1 | `refactor(puppet): remove INP entrypoints` | 移除新建/导入/直接打开流程中的 .inp 入口；更新 i18n、类型注释和格式契约 | - | 1d |
| PR-2 | `feat(types): add bundle locator + model/import contracts` | extension-api.ts 新增 NekoModelAPI；新增 ImportHandler 类型契约；新增 BundleEntryLocator / storageMode 类型。仅类型，不引入 fs/vscode/AdmZip | - | 1d |
| PR-3 | `feat(model): implement NekoModelAPI` | ModelEditorProvider 实现接口，从 extension 导出；复用已有 SceneSnapshot / engine 类型 | PR-2 | 1d |
| PR-4 | `feat(model): add AgentCapabilityProvider` | 3 个 AI 工具 + extension.ts 注册；query 工具标记 readOnly，editing 工具按现有确认策略处理 | PR-3 | 1.5d |
| PR-5 | `feat(puppet): define MOC3 external texture channel` | 明确 textures PNG 从 bundle loader 到 Webview Canvas / engine atlas 的数据通道；补 EngineClient 或 webview message 类型；单元测试覆盖空纹理/索引映射 | PR-2 | 1.5d |
| PR-6 | `feat(puppet): Live2D zip bundle loader` | loadLive2dBundle + model3.json 解析 + bundlePath#entryPath locator + zip 安全校验 + 命令注册 + 单元测试 | PR-1, PR-5 | 2d |
| PR-7 | `feat(assets): ImportDispatcher + zip sniffing` | host-vscode/neko-assets 实现统一导入调度器 + zip 内容检测 + 子包路由；shared 仅保留类型 | PR-2, PR-6 | 2d |

### Phase 2: Discovery + Market + 解耦资产 (P1)

| PR | 标题 | 内容 | 依赖 | 估时 |
|----|------|------|------|------|
| PR-8 | `feat(search): project asset dimension projection` | 扩展 AssetLibraryProjectSearchAdapter，支持 mediaKind / assetDimension / storageMode / bundlePath#entryPath；避免同 partition 多 adapter 覆盖 | PR-7 | 1d |
| PR-9 | `feat(puppet): register bundle-memory assets` | Live2D zip 导入后写 AssetLibrary 虚拟维度记录，ProjectSearch 可发现 model/motion/config | PR-6, PR-8 | 1d |
| PR-10 | `feat(model): register model assets` | .nkm/.glb/.gltf/.vrm 导入后写 AssetLibrary 记录，ProjectSearch 可发现 3D model/motion/config 元数据 | PR-7, PR-8 | 1d |
| PR-11 | `feat(model): add market InstallTargets` | ModelAssetInstallTarget (model-3d) + ModelMotionInstallTarget (model-motion) + ModelConfigInstallTarget (model-config) + 注册 | - | 1d |
| PR-12 | `feat(puppet): add PuppetModelInstallTarget + PuppetConfigInstallTarget` | 完整模型分发 (puppet-model) + 配置分发 (puppet-config)，配合 bundle loader | PR-6 | 1d |
| PR-13 | `feat(market): add VoicePackInstallTarget` | 通用语音包分发 (voice-pack)，音频 + viseme 时间轴，puppet/model 共享 | - | 0.5d |
| PR-14 | `feat(market): extend BundleMetadata bundleType` | 新增 `'motion-pack'` bundleType，更新校验逻辑 | - | 0.5d |

### Phase 3: 导出能力 (P1)

| PR | 标题 | 内容 | 依赖 | 估时 |
|----|------|------|------|------|
| PR-15 | `feat(puppet): single-asset export commands` | 导出模型 zip / 动作 zip / 配置 zip 三个命令 | PR-6 | 1.5d |
| PR-16 | `feat(model): single-asset export commands` | 导出动作 (.nkma) / 配置 (material+VRM expressions) 两个命令（模型导出已有） | - | 1d |
| PR-17 | `feat(types): .nkentity format + entity export` | 统一实体导出格式定义 + `neko.entity.export` 命令 | PR-9, PR-10 | 1d |
| PR-18 | `feat(market): character-pack export` | 实体 + 绑定资产 → bundle manifest + zip 打包 | PR-17 | 1.5d |

### Phase 4: 素材管理统一 + Git 同步 (P1)

| PR | 标题 | 内容 | 依赖 | 估时 |
|----|------|------|------|------|
| PR-19 | `feat(assets): asset manifest for git sync` | `neko/assets/manifest.json` 格式定义 + 读写服务 + 项目打开时恢复检查 | PR-7 | 2d |
| PR-20 | `feat(assets): AssetLibrary sourceOrigin + sourceHash` | AssetFile 增加来源追踪 + 完整性校验，ImportDispatcher 写入时自动记录 | PR-19 | 1d |
| PR-21 | `feat(puppet): integrate AssetLibrary refs` | .nkp 新增可选 `assetRef` 字段，导入流程写 manifest.json + library.json | PR-19, PR-20 | 1.5d |
| PR-22 | `feat(model): integrate AssetLibrary refs` | .nkm 新增可选 `assetRef` 字段，导入流程写 manifest.json + library.json | PR-19, PR-20 | 1.5d |

### Phase 5: P2 Design Docs

| PR | 标题 | 内容 | 依赖 | 估时 |
|----|------|------|------|------|
| PR-23 | `docs: voice pack + lip-sync design` | ILipSyncDriver 详细设计 + viseme 映射表 + ML 路线 | - | 0.5d |
| PR-24 | `docs: PSD-to-puppet bridge design` | IPsdToPuppetBridge 详细设计 + 图层映射规则 | - | 0.5d |

**总计**: Phase 1 约 10d，Phase 2 约 5.5d，Phase 3 约 5d，Phase 4 约 6d，Phase 5 约 1d。24 PR，~27.5d。

# 本地模型运行时架构

> 关联：[marketplace.md](./marketplace.md) · [registry-server.md](./registry-server.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## 一、背景

Neko Suite 的 AI 生成能力（图片/视频/音频/TTS/LLM）当前全部依赖云端 API（OpenAI / Runway / Luma / Suno 等 10+ adapter）。用户需要本地部署模型以实现离线创作、隐私保护、成本控制。

### 现状

| 能力 | 云端（已有） | 本地（待建） |
|------|------------|------------|
| LLM 对话 | ✅ Anthropic/OpenAI/Google | Ollama（adapter 已有，缺 `onPostInstall` 注册） |
| 图片/视频/音频生成 | ✅ 10+ adapter | 云端足够，本地质量不如云端 |
| Upscale/Denoise/CLIP/STT | ❌ | neko-engine ONNX 原生（零外部依赖） |

---

## 二、核心架构决策

### 决策 1：不创建 neko-runtime 包

**结论**：本地模型管理通过现有包完成，不新建独立包。

**理由**：所有需求可归入现有包的职责范围内：

| 需求 | 归属 | 代码量 |
|------|------|--------|
| 模型安装后注册到运行时 | neko-market `ModelInstallTarget.onPostInstall()` | ~80 行 |
| Ollama 进程按需启动 | 同上内部辅助函数 `ensureOllamaRunning()` | ~50 行 |
| ONNX 推理 | neko-engine 内部 Rust 模块（`ort` crate） | ~700 行 Rust |
| EngineClient 模型方法 | neko-client | ~60 行 |
| ModelMetadata 类型扩展 | neko-types | ~10 行 |

**何时需要 runtime 包**：当多个扩展需要共享进程编排状态时（如 neko-market + neko-agent + neko-cut 同时争抢 Ollama 启停）。目前不存在这种场景。演进原则：YAGNI。

### 决策 2：外部运行时用户自行管理，通过 Provider / MCP 接入

**结论**：Ollama / ComfyUI / LocalAI 等外部运行时由用户自行安装和启停，通过 neko-agent 已有的 Provider 配置或 MCP Server 接入。

| 运行时 | 用户操作 | 接入方式 |
|--------|---------|---------|
| Ollama | `brew install ollama` 或官网安装 | Provider：`{ type: "ollama", apiUrl: "http://localhost:11434/api" }` |
| 远程 Ollama | 团队部署 | Provider：`{ type: "ollama", apiUrl: "https://ollama.company.com/api" }` |
| ComfyUI | 安装 ComfyUI Desktop | MCP Server（comfyui-mcp）或 Provider |
| LocalAI | Docker 运行 | Provider：`{ type: "openai", apiUrl: "http://localhost:8080/v1" }` |
| 任意 OpenAI 兼容 | 用户自选 | Provider：`{ type: "openai", apiUrl: "..." }` |

**neko-market 安装 GGUF 模型时例外**：`onPostInstall` 会自动调用 `ensureOllamaRunning()` + `ollama create`，因为这是一次性操作（安装时需要 Ollama 在运行），不属于"持续管理"。

### 决策 3：neko-engine 嵌入 ONNX Runtime 原生处理轻量 ML 任务

**结论**：通过 `ort` crate 将 ONNX Runtime 编译进 neko-engine，原生支持 upscale / denoise / CLIP / Whisper STT。

**理由**：
- `ort` crate 生产级，比 Python 快 3-5x，省 60-80% 内存
- 编译进 Engine 二进制，用户零感知，无外部依赖
- 模型小（10-100MB），推理快（< 1s）

### 决策 4：媒体生成继续走云端，未来通过 Engine candle 逐步原生化

**结论**：图片/视频/音频生成当前继续使用云端 API。未来 candle 成熟后（推理速度 < PyTorch 2x 且支持 Flux），嵌入 neko-engine 原生处理。

**Rust 推理生态现状**（2026）：

| 框架 | 图片生成 | 性能 vs Python | 结论 |
|------|---------|---------------|------|
| candle (HuggingFace) | SD 1.5/2.1/SDXL/Turbo | ⚠️ 慢 4x | 等性能改善 |
| ort (ONNX Runtime) | 支持但需 ONNX 格式模型 | ✅ 快 3-5x | 用于轻量任务 |
| candle Flux 支持 | ❌ 不支持 | — | 等待 |

---

## 三、实现方案

### 3.1 neko-market ModelInstallTarget（~80 行 TS 改动）

```typescript
// ModelInstallTarget.onPostInstall()
async onPostInstall(manifest: AssetManifest, installedPath: string): Promise<void> {
  const meta = manifest.typeMetadata;
  if (meta?.type !== 'model') return;

  switch (meta.data.framework) {
    case 'gguf':
      await this.ensureOllamaRunning();
      await exec(`ollama create ${manifest.name} -f ${this.generateModelfile(installedPath)}`);
      await vscode.commands.executeCommand('neko.agent.refreshModels');
      break;

    case 'onnx':
      const { port } = await vscode.commands.executeCommand('neko.engine.ensureFrameServer');
      await new EngineClient(port).registerModel({
        name: manifest.name, path: installedPath, task: meta.data.task,
      });
      break;

    case 'safetensors':
    case 'pytorch':
      // 未来 Engine candle 支持后在此扩展
      // 当前仅下载到磁盘，用户通过 ComfyUI MCP/Provider 自行使用
      break;
  }
}

// onPreUninstall()
async onPreUninstall(manifest: AssetManifest, installedPath: string): Promise<void> {
  const meta = manifest.typeMetadata;
  if (meta?.type !== 'model') return;

  switch (meta.data.framework) {
    case 'gguf':
      await exec(`ollama rm ${manifest.name}`).catch(() => {});
      break;
    case 'onnx':
      const { port } = await vscode.commands.executeCommand('neko.engine.ensureFrameServer');
      await new EngineClient(port).unregisterModel(manifest.name).catch(() => {});
      break;
  }
}

// Ollama 辅助函数
private async ensureOllamaRunning(): Promise<void> {
  try {
    await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    return;
  } catch { /* not running */ }

  const installed = await this.isOllamaInstalled(); // which ollama
  if (!installed) throw new Error('Ollama not installed. Get it from https://ollama.com');

  spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
  await this.waitForReady('http://localhost:11434/api/tags', 10000);
}
```

### 3.2 neko-client EngineClient（~60 行 TS 新增）

```typescript
// 模型管理
async registerModel(opts: { name: string; path: string; task: string }): Promise<void> {
  await this.dispatch({ group: 'models', action: 'register', options: opts });
}
async unregisterModel(name: string): Promise<void> {
  await this.dispatch({ group: 'models', action: 'unregister', resourceId: name });
}
async listModels(): Promise<EngineModel[]> {
  const res = await this.dispatch({ group: 'models', action: 'list' });
  return res.data;
}

// 推理任务
async upscale(input: string, opts?: { model?: string; scale?: number }): Promise<string> {
  const res = await this.dispatch({ group: 'models', action: 'upscale', options: { input, ...opts } });
  return res.data.output;
}
async denoise(input: string, opts?: { model?: string }): Promise<string> { ... }
async clipScore(image: string, text: string): Promise<number> { ... }
async transcribe(audio: string, opts?: { language?: string }): Promise<TranscribeResult> { ... }
```

### 3.3 neko-engine Rust ML 模块（~700 行 Rust 新增）

```
engine-kernel/src/ml/
├── mod.rs              ML 模块入口 + OnnxModel 注册表
├── onnx_runtime.rs     ort Session 管理（lazy load + LRU unload）
├── upscale.rs          Real-ESRGAN / SwinIR 推理
├── denoise.rs          去噪模型推理
├── clip.rs             CLIP 语义打分
└── whisper.rs          Whisper STT 推理

host-api/src/controllers/models.rs
└── ModelsController 扩展：register / unregister / list / upscale / denoise / clip / transcribe
```

### 3.4 neko-types ModelMetadata（~10 行改动）

```typescript
export interface ModelMetadata {
  framework: 'onnx' | 'pytorch' | 'safetensors' | 'gguf';  // +gguf
  task:
    | 'chat' | 'embedding' | 'vision'
    | 'image-gen' | 'video-gen'
    | 'music-gen' | 'tts' | 'stt'
    | 'upscale' | 'denoise' | 'style-transfer' | 'clip'
    | string;
  size: number;
  quantization?: string;
  minVram?: number;
  architecture?: string;
  baseModel?: string;
}
```

---

## 四、用户体验流程

### 场景 1：市场安装 LLM → 本地对话

```
1. 用户在市场安装 "Llama 3 8B Q4"（GGUF）
2. onPostInstall → ensureOllamaRunning() → ollama create → refreshModels
3. neko-agent 模型选择器出现 "llama3-8b-q4 (Local)"
4. 选中 → 已有 OllamaAdapter → 本地对话
```

### 场景 2：媒体增强（Engine ONNX，对用户透明）

```
1. 用户在市场安装 "Real-ESRGAN 4x"（ONNX）
2. onPostInstall → EngineClient.registerModel()
3. 用户在 neko-cut 右键素材 → "Upscale 4x"
4. EngineClient.upscale() → Engine ONNX 推理 → 高清图
```

### 场景 3：ComfyUI 高级工作流（用户自行配置）

```
1. 用户自行安装 ComfyUI Desktop
2. neko-agent MCP 配置添加 comfyui-mcp，或 Provider 配置添加 ComfyUI 端点
3. Agent 通过 MCP/Provider 调用 ComfyUI 工作流
4. neko-suite 不管理 ComfyUI 进程
```

### 场景 4：远程 Ollama（团队共享）

```
1. 团队部署 Ollama 到服务器
2. 用户 Provider 配置：{ type: "ollama", apiUrl: "https://ollama.company.com/api" }
3. neko-agent → 已有 OllamaAdapter → 远程对话
```

---

## 五、实施路径

```
Phase M1 — 模型安装注册（~150 行 TS）
├── ModelMetadata 类型扩展（+gguf）
├── ModelInstallTarget.onPostInstall()（GGUF → Ollama，ONNX → Engine）
├── ModelInstallTarget.onPreUninstall()（清理）
├── ensureOllamaRunning() 辅助函数
└── 单元测试

Phase M2 — neko-engine ONNX 原生（~700 行 Rust + ~60 行 TS）
├── ort crate 集成到 engine-kernel（CUDA / Metal / DirectML 后端）
├── ML 模块：upscale / denoise / clip / whisper
├── ModelsController 扩展（register / list / unload + 推理 action）
├── EngineClient 模型方法
└── 端到端测试

Phase M3 — Engine candle 图片生成（待评估，~1000 行 Rust）
├── 前置条件：candle 推理速度 < PyTorch 2x 且支持 Flux
├── candle SD/SDXL 集成到 engine-kernel
├── EngineClient.generateImage()
├── onPostInstall safetensors → Engine candle 注册
└── neko-agent 本地图片生成路由（本地优先 + 云端回退）
```

### 代码量总结

| Phase | 代码量 | 外部依赖 | 用户负担 |
|-------|--------|---------|---------|
| M1 | ~150 行 TS | Ollama（用户自装） | 一行命令 |
| M2 | ~760 行 (Rust+TS) | **零**（编译进 Engine） | **无** |
| M3 | ~1000 行 Rust | **零**（编译进 Engine） | **无** |
| **总计** | **~1,910 行** | | |

---

## 六、演进路径（onPostInstall 逐步扩展）

```
现在（M1）：
  case 'gguf'  → Ollama
  case 'onnx'  → Engine ort
  case others  → 仅下载到磁盘

M2 完成后：
  case 'gguf'  → Ollama
  case 'onnx'  → Engine ort          ← upscale/denoise/clip/whisper
  case others  → 仅下载到磁盘

M3 完成后（candle 成熟）：
  case 'gguf'        → Ollama
  case 'onnx'        → Engine ort
  case 'safetensors' → Engine candle  ← 图片/TTS 本地生成
  case others        → 仅下载到磁盘

最终态：
  大部分模型 → Engine 原生处理（零外部依赖）
  LLM        → Ollama（或未来 Engine candle LLM）
  重量级视频  → 云端 API 或用户自行 ComfyUI
```

**趋势：外部进程递减，Engine 原生递增。不需要 neko-runtime 包管理外部进程。**

---

## 七、方案演进历史

| 版本 | 方案 | 代码量 | 否决原因 |
|------|------|--------|---------|
| v1 | 新建 neko-runtime：4 个运行时（Ollama+ComfyUI+ONNX+Python） | 4,660 行 | 过度复杂 |
| v2 | 新建 neko-runtime：LocalAI 统一 | 530 行 | 二进制仅 LLM；Docker 10-15GB |
| v3 | 新建 neko-runtime：Ollama + Engine ONNX | 1,100 行 | Ollama 管理可内联 |
| v4 | 新建 neko-runtime：删除 ComfyUI 管理 | 1,100 行 | 仍然多余 |
| **v5** | **不建包：onPostInstall + Engine 原生** | **~1,910 行** | **当前方案** |

---

*最后更新：2026-03-25（v5 最终方案：删除 neko-runtime 包，模型管理归入 neko-market onPostInstall + neko-engine ONNX/candle 原生）*

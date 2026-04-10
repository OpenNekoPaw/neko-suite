# neko-sketch 2D 创作功能差距分析

## 状态

Proposed

## 关联

- [sketch-2d-lighting.md](./sketch-2d-lighting.md) — 光照系统设计
- [controlnet-pipeline.md](./controlnet-pipeline.md) — E5 预处理器与 ControlNet 链路

---

## 一、背景

neko-sketch 已具备完整的 WebGL2 自研渲染管线和基础绘画能力，但与专业 2D 创作工具（Clip Studio Paint、Procreate、Krita）相比，仍有多项核心功能缺失。本文档盘点所有功能现状，识别差距，并按创作影响分级排序。

---

## 二、已完善的能力

| 类别 | 功能 | 关键文件 |
|------|------|----------|
| **画笔** | 7 种笔刷（铅笔/钢笔/水彩/喷枪/橡皮/马克笔/像素）+ 压感 + Catmull-Rom 插值 | `brush/brush-profiles.ts`, `brush/brush-engine.ts` |
| **图层** | CRUD + 分组 + 12 种混合模式 + 透明度 | `layer/layer-manager.ts`, `engine/shaders.ts` |
| **滤镜** | 10 个 GLSL 后处理（模糊/锐化/色温/曝光/色相饱和度/晕影/辉光/胶片颗粒/色差） | `engine/filter-registry.ts`, `engine/filter-shaders.ts` |
| **矢量** | 矩形/椭圆/多边形/星形/路径 + Canvas2D 渲染 | `tools/vector-tool.ts`, `engine/vector-renderer.ts` |
| **动画** | 逐帧 + 洋葱皮 + 时间线 + 精灵表导入导出 | `stores/slices/frameSlice.ts`, `components/FrameTimeline.tsx` |
| **场景** | 多场景 + 视差滚动 + 摄像机 + 5 种粒子大气 | `engine/parallax-renderer.ts`, `engine/particle-*.ts` |
| **像素** | 像素笔 + Bresenham 画线 + 泛洪填充 | `tools/pixel-tool.ts` |
| **选区** | 矩形选区 + 全选/反选/清除 | `selection/selection-manager.ts` |
| **AI 集成** | 文生图 / 内绘 / 风格迁移 / 自动分层（4 个 Agent 工具） | `extension/src/agentCapabilityProvider.ts` |
| **调色板** | PICO-8 / DB32 / Endesga 32 三套内置 | `components/PalettePanel.tsx` |
| **Morph** | 变形目标 + 关键帧动画引擎（无 UI 面板） | `engine/morph-engine.ts` |

---

## 三、缺失功能分级

### 3.1 第一梯队 — 核心绘画工具（P0，阻塞日常创作）

#### 图层蒙版 / 剪贴蒙版

- **现状**：`LayerData.clippingMask: boolean` 和 `maskLayerId: string | null` 字段已存在且被序列化，但 `RenderPipeline.compositeLayerStack()` **未实现蒙版合成逻辑**
- **影响**：无法非破坏性隐藏图层区域，这是图层操作的最基础能力
- **实施方向**：
  - 剪贴蒙版：合成循环中检测 `clippingMask` 标记，将当前图层的 alpha 限制为下方图层的 alpha（`min(layer.a, base.a)`）
  - 图层蒙版：为 `maskLayerId` 指向的灰度蒙版图层采样，乘入当前图层 alpha
  - 需修改 `engine/render-pipeline.ts` 的 ping-pong 合成循环

#### 自由变换（缩放 / 旋转 / 倾斜）

- **现状**：`ToolType` 枚举有 `'transform'`，有 Flip/Rotate90 上下文菜单实现，**无拖拽变换手柄**
- **影响**：调整素材大小和角度是极高频操作
- **实施方向**：
  - 激活变换时在图层/选区上叠加 8 个缩放手柄 + 旋转手柄
  - 拖拽计算仿射矩阵（scale + rotate + skew）
  - 确认时将矩阵应用到图层像素（WebGL FBO 重采样）
  - 类似 neko-canvas `useNodeResize.ts` + `useNodeRotate.ts` 的交互模式

#### 套索选区 / 魔棒选区

- **现状**：`ToolType` 枚举有 `'select-lasso'` 和 `'select-wand'`，工具栏按钮和光标映射已有，**SelectionManager 仅实现 `selectRect()`**
- **影响**：精确选区是上色/修改/内绘的基础
- **实施方向**：
  - 套索：记录拖拽路径点，闭合后扫描线填充生成 `SelectionMask` 位图
  - 魔棒：从点击位置出发做颜色容差泛洪（复用 `pixel-tool.ts` 的 BFS 算法框架）
  - 椭圆选区：补充 `selectEllipse()` 方法

#### Alpha Lock

- **现状**：完全缺失，无类型定义、无 UI、无渲染逻辑
- **影响**：在不改变图层透明度的前提下上色，动画/漫画上色的必备功能
- **实施方向**：
  - `LayerData` 新增 `alphaLock: boolean` 字段
  - 笔刷渲染到图层 FBO 时，使用 `blendFuncSeparate` 锁定 alpha 通道：`gl.blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ZERO, ONE)`
  - 图层面板新增锁定图标

---

### 3.2 第二梯队 — 专业提升（P1，提高效率和表现力）

#### 对称绘画

- **现状**：完全缺失
- **影响**：角色正面/图标/图案设计高频需求
- **实施方向**：
  - 支持垂直/水平/多轴（N 轴旋转）对称模式
  - 笔刷引擎 `addPoint()` 时，将输入点按对称轴镜像为 N 个点，同时渲染到同一图层 FBO
  - 对称轴可拖拽调整位置

#### Curves / Levels 色彩调整

- **现状**：滤镜仅有基础的亮度对比度/色相饱和度/曝光/色温
- **影响**：精确色彩控制是专业上色的基本工具
- **实施方向**：
  - **Curves**：UI 为可编辑贝塞尔曲线（R/G/B/Master 四通道），生成 256-entry 1D LUT 纹理，Shader 查表
  - **Levels**：黑点/白点/Gamma 三参数，映射到 `output = pow((input - black) / (white - black), 1/gamma)`
  - 注册为 `FilterRegistry` 新滤镜

#### 渐变工具

- **现状**：`neko-types/src/types/shape.ts` 有 `GradientFill`/`GradientStop`/`GradientType` 类型定义（用于 neko-cut 视频形状层），neko-sketch **未引用**
- **影响**：天空/背景/光影过渡的基本工具
- **实施方向**：
  - 线性/径向渐变拖拽工具（起点→终点定义方向和范围）
  - GLSL fragment shader 实现渐变插值
  - 可复用 `neko-types` 已有的 `GradientStop` 类型

#### 文本工具

- **现状**：`LayerType` 有 `'text'` 桩，**无任何实现**
- **影响**：漫画对白、标注、水印
- **实施方向**：
  - Canvas2D `fillText()` / `strokeText()` 渲染到离屏 canvas，再上传为 WebGL 纹理
  - 字体选择 + 大小 + 颜色 + 对齐 + 描边属性面板
  - 文本图层可随时编辑（双击进入编辑模式）

#### 参考图叠加

- **现状**：完全缺失，图片只能导入为图层
- **影响**：对照参考绘画是基本工作流
- **实施方向**：
  - 浮动参考窗口（HTML overlay，不参与图层合成）
  - 可调透明度、可缩放、可拖拽定位
  - 支持多张参考图

#### 克隆图章 / 修复画笔

- **现状**：完全缺失
- **影响**：纹理复制、瑕疵修复
- **实施方向**：
  - 克隆：Alt+点击定义源点，绘画时从源点偏移采样（Shader 中 `texture(u_layer, v_texCoord + u_offset)`）
  - 修复：克隆 + 周围颜色混合（简化版 content-aware）

#### 标尺 / 辅助线 / 网格吸附

- **现状**：neko-sketch 无（neko-canvas 有 `snapEngine.ts` 但未共享）
- **影响**：精确对齐和构图
- **实施方向**：
  - 水平/垂直标尺（SVG/Canvas2D overlay）
  - 可拖出辅助线 + 吸附
  - 可选网格（像素网格在 zoom≥4 时已有）

#### 画笔硬度暴露 + 倾斜影响

- **现状**：
  - `hardness` 字段在 `BrushSettings` 中存在，各笔刷 profile 有不同默认值，但 `BrushPanel.tsx` **未暴露滑块**，`render-pipeline.ts` 中 `u_hardness` **硬编码 0.7**
  - 倾斜数据 `tiltX`/`tiltY` 已采集并通过 Catmull-Rom 插值，但 `STROKE_FRAG` **未使用**
- **影响**：软硬笔刷切换是高频操作；倾斜影响是仿真笔锋的关键
- **实施方向**：
  - 硬度：`BrushPanel` 添加滑块 → `u_hardness` 从 `BrushSettings.hardness` 传入
  - 倾斜：将 `tiltX/tiltY` 作为顶点属性传入 `STROKE_VERT`，在 Fragment Shader 中影响笔刷形状（椭圆化 `gl_PointCoord`）

---

### 3.3 第三梯队 — 进阶功能（P2，差异化竞争力）

| 功能 | 现状 | 实施方向 |
|------|------|----------|
| **透视网格** | 完全缺失 | 1/2/3 点透视辅助线（SVG overlay + 吸附），消失点可拖拽 |
| **液化 / 网格变形** | morph-engine 做场景动画，无交互式液化 | 液化笔刷（推/拉/旋转/膨胀），基于网格顶点位移 + WebGL 重采样 |
| **网点 / 半调** | 完全缺失 | 注册为 FilterRegistry 滤镜，GLSL `mod(floor)` 圆点/线条图案 |
| **图案填充 / 纹理图章** | 完全缺失 | 可重复纹理 tiling shader + 笔刷 alpha 纹理替换 |
| **AI 外绘** | 仅有内绘 | 画布动态扩展 + ControlNet outpaint 模式 |
| **3D 模型参考** | neko-model 独立存在 | 跨包嵌入方案：neko-model 渲染→截图→sketch 参考叠加 |
| **渐变映射** | 完全缺失 | 滤镜：luminance → 1D 渐变 LUT 查表 |
| **PSD 导入** | 文件筛选器声明了 .psd，无解码 | `ag-psd` 或 `psd.js` 库解析 PSD 图层树 |
| **视口旋转** | `rotation` 字段已有，变换矩阵未应用 | `buildViewportTransform` 加入 rotation 分量 |
| **贝塞尔节点编辑** | 路径构建工具已有，无交互式拖拽 | 锚点+手柄 SVG overlay，拖拽更新 `PathSegment` |
| **自定义调色板** | 仅 3 个内置 | 新建/保存/导入导出 `.aco`/`.ase` 调色板 |

---

## 四、实施路线建议

```
P0 (核心绘画工具) ←── 解除日常创作阻塞
│
├── 4.1  图层蒙版 / 剪贴蒙版（render-pipeline 合成循环修改）
├── 4.2  自由变换（缩放/旋转/倾斜拖拽手柄）
├── 4.3  套索选区 + 魔棒选区（SelectionManager 扩展）
└── 4.4  Alpha Lock（blendFuncSeparate 锁定 alpha）
│
P1 (专业提升) ←── 提高效率和表现力
│
├── 4.5  对称绘画（笔刷引擎镜像点）
├── 4.6  Curves / Levels 滤镜
├── 4.7  渐变工具（线性/径向）
├── 4.8  画笔硬度 UI 暴露 + 倾斜 Shader
├── 4.9  文本工具
├── 4.10 参考图叠加
├── 4.11 克隆图章 / 修复画笔
└── 4.12 标尺 / 辅助线
│
P2 (进阶功能) ←── 差异化竞争力
│
├── 4.13 透视网格
├── 4.14 液化 / 网格变形
├── 4.15 网点 / 半调滤镜
├── 4.16 图案填充
├── 4.17 AI 外绘
├── 4.18 视口旋转
├── 4.19 贝塞尔节点编辑
├── 4.20 PSD 导入
└── 4.21 自定义调色板
```

### 依赖关系

```
图层蒙版 (4.1) ← 是剪贴蒙版和 Alpha Lock 的基础
套索选区 (4.3) ← AI 内绘效果依赖精确选区
自由变换 (4.2) ← 独立，无前置依赖
Curves/Levels (4.6) ← 独立，注册为滤镜
对称绘画 (4.5) ← 独立，修改笔刷引擎
渐变工具 (4.7) ← 渐变映射 (P2) 依赖此类型基础
画笔硬度 (4.8) ← 独立，解除硬编码
```

---

## 五、与其他 ADR 的协同

| 本文档功能 | 关联 ADR | 协同点 |
|-----------|---------|--------|
| P0 图层蒙版 | — | 独立实施 |
| P1 Curves/Levels | [sketch-2d-lighting.md](./sketch-2d-lighting.md) | 光照 + 色彩调整共同提升画面质量 |
| P1 克隆图章 | — | 独立实施 |
| P2 AI 外绘 | [controlnet-pipeline.md](./controlnet-pipeline.md) | 依赖 ControlNet 链路打通 + outpaint 模式 |
| P2 液化 | [sketch-2d-lighting.md](./sketch-2d-lighting.md) | 液化变形需考虑法线贴图同步变形 |
| P2 3D 参考 | neko-model 已有 R3F 渲染 | 跨包截图通信方案 |

---

## 六、结论

neko-sketch 在渲染管线和基础绘画方面已有坚实基础，但 **4 项 P0 功能（蒙版、变换、选区、Alpha Lock）** 是日常创作的硬性阻塞。P1 的 8 项功能（对称、曲线、渐变、文本、参考图、克隆、标尺、硬度/倾斜）决定了工具的专业度。P2 的 9 项功能是与竞品的差异化竞争力。建议按 P0 → P1 → P2 顺序逐步推进，优先解除创作阻塞。

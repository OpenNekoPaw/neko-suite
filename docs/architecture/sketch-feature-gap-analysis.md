# neko-sketch 2D 创作功能差距分析

## 状态

Proposed

## 关联

- [sketch-2d-lighting.md](./sketch-2d-lighting.md) — 光照系统设计
- [controlnet-pipeline.md](./controlnet-pipeline.md) — E5 预处理器与 ControlNet 链路
- [canvas-role-boundary.md](./canvas-role-boundary.md) — neko-canvas 与 neko-sketch 职责边界
- [format-strategy.md](./format-strategy.md) — `.nks` 格式与编辑操作约束

---

## 一、背景

neko-sketch 已具备完整的 WebGL2 自研渲染管线和基础绘画能力，但与专业 2D 创作工具（Clip Studio Paint、Procreate、Krita）相比，仍有多项核心功能缺失。本文档盘点所有功能现状，识别差距，并按创作影响分级排序。

---

## 二、对标 Adobe 的图片创作链路

结合 Adobe 当前公开的 Firefly、Photoshop、Adobe Express 能力，成熟图片创作链路并不是“先生成，再加几个滤镜”这么简单，而是一个完整的收口流程：

1. **生成 / 导入**：文生图、参考图、生图后导入、局部生成、扩图
2. **精修 / 修饰**：选区、蒙版、对象移除、局部修复、人像修饰
3. **精确调色**：曝光、白平衡、曲线、色阶、色相饱和度、自然饱和度、色彩平衡
4. **风格化 / Look**：滤镜、LUT、胶片颗粒、辉光、风格迁移
5. **交付 / 回流**：导出、回写、跨模块工作流

对 `neko-sketch` 的启示：

- **调色是 P0 核心能力**，不是可选增强。没有非破坏式调色，就无法把 AI 生成图、导入图和手绘稿稳定收口。
- **滤镜是需要的，但不是基础盘**。滤镜更适合作为“快速出片”和“风格复用”能力，优先级低于调色和局部修复。
- **美颜不应狭义理解为消费级一键磨皮**。对创作软件来说，更合理的产品定义是“人像修饰 / 局部修复”，包括祛瑕、肤质平滑、局部提亮、修复画笔、内容感知修补。如果产品目标包含头像、封面、人像插画，这组能力就应进入 `P1`。

---

## 三、已完善的能力

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

### 3.1 当前后期链路的结构性限制

虽然 `neko-sketch` 已经有滤镜面板和 AI 工具入口，但离“正式的图片修图链路”还差几个关键结构：

- **滤镜仍是全局运行时状态**：`stores/slices/filterSlice.ts` 使用单一 `filters: AppliedFilter[]`，没有图层级、调整图层级或蒙版级归属。
- **滤镜应用位置过晚**：`engine/render-pipeline.ts` 在整张图层合成完成后再套 `filterFn`，天然不适合单层、局部和非破坏式调色。
- **`.nks` 未保存后期参数**：`utils/document-serializer.ts` 当前只保存画布、图层像素和视口，不保存滤镜栈、调色参数和调色板状态。
- **图层级 AI 读数不准确**：`App.tsx` 中 `request:layerImageData` 仍返回整张 composite canvas，导致局部修复和单层 style transfer 精度不足。
- **选区能力不足**：`ToolType` 虽预留 `select-lasso` / `select-wand`，但 `selectionSlice.ts` 仅有矩形 / 全选 / 反选。
- **调整图层只有类型桩，没有实现**：`LayerType` 已含 `'adjustment'`，但不存在对应数据模型、UI 和渲染路径。

---

## 四、缺失功能分级

### 4.1 第一梯队 — 核心绘画工具（P0，阻塞日常创作）

#### 非破坏式调色 / 调整图层

- **现状**：
  - 当前仅有基础亮度对比度 / HSL / 曝光 / 色温等滤镜
  - `LayerType` 虽有 `'adjustment'`，但无实现
  - 滤镜未进入 `.nks` 正式序列化
- **影响**：
  - 无法完成导入图、AI 生图、手绘稿的最终收口
  - 无法建立可复用、可撤销、可导出的专业调色工作流
- **实施方向**：
  - 以 **调整图层** 形式落地 `Curves / Levels / Exposure / White Balance / Tint / Vibrance / Color Balance`
  - 支持作用域：整图、单图层、选区、蒙版
  - 将参数纳入 `.nks` 序列化与 EditOperation 体系
  - 补充直方图和 Before/After 预览作为 `P0.5/P1`

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

### 4.2 第二梯队 — 专业提升（P1，提高效率和表现力）

#### 对称绘画

- **现状**：完全缺失
- **影响**：角色正面/图标/图案设计高频需求
- **实施方向**：
  - 支持垂直/水平/多轴（N 轴旋转）对称模式
  - 笔刷引擎 `addPoint()` 时，将输入点按对称轴镜像为 N 个点，同时渲染到同一图层 FBO
  - 对称轴可拖拽调整位置

#### 滤镜正式化 / Look Presets / LUT

- **现状**：
  - 现有 10 个 GLSL 滤镜可实时预览，但仍偏运行时效果栈
  - 缺少图层级归属、预设系统、LUT 导入导出和结果保存
- **影响**：
  - 只能“看起来有滤镜”，还不能形成可复用的风格资产
  - 不利于和 `neko-assets`、`neko-canvas`、`neko-cut` 建立一致的风格回流
- **实施方向**：
  - 设计三层作用域：文档级 Look、图层级滤镜栈、调整图层级滤镜
  - 支持预设保存、拷贝粘贴滤镜栈、强度滑杆、A/B 预览
  - 支持 `cube/png` 等 LUT 导入导出，作为风格资产接入市场和资产库

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

#### 人像修饰 / 局部修复（美颜语义收敛版）

- **现状**：没有肤质平滑、祛瑕、局部提亮、皮肤区域蒙版、面部局部修复链路
- **影响**：
  - 如果目标场景包含头像、封面、人像插画，当前无法在 `neko-sketch` 内完成最终修脸和肤质整理
  - 只能依赖外部工具，削弱“一站式创作”定位
- **实施方向**：
  - 第一阶段：`Spot Heal / Healing Brush / Dodge & Burn / Blemish Removal`
  - 第二阶段：皮肤区域检测 + 局部平滑 + 眼白/牙齿提亮
  - 产品边界上优先做“修饰 / 修复”，不优先做消费级“瘦脸 / 大眼 / 脸型重塑”

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

### 4.3 第三梯队 — 进阶功能（P2，差异化竞争力）

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

## 五、实施路线建议

```
P0 (核心绘画工具) ←── 解除日常创作阻塞
│
├── 5.1  非破坏式调色 / 调整图层（Curves/Levels/White Balance/Vibrance）
├── 5.2  图层蒙版 / 剪贴蒙版（render-pipeline 合成循环修改）
├── 5.3  自由变换（缩放/旋转/倾斜拖拽手柄）
├── 5.4  套索选区 + 魔棒选区（SelectionManager 扩展）
└── 5.5  Alpha Lock（blendFuncSeparate 锁定 alpha）
│
P1 (专业提升) ←── 提高效率和表现力
│
├── 5.6  对称绘画（笔刷引擎镜像点）
├── 5.7  滤镜正式化 / Look Presets / LUT
├── 5.8  渐变工具（线性/径向）
├── 5.9  画笔硬度 UI 暴露 + 倾斜 Shader
├── 5.10 文本工具
├── 5.11 参考图叠加
├── 5.12 克隆图章 / 修复画笔
├── 5.13 人像修饰 / 局部修复
└── 5.14 标尺 / 辅助线
│
P2 (进阶功能) ←── 差异化竞争力
│
├── 5.15 透视网格
├── 5.16 液化 / 网格变形
├── 5.17 网点 / 半调滤镜
├── 5.18 图案填充
├── 5.19 AI 外绘
├── 5.20 视口旋转
├── 5.21 贝塞尔节点编辑
├── 5.22 PSD 导入
└── 5.23 自定义调色板
```

### 依赖关系

```
调整图层 (5.1) ← 滤镜正式化、LUT、导出回流的基础
图层蒙版 (5.2) ← 剪贴蒙版、局部调色、局部修复的基础
套索选区 (5.4) ← AI 内绘、人像修饰、局部调色依赖精确选区
自由变换 (5.3) ← 独立，无前置依赖
对称绘画 (5.6) ← 独立，修改笔刷引擎
渐变工具 (5.8) ← 渐变映射 (P2) 依赖此类型基础
画笔硬度 (5.9) ← 独立，解除硬编码
人像修饰 (5.13) ← 依赖选区、局部蒙版、单层图像读写
```

---

## 六、与其他 ADR 的协同

| 本文档功能 | 关联 ADR | 协同点 |
|-----------|---------|--------|
| P0 调整图层 / 调色 | [sketch-2d-lighting.md](./sketch-2d-lighting.md) | 光照 + 调色共同构成画面收口能力 |
| P0 图层蒙版 | — | 独立实施 |
| P1 滤镜正式化 / LUT | [format-strategy.md](./format-strategy.md) | 需要进入 `.nks` 契约并支持跨模块回流 |
| P1 克隆图章 / 人像修饰 | — | 独立实施 |
| P2 AI 外绘 | [controlnet-pipeline.md](./controlnet-pipeline.md) | 依赖 ControlNet 链路打通 + outpaint 模式 |
| P2 液化 | [sketch-2d-lighting.md](./sketch-2d-lighting.md) | 液化变形需考虑法线贴图同步变形 |
| P2 3D 参考 | neko-model 已有 R3F 渲染 | 跨包截图通信方案 |

---

## 七、结论

neko-sketch 在渲染管线和基础绘画方面已有坚实基础，但若要对标 Adobe 这类“生成 + 修图 + 收口”的图片创作链路，优先级需要重新校准：

- **P0 先补调色，不要先堆滤镜**。调整图层、蒙版、精确选区、自由变换、Alpha Lock 才是可日常生产的底盘。
- **P1 再把滤镜做成正式资产能力**。现有 GLSL 滤镜适合作为预览和原型，但需要进入 `.nks`、进入图层模型、进入跨模块工作流，才算真正补齐。
- **“美颜”应收敛成“人像修饰 / 局部修复”能力**。如果产品目标包含头像、封面、人像插画，这组能力应提到 `P1`；否则可以延后到 `P2`。

建议按 **P0 调色与基础编辑 → P1 风格化与局部修饰 → P2 差异化高级能力** 的顺序推进，而不是把“滤镜数量”误判为功能完整度。

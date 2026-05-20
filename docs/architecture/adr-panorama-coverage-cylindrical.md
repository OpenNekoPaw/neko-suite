# ADR: 全景覆盖角度与柱状投影 (Panorama Coverage Angle & Cylindrical Projection)

> 状态：**Accepted / Implemented (2026-05-21)**
> 关联：[adr-panoramic-image-preview.md](./adr-panoramic-image-preview.md) · [adr-engine-preview-subsystem.md](./adr-engine-preview-subsystem.md) · [format-strategy.md](./format-strategy.md) · [OpenSpec archive: add-panorama-coverage-cylindrical](../../openspec/changes/archive/2026-05-21-add-panorama-coverage-cylindrical/)

---

## 一、背景与动机

### 1.1 问题

neko-preview 当前全景预览系统假定所有全景图片/视频都是 **360° equirectangular 投影**（宽高比 2:1，水平 360°、垂直 180°）。实际创作中存在大量**非 360° 的宽幅全景图片**：

| 全景类型 | 典型宽高比 | 投影方式 | 当前检测 | 当前渲染 |
|---------|-----------|---------|---------|---------|
| 360° equirectangular | 2:1 | 球面 | GPano / 文件名 / 宽高比 | 球面 shader ✅ |
| 180° 半球全景 | 1:1 | 球面（半球） | 无 ❌ | 无 ❌ |
| 柱状拼接全景 | 2.5:1 ~ 4:1 | 柱状（cylindrical） | 无 ❌ | 无 ❌ |
| 超宽柱状全景 | >4:1 | 柱状 | 无 ❌ | 无 ❌ |

**触发案例**：`shanghai-morning.jpg`（9060×2966，ratio 3.05:1）——Photoshop CS4 拼接的上海城市全景。检测系统全部失败：

- 无 GPano XMP 元数据（2012 年文件，GPano 规范尚未普及）
- 文件名无 `360`/`pano`/`equirect` 关键词
- 宽高比 3.05:1 远超 2:1 ±2% 的 equirectangular 启发式阈值
- XMP `dc:subject` 含 `panorama`/`panoramic` 标签，但系统不读取此信号

即使手动以全景方式打开，当前球面 shader 也会产生**严重的极点畸变**——柱状全景不覆盖天顶和天底，强行映射到球面会在上下边缘严重拉伸。

### 1.2 核心矛盾

| 维度 | Equirectangular | Cylindrical |
|------|----------------|-------------|
| 水平覆盖 | 360° | 任意角度（通常 90°~270°） |
| 垂直覆盖 | 180°（天顶到天底） | 受限（通常 60°~120°） |
| UV 映射 | 经纬度 → 球面 | 水平经度 + 垂直线性透视 |
| 极点行为 | 极点处收敛到一个点 | 无极点，上下边界是直线 |
| 适用场景 | 360° 相机、VR | 单反水平拍摄 + 拼接 |

**结论**：需要同时引入 **coverage angle 元数据**（区分 180°/360°/任意角度）和 **cylindrical 投影类型**（为非球面全景提供正确的渲染路径）。

---

## 二、设计决策

### D1: 新增 `cylindrical` 投影类型

**决策**：在 `PreviewProjectionType` 中新增 `'cylindrical'` 枚举值，与 `equirectangular` 平级，拥有独立的 WebGL shader 渲染路径。

**备选方案（否决）**：复用 `equirectangular` + 通过 `coverageAngle` 约束可视范围。否决原因：两者的 UV 映射数学根本不同（球面 `asin` vs 线性透视），共用 shader 无法消除极点畸变。

### D2: 引入 `PanoramaCoverageAngle` 元数据

**决策**：为所有全景投影添加可选的覆盖角度描述：

```typescript
interface PanoramaCoverageAngle {
  readonly horizontalDeg: number;  // 0 < h <= 360
  readonly verticalDeg: number;    // 0 < v <= 180
}
```

- equirectangular 默认 `{ 360, 180 }`，GPano `CroppedAreaImageWidthPixels < FullPanoWidthPixels` 时自动计算实际覆盖
- cylindrical 从图片宽高比估算 `horizontalDeg`，`verticalDeg` 由 aspect ratio 推算或用户指定；柱状垂直覆盖表示切平面视角（`tan(verticalDeg / 2)`），不是球面纬度范围
- coverage 是**资产属性**，存在 `PreviewProjectionMetadata` 中，不污染 `PanoramaViewState`（视图状态）

### D3: 检测策略——柱状全景仅手动触发

**决策**：对于没有 GPano 元数据、没有文件名关键词的宽幅图片，**不做自动检测**。用户通过右键 "Open as Panorama" 手动触发。

**理由**：
- `dc:subject` 标签和宽高比组合的误判率过高（超宽电影剧照、banner 图、拼接非全景图）
- 柱状全景没有标准化的元数据字段（不像 equirectangular 有 GPano）
- 手动触发后通过 sidecar `.nkmeta.json` 持久化，后续自动识别

**增强检测**：文件名关键词扩展，新增 `halfpano`、`180pano`、`pano180` 组合匹配：
```
/(^|[._-])(pano|360|halfpano|180pano|pano180|equirect|equirectangular)([._-]|$)/i
```

> **注意**：不单独匹配 `180`——`photo_180.jpg`（像素尺寸）、`IMG_1800.jpg`（序号）等误判率过高。仅接受带 `pano` 的组合信号（`halfpano`、`180pano`、`pano180`）。

### D4: GPano coverage 解析（equirectangular 增强）

**决策**：增强现有 GPano 检测，从 substring-presence 升级为 value-extraction。解析以下字段计算实际覆盖：

| GPano 字段 | 用途 |
|-----------|------|
| `FullPanoWidthPixels` | 完整 360° 宽度（像素） |
| `CroppedAreaImageWidthPixels` | 实际图片覆盖的宽度 |
| `FullPanoHeightPixels` | 完整 180° 高度 |
| `CroppedAreaImageHeightPixels` | 实际覆盖的高度 |

覆盖计算：
```
horizontalDeg = (CroppedWidth / FullWidth) * 360
verticalDeg   = (CroppedHeight / FullHeight) * 180
```

如果只有 `FullPanoWidthPixels` 无 `CroppedArea` → 图片即全覆盖 → 360×180。

### D5: CoverageAngle 校验与归一化

**决策**：`PanoramaCoverageAngle` 在**所有入口**（TS 解析、Rust 反序列化、sidecar 读取、GPano 推算）统一归一化：

| 输入 | 归一化行为 |
|------|-----------|
| `NaN` / `undefined` | 回退默认值 `{ 360, 180 }` |
| `horizontalDeg <= 0` | 回退 360 |
| `verticalDeg <= 0` | 回退 180 |
| `horizontalDeg > 360` | clamp 到 360 |
| `verticalDeg > 180` | clamp 到 180 |

**实现**：

```typescript
// TS（@neko/shared 或 preview.ts）
function normalizeCoverageAngle(raw?: PanoramaCoverageAngle): PanoramaCoverageAngle {
  const h = raw?.horizontalDeg;
  const v = raw?.verticalDeg;
  return {
    horizontalDeg: (h && h > 0 && Number.isFinite(h)) ? Math.min(h, 360) : 360,
    verticalDeg:   (v && v > 0 && Number.isFinite(v)) ? Math.min(v, 180) : 180,
  };
}
```

```rust
// Rust（image_analysis.rs）
impl PanoramaCoverageAngle {
    pub fn normalized(self) -> Self {
        Self {
            horizontal_deg: if self.horizontal_deg > 0.0 && self.horizontal_deg.is_finite() {
                self.horizontal_deg.min(360.0)
            } else { 360.0 },
            vertical_deg: if self.vertical_deg > 0.0 && self.vertical_deg.is_finite() {
                self.vertical_deg.min(180.0)
            } else { 180.0 },
        }
    }
}
```

**调用点**：
- `sidecar.rs` 的 `read_sidecar()` 返回后
- `image_analysis.rs` 的 `parse_gpano_coverage()` 返回前
- `host-api/preview.rs` 的 `update_asset_metadata()` 写入 sidecar 前
- TS `PanoramicImagePreviewProvider` 解析 webview 消息时

### D6: ViewState 约束——FOV 感知的 yaw/pitch clamping

**决策**：当 `coverageAngle.horizontalDeg < 360` 时，ViewStateController 将 yaw 限制在：

```
maxYaw = max(0, coverageH/2 - fov/2)
yaw ∈ [-maxYaw, +maxYaw]
```

效果：
- 放大（FOV 小）→ 可平移范围增大
- 缩小（FOV 大到超过覆盖宽度）→ yaw 锁定为 0
- 360° 覆盖 → 保持当前自由 wrap 行为

pitch 同理：`maxPitch = max(0, coverageV/2 - fov/2)`。

### D7: 原子更新消息——统一 Save Default 语义

**问题**：当前 webview → extension 存在两个独立消息：
- `panorama:saveDefaultView` — 仅传 `viewState`（调用 `updatePreviewAssetMetadata({ defaultViewState })`)
- `panorama:confirmProjection` — 仅传 `projectionType`（调用 `updatePreviewAssetMetadata({ projectionType })`）

切换到 cylindrical 模式后用户点击 "Save Default"，需要**同时**保存 `projectionType: 'cylindrical'` + `coverageAngle` + `viewState`。两个分离消息会导致中间状态（projection 已更新但 viewState 尚未更新）和竞态。

**决策**：新增 `panorama:updateAsset` 原子更新消息，一次性传递所有需持久化的字段：

```typescript
// Webview → Extension
interface PanoramaUpdateAssetMessage {
  type: 'panorama:updateAsset';
  projectionType?: PreviewProjectionType;
  coverageAngle?: PanoramaCoverageAngle;
  defaultViewState?: PanoramaViewState;
}
```

Extension handler 调用单次 `updatePreviewAssetMetadata(assetId, { projectionType, coverageAngle, defaultViewState })`。

**向后兼容**：旧的 `panorama:saveDefaultView` 和 `panorama:confirmProjection` 保留但标记为 deprecated，内部重写为调用同一 `updatePreviewAssetMetadata()` 路径。新的 "Save Default" UI 统一发送 `panorama:updateAsset`。

### D8: 派生变体临时投影覆盖

**问题**：用户可以在 UI 中临时切换到 `cylindrical` 模式但尚未点击 "Save Default"，此时 manifest / sidecar 中的 `projectionType` 仍可能是 `equirectangular`。如果随后直接触发 FOV Crop / Export，engine 只按 manifest projection 渲染，会导致导出结果与当前预览不一致。

**决策**：`PreviewVariantRequest` 增加可选的临时投影覆盖字段，仅用于本次派生变体生成，不写入 sidecar：

```typescript
interface PreviewVariantRequest {
  // ... existing fields
  readonly projectionType?: PreviewProjectionType;
  readonly coverageAngle?: PanoramaCoverageAngle;
}
```

优先级：

```
request.projectionType / request.coverageAngle
  > manifest.projection.type / manifest.projection.coverageAngle
  > defaults
```

UI 行为：
- "Save Default" 发送 `panorama:updateAsset`，持久化 projection + coverage + defaultViewState
- "FOV Crop" / "Export" 始终在 request 中附带当前 UI mode 对应的 `projectionType` 与当前 `coverageAngle`
- 临时 request override 不改变 manifest，也不影响下次打开

### D9: Sidecar 持久化

**决策**：`.nkmeta.json` 扩展 `coverageAngle` 字段：

```json
{
  "projectionType": "cylindrical",
  "coverageAngle": { "horizontalDeg": 180, "verticalDeg": 65 },
  "defaultViewState": { "mode": "cylindrical", ... }
}
```

sidecar 中的 coverage 优先级最高（用户确认值），覆盖所有检测推断。

### D10: ProjectionType 与 ViewMode 兼容矩阵

`PreviewProjectionType` 表示资产投影事实，`PanoramaViewMode` 表示当前查看方式。两者不是同一个概念，但需要显式约束合法组合，避免 `cylindrical + little-planet` 这类无意义状态进入 sidecar 或 variant request。

| `projection.type` | 合法 `viewState.mode` | 默认模式 | 说明 |
|-------------------|-----------------------|----------|------|
| `equirectangular` | `sphere` / `flat` / `little-planet` | `sphere` | 360°/partial GPano 均可，partial 时受 coverage 约束 |
| `cylindrical` | `cylindrical` / `flat` | `cylindrical` | 不支持 little-planet，因为没有极点 |
| `flat` | `flat` | `flat` | 普通图片 |
| `cubemap` / `fisheye` / `unknown` | P2/P3 单独定义；当前回退 `flat` | `flat` | 不在本 ADR 首期实现 |

校验点：
- Webview tabs 只显示当前 projection 合法的 mode；临时切换 projection 时同步重算 tabs
- `PanoramicImagePreviewProvider` parse `defaultViewState` 时按 projection 归一化非法 mode
- `host-api/preview.rs` 写 sidecar 前按 projection 归一化非法 mode
- `render_fov_crop()` 收到非法组合时回退到该 projection 的默认模式

---

## 三、类型变更

### 3.1 TypeScript (`packages/neko-types/src/types/preview.ts`)

```typescript
// 扩展
export type PreviewProjectionType = 'flat' | 'equirectangular' | 'cylindrical' | 'cubemap' | 'fisheye' | 'unknown';

export type PanoramaViewMode = 'sphere' | 'flat' | 'little-planet' | 'cylindrical';

// 新增
export interface PanoramaCoverageAngle {
  readonly horizontalDeg: number;
  readonly verticalDeg: number;
}

export const DEFAULT_PANORAMA_COVERAGE_ANGLE: PanoramaCoverageAngle = {
  horizontalDeg: 360,
  verticalDeg: 180,
};

// 扩展现有接口
interface PreviewProjectionMetadata {
  // ... existing fields
  readonly coverageAngle?: PanoramaCoverageAngle;  // NEW
}

interface UpdatePreviewAssetMetadataRequest {
  // ... existing fields
  readonly coverageAngle?: PanoramaCoverageAngle;  // NEW
}
```

### 3.2 Rust (`packages/neko-engine/packages/runtime-media/src/image_analysis.rs`)

```rust
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PanoramaCoverageAngle {
    pub horizontal_deg: f64,
    pub vertical_deg: f64,
}

// PreviewProjectionType += Cylindrical
// PanoramaViewMode += Cylindrical
// PreviewProjectionMetadata += coverage_angle: Option<PanoramaCoverageAngle>
```

### 3.3 Sidecar (`packages/neko-engine/packages/runtime-media/src/sidecar.rs`)

```rust
pub struct PreviewAssetSidecar {
    pub projection_type: Option<PreviewProjectionType>,
    pub default_view_state: Option<PanoramaViewState>,
    pub coverage_angle: Option<PanoramaCoverageAngle>,  // NEW
}
```

---

## 四、Cylindrical 投影 shader

### 4.1 数学模型

Cylindrical projection 将全景图卷成一个竖直圆柱面：
- **水平方向**（U）：经度映射，与 equirectangular 相同 → `longitude = atan(dir.z, dir.x)`
- **垂直方向**（V）：线性透视映射（不是球面纬度） → `tanV = dir.y / length(dir.xz)`，再按 `tan(verticalCoverage/2)` 归一化

对比 equirectangular：
```
equirect:    v = asin(dir.y)                     // 球面纬度，极点处收敛
cylindrical: v = (dir.y / |dir.xz|) / tan(v/2)   // 线性透视，无极点畸变
```

### 4.2 Fragment Shader 伪代码

**Pitch 语义约定**：`pitchDeg` 在所有模式中统一表示**相机俯仰角**（camera pitch），通过旋转观察方向向量实现（`rotateX`），而非作为 UV 偏移量叠加。这与现有 sphere 模式（`direction = rotateX(direction, pitch); direction = rotateY(direction, yaw);`）保持一致，也与 Rust `render_fov_crop()` 的 CPU 采样逻辑对齐。

```glsl
uniform vec2 uCoverage;  // (horizontalDeg, verticalDeg)

if (uMode == 2) {  // cylindrical
  // 构建视线方向（与 sphere 模式相同的相机模型）
  vec3 dir = normalize(vec3(p.x * tan(fov * 0.5), -p.y * tan(fov * 0.5), -1.0));
  dir = rotateX(dir, pitch);  // 相机俯仰 — 与 sphere 模式一致
  dir = rotateY(dir, yaw);    // 相机偏航

  // 水平：经度映射（与 equirectangular 相同）
  float lon = atan(dir.z, dir.x);
  float u = 0.5 + lon / radians(uCoverage.x);

  // 垂直：线性透视映射（柱状投影核心差异）
  float tanV = dir.y / length(dir.xz);
  float halfVRad = radians(uCoverage.y) * 0.5;
  float v = 0.5 - tanV / (2.0 * tan(halfVRad));

  if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) discard;
  outColor = samplePano(vec2(u, v));
  return;
}
```

> **对比 sphere 模式**（现有代码）：
> ```glsl
> vec3 dir = normalize(vec3(p.x * tan(fov * 0.5), -p.y * tan(fov * 0.5), -1.0));
> dir = rotateX(dir, pitch);  // camera pitch
> dir = rotateY(dir, yaw);    // camera yaw
> outColor = samplePano(sphereUv(dir));
> ```
> 两者的相机模型完全相同，仅 UV 采样函数不同（`sphereUv` vs 柱状线性透视）。

### 4.3 Texture 配置

| 参数 | equirectangular 360° | cylindrical / partial |
|------|---------------------|----------------------|
| WRAP_S | REPEAT | CLAMP_TO_EDGE |
| WRAP_T | CLAMP_TO_EDGE | CLAMP_TO_EDGE |

### 4.4 Coverage uniform 同样应用于 equirectangular

equirectangular mode 的 `sphereUv()` 也需要升级以支持 GPano partial coverage：

```glsl
// 当前（假定 360×180）：
vec2 sphereUv(vec3 dir) {
  return vec2(0.5 + atan(dir.z, dir.x) / (2.0 * PI),
              0.5 - asin(dir.y) / PI);
}

// 升级为 coverage-aware：
vec2 sphereUv(vec3 dir) {
  return vec2(0.5 + atan(dir.z, dir.x) / radians(uCoverage.x),
              0.5 - asin(clamp(dir.y, -1.0, 1.0)) / radians(uCoverage.y));
}
```

---

## 五、检测管线变更

### 5.1 检测信号优先级（更新后）

```
1. Sidecar .nkmeta.json        → manual       (可含 cylindrical + coverage)
2. 用户显式 "Open as Panorama"  → explicit     (UI 触发)
3. GPano XMP 元数据             → high         (equirectangular; 新增 coverage 解析)
4. HDR/EXR 扩展名              → high         (equirectangular 360)
5. 文件名关键词                 → high         (扩展: +halfpano, +180pano, +pano180)
6. 2:1 宽高比启发式             → heuristic    (equirectangular; 需确认)
7. 默认                        → none / flat
```

**柱状全景不出现在自动检测链中**——只通过信号 1（sidecar）和信号 2（用户手动打开）进入。

### 5.2 手动打开 cylindrical 的 UX 流程

```
用户右键图片 → "Open as Panorama"
  → 全景查看器打开 (默认 equirectangular sphere 模式)
  → 用户看到球面畸变，切换到 "Cylinder" 模式 tab
  → 渲染切换为柱状投影，畸变消失
  → 用户点击 "Save Default" → sidecar 写入 projectionType: cylindrical + coverage
  → 下次打开自动使用 cylindrical 模式
```

### 5.3 GPano coverage 解析（新增）

在 Rust `image_analysis.rs` 中新增 `parse_gpano_coverage()`：

- 复用已有的 256KB prefix 读取
- 提取 `FullPanoWidthPixels`、`CroppedAreaImageWidthPixels` 等字段值（简单子串匹配 + 数值解析，不引入 XML parser）
- 在 `infer_projection()` 中，当 GPano 检测成功时调用此函数填充 `coverage_angle`

### 5.4 文件名关键词扩展

```typescript
// 扩展前
/(^|[._-])(pano|360|equirect|equirectangular)([._-]|$)/i

// 扩展后
/(^|[._-])(pano|360|halfpano|180pano|pano180|equirect|equirectangular)([._-]|$)/i
```

**不单独匹配 `180`**——`photo_180.jpg`（像素尺寸）、`IMG_1800.jpg`（序号后缀匹配）等误判率过高。仅接受带 `pano` 的组合信号。

`halfpano`/`180pano`/`pano180` 命中时仍路由为 equirectangular（信号不足以判断 cylindrical），用户可在 UI 中切换。

---

## 六、ViewStateController 变更

### 6.1 Coverage-aware 约束

```typescript
class ViewStateController {
  constructor(
    initial?: Partial<PanoramaViewState>,
    coverage?: PanoramaCoverageAngle,       // NEW
  );

  setCoverage(coverage: PanoramaCoverageAngle): void;  // NEW
}
```

`normalizeState()` 升级：

```typescript
function normalizeState(state, coverage, viewportAspect) {
  const verticalFov = state.fovDeg;
  const horizontalFov = radiansToDegrees(
    2 * Math.atan(Math.max(1, viewportAspect) * Math.tan(degreesToRadians(verticalFov) / 2)),
  );

  if (coverage.horizontalDeg >= 360) {
    yawDeg = wrapDegrees(state.yawDeg);     // 自由环绕
  } else {
    const maxYaw = Math.max(0, coverage.horizontalDeg / 2 - horizontalFov / 2);
    yawDeg = clamp(state.yawDeg, -maxYaw, maxYaw);  // 限制到覆盖范围
  }

  if (coverage.verticalDeg >= 180) {
    pitchDeg = clamp(state.pitchDeg, -89, 89);  // 现有行为
  } else {
    const maxPitch = Math.max(0, coverage.verticalDeg / 2 - verticalFov / 2);
    pitchDeg = clamp(state.pitchDeg, -maxPitch, maxPitch);
  }
}
```

`viewportAspect` 来自 canvas/client rect 的 `width / height`；无法取得时使用 `1`。这样宽屏视口下 yaw clamp 使用真实 horizontal FOV，避免 partial panorama 边缘露出。若实现选择保留 discard 黑边，也必须在 UI 中接受边缘透明/黑边作为显式降级，而不是误以为 clamp 已完整覆盖。

### 6.2 Cylindrical 模式下的交互差异

| 交互 | Sphere / Equirectangular | Cylindrical |
|------|------------------------|-------------|
| 水平拖拽 | 旋转 yaw | 旋转 yaw（受 coverage 约束） |
| 垂直拖拽 | 相机俯仰 pitch | 相机俯仰 pitch（同样通过 `rotateX`，受 coverage 约束） |
| 滚轮缩放 | 调整 FOV | 调整 FOV |
| Little-planet | 可用 | 不适用（cylindrical 无极点） |

---

## 七、UI 变更

### 7.1 模式 Tab 扩展

```typescript
const MODES: readonly PanoramaViewMode[] = ['sphere', 'flat', 'little-planet', 'cylindrical'];

function modeLabel(mode: PanoramaViewMode): string {
  switch (mode) {
    case 'sphere':        return 'Sphere';
    case 'flat':          return 'Flat';
    case 'little-planet': return 'Planet';
    case 'cylindrical':   return 'Cylinder';
  }
}
```

### 7.2 元数据面板

在现有 metadata-grid 中增加 Coverage 行：

```
Dimensions    9060 x 2966
Dynamic Range SDR
Coverage      ~180° x 65°    ← NEW (仅非 360 时显示)
Size          8.2 MB
View          0 / 0 / 75
```

### 7.3 投影类型自动推荐

当通过 "Open as Panorama" 打开非 2:1 图片时：
- 宽高比 1.8~2.1 → 默认 sphere 模式（可能是 equirectangular）
- 宽高比 > 2.5 → 默认 cylindrical 模式（大概率是柱状拼接）
- 宽高比 < 1.5 → 默认 sphere 模式（可能是半球 fisheye）

推荐仅影响初始 `defaultViewState.mode`，用户可随时切换。

---

## 八、影响范围

### 8.1 修改文件

#### 8.1.1 类型层

| 文件 | 变更内容 |
|------|---------|
| `packages/neko-types/src/types/preview.ts` | 类型扩展：ProjectionType / ViewMode / CoverageAngle / Metadata / UpdateRequest / VariantRequest + `normalizeCoverageAngle()` 校验函数 + projection/mode 兼容归一化 |
| `packages/neko-types/src/types/panoramic-preview.ts` | 文件名正则扩展（组合匹配） |

#### 8.1.2 Engine 层（Rust）

| 文件 | 变更内容 |
|------|---------|
| `packages/neko-engine/packages/runtime-media/src/image_analysis.rs` | Rust 类型 + `PanoramaCoverageAngle` 结构 + `normalized()` 校验 + GPano coverage 解析 + Cylindrical 枚举 |
| `packages/neko-engine/packages/runtime-media/src/sidecar.rs` | `PreviewAssetSidecar` 增加 `coverage_angle` 字段 + `write_sidecar_update()` 接受 coverage 参数 |
| `packages/neko-engine/packages/runtime-media/src/image_variant.rs` | `ImageVariantRequest` 增加 projection/coverage override；`render_fov_crop()` 新增 cylindrical UV 采样分支（见 §8.4） |
| `packages/neko-engine/packages/host-api/src/preview.rs` | `UpdatePreviewAssetMetadataRequest` 新增 `coverage_angle` 字段（:375）；`update_asset_metadata()` 传递 coverage 到 `write_sidecar_update()`（:158） |

#### 8.1.3 TS 客户端层

| 文件 | 变更内容 |
|------|---------|
| `packages/neko-client/src/EngineClient.ts` | `updatePreviewAssetMetadata()` 已透传 `UpdatePreviewAssetMetadataRequest`（无需改签名，但 TS 类型扩展后自动携带 `coverageAngle`） |
| `packages/neko-client/src/PreviewService.ts`（如有 wrapper） | 确保 coverage 字段透传 |

#### 8.1.4 Webview + Extension 层

| 文件 | 变更内容 |
|------|---------|
| `packages/neko-preview/packages/webview/src/panorama-image/webglPanoramaRenderer.ts` | Shader: cylindrical mode (uMode=2) + `uCoverage` uniform + coverage-aware `sphereUv()` |
| `packages/neko-preview/packages/webview/src/panorama-image/viewStateController.ts` | Coverage-aware yaw/pitch clamping，yaw 使用 viewport aspect 计算实际 horizontal FOV |
| `packages/neko-preview/packages/webview/src/panorama-image/PanoramicViewer.tsx` | UI: Cylinder tab + coverage 元数据显示 + auto-recommend + `panorama:updateAsset` 原子消息 |
| `packages/neko-preview/packages/extension/src/providers/PanoramicImagePreviewProvider.ts` | `panorama:updateAsset` handler + coverage 校验 + 透传到 `updatePreviewAssetMetadata()` |

### 8.2 不变文件

- `VideoPlayer.tsx` / `VideoControls.tsx` — 普通视频预览不受影响
- `panorama-video/` — 全景视频暂不扩展 cylindrical（P2 考虑）
- Engine 3D 渲染管线 — cylindrical 仅用于预览，不影响 `runtime-scene` IBL/skybox

### 8.3 数据流完整链路

`coverageAngle` 从 webview 到磁盘的完整路径：

```
Webview (PanoramicViewer.tsx)
  → postMessage({ type: 'panorama:updateAsset', projectionType, coverageAngle, defaultViewState })
  → PanoramicImagePreviewProvider.ts: handleMessage()
    → normalizeCoverageAngle(message.coverageAngle)
    → this._previewService.updatePreviewAssetMetadata(assetId, { projectionType, coverageAngle, defaultViewState })
      → EngineClient.updatePreviewAssetMetadata(assetId, request)
        → POST /v1/dispatch { group:'previews', action:'update-metadata', id, options:{ projectionType, coverageAngle, defaultViewState } }
          → host-api/preview.rs: update_asset_metadata()
            → body.coverage_angle.map(|c| c.normalized())
            → write_sidecar_update(path, projection_type, default_view_state, coverage_angle)
              → <file>.nkmeta.json
```

`coverageAngle` 从 webview 到一次性 FOV Crop / Export 的非持久化路径：

```
Webview (PanoramicViewer.tsx)
  → postMessage({
      type: 'panorama:requestVariant',
      request: { role:'fov-crop', viewState, projectionType, coverageAngle, ... }
    })
  → PanoramicImagePreviewProvider.ts
    → parseVariantRequest() 校验 projectionType / coverageAngle
    → EngineClient.requestPreviewVariant(assetId, request)
      → host-api/preview.rs: generate_preview_variant()
        → projection override 优先于 manifest.projection
        → runtime-media/image_variant.rs: render_fov_crop(..., projection_type, coverage)
```

### 8.4 派生变体——`render_fov_crop()` 升级

当前 `runtime-media/src/image_variant.rs` 的 `render_fov_crop()` 使用 equirectangular UV 采样：

```rust
// 现有逻辑（仅 equirectangular）
let u = 0.5 + direction[2].atan2(direction[0]) / (2.0 * PI);
let v = 0.5 - direction[1].clamp(-1.0, 1.0).asin() / PI;
out.put_pixel(x, y, sample_equirect(source, u, v));
```

如果 UI 中以 cylindrical 模式浏览，但 FOV Crop / Export 仍按球面采样，导出结果与预览不一致。

**升级方案**：`render_fov_crop()` 接受 `projection_type` 和 `coverage_angle` 参数，按投影类型分支采样：

```rust
fn render_fov_crop(
    source: &RgbaImage,
    width: u32,
    height: u32,
    view_state: &PanoramaViewState,
    projection_type: &PreviewProjectionType,      // NEW
    coverage: &PanoramaCoverageAngle,              // NEW
) -> RgbaImage {
    // ... 构建 direction 向量（与现有相同）
    let (u, v) = match projection_type {
        PreviewProjectionType::Equirectangular => {
            let cov_h = coverage.horizontal_deg.to_radians();
            let cov_v = coverage.vertical_deg.to_radians();
            (0.5 + dir[2].atan2(dir[0]) / cov_h,
             0.5 - dir[1].clamp(-1.0, 1.0).asin() / cov_v)
        }
        PreviewProjectionType::Cylindrical => {
            let cov_h = coverage.horizontal_deg.to_radians();
            let half_v = coverage.vertical_deg.to_radians() * 0.5;
            let lon = dir[2].atan2(dir[0]);
            let tan_v = dir[1] / (dir[0] * dir[0] + dir[2] * dir[2]).sqrt();
            (0.5 + lon / cov_h,
             0.5 - tan_v / (2.0 * half_v.tan()))
        }
        _ => { /* flat / unknown: 直接像素采样 */ }
    };
}
```

> 注意：equirectangular 分支也同步升级为 coverage-aware（不再硬编码 `2.0 * PI` 和 `PI`），与 WebGL shader §4.4 保持一致。

### 8.5 向后兼容

| 场景 | 兼容性 |
|------|--------|
| 已有 equirectangular 360° 全景 | 完全兼容：coverageAngle 缺省 = 360×180 |
| 已有 .nkmeta.json 无 coverageAngle | `Option`/`undefined` 自动兼容 |
| 旧版 WebGL shader | 新 uniform `uCoverage` 默认 (360, 180)，数学等价 |
| PreviewManifest JSON | 新字段 optional，旧 JSON 解析无报错 |

---

## 九、实施计划

| 阶段 | 内容 | 工作量 | 依赖 |
|------|------|--------|------|
| **PR1** | 类型基础：TS + Rust 类型扩展 + sidecar + `normalizeCoverageAngle()` 校验 + projection/mode 兼容归一化 + host-api `UpdatePreviewAssetMetadataRequest` / `PreviewVariantRequest` 扩展 + `update_asset_metadata()` coverage 透传 | ~1.5d | 无 |
| **PR2** | GPano coverage 解析 + 文件名扩展（组合匹配） | ~1d | PR1 |
| **PR3** | WebGL cylindrical shader + coverage uniform + 统一 pitch 语义（`rotateX`） | ~1.5d | PR1 |
| **PR4** | ViewStateController coverage-aware clamping（含 viewport aspect / horizontal FOV） | ~0.5d | PR1 |
| **PR5** | `render_fov_crop()` cylindrical 分支 + equirectangular coverage-aware 升级 | ~0.5d | PR1 |
| **PR6** | UI 集成：Cylinder tab + 元数据 + `panorama:updateAsset` 原子消息 + provider handler | ~1d | PR1-5 |
| **PR7** | 集成测试 + 手动验证 | ~0.5d | PR1-6 |

PR2/PR3/PR4/PR5 可并行开发。总计 ~6.5 eng-days。

---

## 十、测试策略

| 测试 | 覆盖 |
|------|------|
| TS 类型 JSON round-trip | `PanoramaCoverageAngle` 序列化/反序列化；旧 manifest 无 coverageAngle 解析兼容 |
| `normalizeCoverageAngle()` | NaN → 默认；0 → 默认；负数 → 默认；>360 → clamp；正常值 → 透传 |
| projection/mode 兼容归一化 | `cylindrical + little-planet` → `cylindrical`；`flat + sphere` → `flat`；合法组合保持不变 |
| 文件名路由 | `scene.halfpano.png` / `photo.180pano.jpg` / `city.pano180.jpg` 命中；`photo_180.jpg` **不命中**；`video_3600.mp4` 不命中 |
| Rust `parse_gpano_coverage()` | 有 CroppedArea → 计算 partial；仅 FullPano → 360；无 GPano → None |
| Rust `PanoramaCoverageAngle::normalized()` | 与 TS 校验对齐：NaN/0/负/超界 |
| Rust sidecar round-trip | 带 coverageAngle 写入/读取；不带 coverageAngle 向后兼容 |
| Rust `render_fov_crop()` | equirectangular + cylindrical 分支各自 UV 采样正确；coverage 非 360 时 equirectangular 也 coverage-aware |
| ViewStateController | 180° coverage → yaw clamped；360° → wrap；FOV 和 viewport aspect 变化时 maxYaw 联动 |
| `panorama:updateAsset` 消息 | projectionType + coverageAngle + viewState 原子写入 sidecar；旧消息向后兼容 |
| `panorama:requestVariant` projection override | 未保存 cylindrical 时直接 FOV Crop/Export，导出结果仍与当前预览一致且不写 sidecar |
| 手动端到端 | 右键 shanghai-morning.jpg → Open as Panorama → 切 Cylinder → 平移浏览 → Save Default → 重新打开自动 cylindrical → FOV Crop 导出结果与预览一致 |

---

## 十一、未来扩展

| 方向 | 优先级 | 说明 |
|------|--------|------|
| 全景视频 cylindrical | P2 | 在 `panorama-video/` 中复用同一 shader |
| 自动 cylindrical 检测 | P2 | 首帧分析 equirectangular 特征（极点畸变 + 水平连续性） |
| MP4 Spherical Video V2 (`sv3d` box) | P1 | 全景视频自动检测基础设施 |
| dc:subject 低置信度信号 | P2 | XMP 标签 "panorama" 作为非侵入式状态栏提示 |
| 宽高比启发式扩展 | P2 | > 2.5:1 + 用户确认 banner |
| Fisheye 投影 | P3 | 鱼眼镜头图片专用 shader |

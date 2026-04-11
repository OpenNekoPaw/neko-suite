# ADR: neko-sketch 2D 光照系统

## 状态

Accepted — P0 (flat point light) + P1 (normal map lighting) implemented

## 关联

- [format-strategy.md](./format-strategy.md) — `.nks` 文件格式
- [device-access.md](./device-access.md) — Webview GPU 限制
- [canvas-role-boundary.md](./canvas-role-boundary.md) — neko-canvas 与 neko-sketch 职责边界

---

## 一、背景

neko-sketch 是一个专业 2D 绘画工具，已有完整的 WebGL2 自研渲染管线：

- Ping-pong FBO 图层合成（12 种混合模式）
- 10 个 GLSL 后处理滤镜（FilterPipeline）
- 粒子系统 + 视差渲染 + Morph 引擎
- `SceneObjectType` 已预留 `'light'` 类型桩（无实现）

neko-canvas 是纯 DOM/CSS/SVG 无限画布，无 WebGL/Shader 能力，**不适合做光照**。

当前两个包均不支持对图片/物品/人物打光。对于创意工作流（角色设计、场景绘制、分镜上色），2D 光照是核心需求：控制明暗关系、营造氛围、突出主体。

## 二、问题定义

### 2.1 现状问题

| 问题 | 影响 |
|------|------|
| 无光照系统 | 画面缺乏立体感和氛围感 |
| `SceneObject.type = 'light'` 仅为数据桩 | 光源对象无渲染效果 |
| 滤镜系统仅处理全局后处理 | 无法模拟局部光照（点光源、方向光） |
| 无法线贴图支持 | 无法表现表面凹凸细节 |

### 2.2 目标

1. 实现 2D 光照系统，支持点光源 / 方向光 / 聚光灯
2. 支持法线贴图，实现表面凹凸感的光照响应
3. 不侵入现有混合模式和滤镜管线
4. 光源可交互式拖拽调整（位置、颜色、强度、范围）
5. 渲染性能：10 个光源 + 法线贴图 < 16ms（60fps）

### 2.3 适用范围

| 包 | 是否涉及 | 原因 |
|---|---------|------|
| neko-sketch | ✅ | WebGL2 管线，唯一可行载体 |
| neko-canvas | ❌ | 纯 DOM/CSS，无 GPU 管线 |
| neko-engine | ❌（P0-P1） | 2D 光照不需要 Rust 引擎参与 |

---

## 三、决策

### 3.1 光照注入位置：后合成 Light Pass

**方案比较**：

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 滤镜链扩展 | 注册为 FilterRegistry 滤镜 | 复用现有滤镜管线 | FilterPipeline 只传 `u_texture`，需大改才能传法线贴图和多光源 |
| B. 混合着色器内嵌 | 在 BLEND_FRAG 中注入光照 | 逐图层光照 | 侵入核心合成逻辑，每个图层需要绑定法线贴图，性能差 |
| **C. 后合成 Light Pass** | 在 filterFn 之后、最终 blit 之前插入独立 Pass | **不侵入现有逻辑，独立可开关，支持多光源累加** | 光照作用于合成结果而非单图层 |

**决策：选择方案 C**

理由：
1. 不修改现有 `BLEND_FRAG` 和 `FilterPipeline`，零侵入
2. 光照 Pass 可独立启用/禁用，不影响非光照工作流
3. 多光源通过累加 Pass 实现，架构清晰
4. 法线贴图作为独立输入纹理传入，不改变图层合成管线

### 3.2 法线贴图策略

| 方案 | 复杂度 | 效果 |
|------|--------|------|
| 无法线（平面光照） | 低 | 平面明暗变化，无凹凸 |
| **逐图层法线贴图** | 中 | 凹凸感，布料/皮肤/金属质感 |
| 全局法线贴图 | 低 | 仅作用于合成结果，丢失图层间法线差异 |

**决策：逐图层法线贴图（P1），P0 先做无法线平面光照**

P0 使用全局合成结果做平面距离衰减，验证光照管线。P1 扩展为逐图层法线合成后再光照。

### 3.3 光源数据模型

将 `SceneObject.properties: Record<string, unknown>` 替换为强类型 `LightProperties`：

```typescript
// types/light.ts

export type LightType = 'point' | 'directional' | 'spot';

export interface LightProperties {
  /** 光源类型 */
  readonly lightType: LightType;
  /** 光源颜色 RGB [0-1] */
  readonly color: readonly [number, number, number];
  /** 光源强度 [0-10] */
  readonly intensity: number;
  /** 衰减半径（像素），仅 point / spot */
  readonly radius: number;
  /** 光源高度（模拟 Z 轴距离），影响法线光照角度 [0-500] */
  readonly height: number;
  /** 方向角度（弧度），仅 directional / spot */
  readonly direction: number;
  /** 聚光灯锥角（弧度），仅 spot */
  readonly coneAngle: number;
  /** 聚光灯边缘柔和度 [0-1]，仅 spot */
  readonly coneSoftness: number;
  /** 环境光分量 [0-1] */
  readonly ambient: number;
}
```

### 3.4 环境光

每个场景有一个全局 `AmbientLight`，确保无光源区域不会全黑：

```typescript
export interface AmbientLightConfig {
  readonly color: readonly [number, number, number];
  readonly intensity: number; // [0-1], 默认 0.3
}
```

---

## 四、渲染管线设计

### 4.1 修改后的渲染流程

```
现有流程:
  compositeLayerStack → [filterFn] → blit to screen

新增光照后:
  compositeLayerStack → [filterFn] → [lightingFn] → blit to screen
                                          │
                                     Light Pass
                                     (独立 FBO)
```

详细步骤：

```
1. compositeLayerStack        已有  ping-pong 图层合成 → compositeTex
2. filterFn(compositeTex)     已有  滤镜链后处理 → filteredTex
3. lightingFn(filteredTex)    新增  光照 Pass → litTex
   3.1  绑定 litFBO
   3.2  Blit filteredTex 作为基底（乘以 ambientLight）
   3.3  对每个 light，累加光照贡献（additive blend）
   3.4  输出 litTex
4. blit(litTex)               已有  最终输出到屏幕
```

### 4.2 Light Pass Shader（P0 — 平面点光源）

```glsl
// light-shaders.ts — LIGHT_POINT_FRAG

#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;          // 合成后的场景纹理
uniform vec2 u_resolution;          // 画布尺寸（像素）
uniform vec2 u_lightPos;            // 光源位置（像素坐标）
uniform vec3 u_lightColor;          // 光源颜色 RGB
uniform float u_intensity;          // 光源强度
uniform float u_radius;             // 衰减半径（像素）

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec2 fragPos = v_texCoord * u_resolution;

  float dist = length(fragPos - u_lightPos);
  float attenuation = 1.0 - smoothstep(0.0, u_radius, dist);
  attenuation *= attenuation; // quadratic falloff

  vec3 light = u_lightColor * u_intensity * attenuation;

  fragColor = vec4(scene.rgb * light, scene.a);
}
```

### 4.3 Light Pass Shader（P1 — 法线贴图）

```glsl
// light-shaders.ts — LIGHT_NORMAL_FRAG

#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_normalMap;      // 合成法线贴图（RGB = XYZ 法线）
uniform vec2 u_resolution;
uniform vec2 u_lightPos;
uniform vec3 u_lightColor;
uniform float u_intensity;
uniform float u_radius;
uniform float u_height;             // 光源模拟高度（Z 轴）
uniform float u_specularPower;      // 高光锐度（Blinn-Phong）
uniform float u_specularIntensity;  // 高光强度

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec3 normal = texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0; // [-1, 1]
  normal = normalize(normal);

  vec2 fragPos = v_texCoord * u_resolution;
  vec3 lightDir = vec3(u_lightPos - fragPos, u_height);
  float dist = length(lightDir);
  lightDir = normalize(lightDir);

  // Distance attenuation
  float attenuation = 1.0 - smoothstep(0.0, u_radius, length(u_lightPos - fragPos));
  attenuation *= attenuation;

  // Diffuse (N·L)
  float diffuse = max(dot(normal, lightDir), 0.0);

  // Specular (Blinn-Phong, view from above: viewDir = (0,0,1))
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), u_specularPower) * u_specularIntensity;

  vec3 light = u_lightColor * u_intensity * attenuation * (diffuse + specular);

  fragColor = vec4(scene.rgb * light, scene.a);
}
```

### 4.4 多光源累加策略

```
1. 绑定 litFBO，clear 为黑色
2. Enable additive blend: gl.blendFunc(ONE, ONE)
3. 对每个光源:
   a. 绑定 u_scene = filteredTex（原始场景纹理，每次都用同一份）
   b. 绑定 u_normalMap（如果有）
   c. 设置当前光源 uniforms
   d. drawQuad() → 光照贡献累加到 litFBO
4. 叠加环境光:
   a. 绑定 ambient shader，u_scene = filteredTex，u_ambientColor，u_ambientIntensity
   b. drawQuad()（additive 累加）
5. Disable additive blend
6. 返回 litTex
```

### 4.5 法线贴图合成（P1）

当多个图层各自有法线贴图时，需要将它们合成为一张全局法线贴图：

```
compositeNormalStack:
  1. 创建 normalCompTex（RGBA8）
  2. 初始化为 (0.5, 0.5, 1.0, 1.0) — 即 flat normal (0,0,1)
  3. 对每个可见图层:
     如果有 normalTexture → blend 到 normalCompTex（使用 RNM 或 overlay blend）
     如果无 normalTexture → 跳过（保持 flat）
  4. 输出 normalCompTex → 传入 Light Pass
```

法线合成采用 **Reoriented Normal Mapping (RNM)**，比简单 overlay 更物理正确。

---

## 五、类型扩展

### 5.1 LayerData 扩展

```typescript
// types/index.ts — LayerData 新增字段

export interface LayerData {
  // ... 现有字段 ...
  texture: WebGLTexture | null;

  /** P1: 法线贴图纹理，RGB 编码为 (nx*0.5+0.5, ny*0.5+0.5, nz*0.5+0.5) */
  normalTexture?: WebGLTexture | null;
  /** P1: 从 .nks 文件加载的 base64 法线贴图数据，首次渲染后消费 */
  pendingNormalData?: string;
}
```

### 5.2 SceneObject 强类型化

```typescript
// types/scene.ts — 扩展

export interface LightSceneObject extends Omit<SceneObject, 'type' | 'properties'> {
  readonly type: 'light';
  readonly properties: LightProperties;
}

// 类型守卫
export function isLightObject(obj: SceneObject): obj is LightSceneObject {
  return obj.type === 'light';
}
```

### 5.3 Scene 扩展

```typescript
// types/scene.ts — Scene 新增

export interface Scene {
  // ... 现有字段 ...
  /** 全局环境光配置 */
  readonly ambientLight: AmbientLightConfig;
  /** 是否启用光照系统 */
  readonly lightingEnabled: boolean;
}
```

### 5.4 .nks 文件格式扩展

```json
{
  "version": "1.1",
  "layers": [
    {
      "id": "layer-1",
      "data": "base64...",
      "normalData": null
    }
  ],
  "scene": {
    "lightingEnabled": true,
    "ambientLight": { "color": [1, 1, 1], "intensity": 0.3 },
    "layers": [
      {
        "objects": [
          {
            "type": "light",
            "x": 400, "y": 300,
            "properties": {
              "lightType": "point",
              "color": [1, 0.9, 0.8],
              "intensity": 1.5,
              "radius": 300,
              "height": 200,
              "ambient": 0.0
            }
          }
        ]
      }
    ]
  }
}
```

---

## 六、关键文件索引

### 新增文件

| 文件 | 职责 |
|------|------|
| `packages/neko-sketch/packages/webview/src/types/light.ts` | `LightType`、`LightProperties`、`AmbientLightConfig` 类型定义 |
| `packages/neko-sketch/packages/webview/src/engine/light-shaders.ts` | 光照 GLSL 着色器（点光源 / 法线 / 方向光 / 聚光灯 / 环境光） |
| `packages/neko-sketch/packages/webview/src/engine/light-pass.ts` | `LightPass` 类：FBO 管理、多光源累加、法线合成 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `packages/neko-sketch/packages/webview/src/types/index.ts` | `LayerData` 新增 `normalTexture?`、`pendingNormalData?` |
| `packages/neko-sketch/packages/webview/src/types/scene.ts` | `LightSceneObject` 强类型、`Scene.ambientLight`、`Scene.lightingEnabled` |
| `packages/neko-sketch/packages/webview/src/engine/render-pipeline.ts` | `compositeLayerStack` 新增 `lightingFn?` 参数（与 `filterFn` 同级） |
| `packages/neko-sketch/packages/webview/src/engine/sketch-renderer.ts` | `renderWithEffects` 编排光照 Pass |
| `packages/neko-sketch/packages/webview/src/engine/shader-manager.ts` | 注册光照着色器程序 |
| `packages/neko-sketch/packages/webview/src/layer/layer-manager.ts` | `createLayer` 初始化 `normalTexture: null` |

---

## 七、法线贴图生成策略（P1）

### 7.1 来源

| 方式 | 描述 | 优先级 |
|------|------|--------|
| AI 生成 | 通过 neko-agent 调用图像模型从 diffuse 贴图生成法线贴图 | P1 |
| 灰度推断 | 从灰度图使用 Sobel 算子推断法线（可在 WebGL2 中实时） | P1 |
| 手动绘制 | 用户直接在法线图层上绘制（RGB 编码法线方向） | P2 |
| 外部导入 | 导入 .png/.exr 法线贴图文件 | P1 |

### 7.2 灰度推断 Shader（实时预览）

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_heightMap;   // 灰度图（luminance）
uniform vec2 u_resolution;
uniform float u_strength;        // 法线强度 [0.1 - 5.0]

void main() {
  vec2 texel = 1.0 / u_resolution;

  float left  = texture(u_heightMap, v_texCoord - vec2(texel.x, 0.0)).r;
  float right = texture(u_heightMap, v_texCoord + vec2(texel.x, 0.0)).r;
  float up    = texture(u_heightMap, v_texCoord - vec2(0.0, texel.y)).r;
  float down  = texture(u_heightMap, v_texCoord + vec2(0.0, texel.y)).r;

  vec3 normal = normalize(vec3(
    (left - right) * u_strength,
    (up - down) * u_strength,
    1.0
  ));

  fragColor = vec4(normal * 0.5 + 0.5, 1.0);
}
```

---

## 八、实施顺序

### Phase 0：平面 2D 点光源

**目标**：验证光照管线，可交互光源，无法线贴图。

```
P0 (管线验证)
  ├── 8.1  types/light.ts — 光源类型定义
  ├── 8.2  types/scene.ts — LightSceneObject 强类型 + Scene 扩展
  ├── 8.3  engine/light-shaders.ts — 点光源 + 环境光 GLSL
  ├── 8.4  engine/light-pass.ts — LightPass 类（FBO + 多光源累加）
  ├── 8.5  engine/render-pipeline.ts — lightingFn 注入点
  ├── 8.6  engine/sketch-renderer.ts — 编排光照
  └── 8.7  UI — 光源工具栏 + 属性面板（位置/颜色/强度/半径）
```

**验证**：创建画布 → 添加点光源 → 拖拽光源 → 观察实时明暗变化

### Phase 1：法线贴图光照

**目标**：逐图层法线贴图 + N·L 漫反射 + Blinn-Phong 高光。

```
P1 (法线贴图)
  ├── 8.8   types/index.ts — LayerData.normalTexture
  ├── 8.9   engine/light-shaders.ts — 法线光照 + 灰度推断 GLSL
  ├── 8.10  engine/light-pass.ts — compositeNormalStack + RNM 合成
  ├── 8.11  layer/layer-manager.ts — createLayer 初始化 normalTexture
  ├── 8.12  法线贴图导入（.png 文件 → normalTexture）
  ├── 8.13  灰度→法线 实时转换工具
  └── 8.14  UI — 图层面板法线贴图绑定 + 高光参数调节
```

**验证**：导入角色 diffuse + normal map → 添加点光源 → 拖拽光源 → 表面凹凸感随光源角度变化

### Phase 2：高级光照

**目标**：方向光 / 聚光灯 / 软阴影 / 环境光遮蔽。

```
P2 (高级)
  ├── 8.15  engine/light-shaders.ts — 方向光 + 聚光灯 GLSL
  ├── 8.16  engine/light-pass.ts — 阴影贴图（SDF soft shadow）
  ├── 8.17  SSAO（Screen-Space Ambient Occlusion）后处理
  └── 8.18  UI — 光源类型切换 + 聚光灯锥角可视化
```

**验证**：多种光源混合 → 场景有方向感和景深感 → 阴影柔和自然

### Phase 依赖

```
P0 (管线验证 + 平面点光源)
  → P1 (法线贴图 + 漫反射 + 高光)
      → P2 (方向光 / 聚光灯 / 阴影 / SSAO)
```

---

## 九、性能预算

| 场景 | 目标帧时间 | 策略 |
|------|-----------|------|
| 1 光源，无法线 | < 2ms | 单次 drawQuad |
| 10 光源，无法线 | < 8ms | 10 次累加 drawQuad |
| 10 光源 + 法线合成 | < 16ms | 法线合成缓存（仅图层变化时重建） |

**优化措施**：
- 法线合成纹理缓存：仅当图层内容或可见性变化时重新合成
- 光源剔除：跳过完全在画布外的光源
- 光源范围裁剪：使用 `gl_FragCoord` 与光源 `radius` 的 AABB 做 early discard（或用 scissor test）
- 累加合并：光源数量 ≤ 4 时可合并到一个 shader（4 组 uniform），减少 draw call

---

## 十、后果与风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 光照 Pass 增加 GPU 帧时间 | 中 | 性能预算 + 可全局禁用 `lightingEnabled` |
| 法线贴图增加 .nks 文件体积 | 低 | base64 PNG 压缩 + 可选（无法线则不存储） |
| 法线贴图生成依赖外部（AI/工具） | 中 | 内置灰度→法线 Sobel 推断作为 fallback |
| premultipliedAlpha 影响法线数据 | 低 | 法线贴图 alpha=1.0，premultiply 无影响；上传时验证 |
| 多光源 additive blend 可能过曝 | 低 | clamp + 可选 tone mapping（P2） |

---

## 十一、结论

neko-sketch 已具备实现 2D 光照系统的全部基础设施（WebGL2 管线、ping-pong FBO、Shader 管理）。通过在合成管线末端插入独立 Light Pass，可以零侵入地为现有绘画工作流增加光照能力。三阶段渐进实施（平面光照 → 法线贴图 → 高级光照）确保每阶段独立可验证。法线贴图通过灰度推断 + AI 生成双路径降低用户使用门槛。

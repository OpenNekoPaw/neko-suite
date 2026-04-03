# Inochi2D 标准面部参数制作指南

> 版本：1.0 | 日期：2026-04-03
> 对应模板：`@neko/shared` → `PUPPET_FACE_PARAMETERS`（32 个参数）

---

## 1. 概述

Neko Suite 的 neko-puppet 编辑器支持通过标准面部参数模板对 Inochi2D 模型进行参数化捏脸。为获得最佳体验，模型制作者在 Inochi2D Creator 中绑定变形参数时，应使用本指南规定的标准参数名称。

**标准参数总数**：32 个，分为 7 个分类。

---

## 2. 参数命名规范

所有参数名使用 **snake_case** 格式，与 Inochi2D Creator 的参数命名一致。

---

## 3. 参数清单

### 3.1 脸型 (face_shape) — 6 个

| 参数名 | 中文 | 英文 | 范围 | 默认值 | 说明 |
|--------|------|------|------|--------|------|
| `face_width` | 脸宽 | Face Width | -1 ~ 1 | 0 | 整体脸部水平宽度 |
| `face_length` | 脸长 | Face Length | -1 ~ 1 | 0 | 整体脸部纵向长度 |
| `cheekbones` | 颧骨 | Cheekbones | -1 ~ 1 | 0 | 颧骨突出程度 |
| `jaw_width` | 下颌宽度 | Jaw Width | -1 ~ 1 | 0 | 下颌骨横向宽度 |
| `chin_sharpness` | 下巴尖度 | Chin Sharpness | -1 ~ 1 | 0 | 下巴尖锐/圆润程度 |
| `chin_length` | 下巴长度 | Chin Length | -1 ~ 1 | 0 | 下巴纵向长度 |

### 3.2 眼睛 (eyes) — 7 个

| 参数名 | 中文 | 英文 | 范围 | 默认值 | 说明 |
|--------|------|------|------|--------|------|
| `eye_open_l` | 左眼开合 | Left Eye Open | 0 ~ 1 | 1 | 左眼睁开程度（0=闭合，1=完全睁开）|
| `eye_open_r` | 右眼开合 | Right Eye Open | 0 ~ 1 | 1 | 右眼睁开程度 |
| `eye_distance` | 眼距 | Eye Distance | -1 ~ 1 | 0 | 两眼间距 |
| `eye_size` | 眼睛大小 | Eye Size | -1 ~ 1 | 0 | 眼睛整体缩放 |
| `eye_angle` | 眼角上扬 | Eye Angle | -1 ~ 1 | 0 | 眼角倾斜角度 |
| `pupil_size` | 瞳孔大小 | Pupil Size | -1 ~ 1 | 0 | 瞳孔缩放 |
| `iris_color` | 虹膜色调 | Iris Color | 0 ~ 1 | 0.5 | 虹膜颜色插值（需在 Creator 中设置色彩 deform）|

### 3.3 眉毛 (eyebrows) — 6 个

| 参数名 | 中文 | 英文 | 范围 | 默认值 | 说明 |
|--------|------|------|------|--------|------|
| `brow_height` | 眉高 | Brow Height | -1 ~ 1 | 0 | 眉毛上下位置 |
| `brow_distance` | 眉距 | Brow Distance | -1 ~ 1 | 0 | 两眉间距 |
| `brow_thickness` | 眉粗 | Brow Thickness | -1 ~ 1 | 0 | 眉毛粗细 |
| `brow_curve` | 眉弯 | Brow Curve | -1 ~ 1 | 0 | 眉毛弧度 |
| `brow_angle_l` | 左眉角度 | Left Brow Angle | -1 ~ 1 | 0 | 左眉倾斜 |
| `brow_angle_r` | 右眉角度 | Right Brow Angle | -1 ~ 1 | 0 | 右眉倾斜 |

### 3.4 鼻子 (nose) — 4 个

| 参数名 | 中文 | 英文 | 范围 | 默认值 | 说明 |
|--------|------|------|------|--------|------|
| `nose_height` | 鼻高 | Nose Height | -1 ~ 1 | 0 | 鼻梁高度 |
| `nose_width` | 鼻宽 | Nose Width | -1 ~ 1 | 0 | 鼻翼宽度 |
| `nose_tip` | 鼻尖 | Nose Tip | -1 ~ 1 | 0 | 鼻尖上翘/下垂 |
| `nostril_flare` | 鼻翼 | Nostril Flare | -1 ~ 1 | 0 | 鼻翼展开程度 |

### 3.5 嘴巴 (mouth) — 5 个

| 参数名 | 中文 | 英文 | 范围 | 默认值 | 说明 |
|--------|------|------|------|--------|------|
| `mouth_width` | 嘴宽 | Mouth Width | -1 ~ 1 | 0 | 嘴巴水平宽度 |
| `lip_thickness` | 唇厚 | Lip Thickness | -1 ~ 1 | 0 | 嘴唇厚薄 |
| `mouth_corner` | 嘴角 | Mouth Corner | -1 ~ 1 | 0 | 嘴角上扬/下垂（微笑/撇嘴）|
| `cupids_bow` | 唇弓 | Cupid's Bow | -1 ~ 1 | 0 | 上唇人中弓形弧度 |
| `mouth_open` | 张嘴 | Mouth Open | 0 ~ 1 | 0 | 张嘴程度（0=闭合）|

### 3.6 耳朵 (ears) — 2 个

| 参数名 | 中文 | 英文 | 范围 | 默认值 | 说明 |
|--------|------|------|------|--------|------|
| `ear_size` | 耳大小 | Ear Size | -1 ~ 1 | 0 | 耳朵缩放 |
| `ear_angle` | 耳角度 | Ear Angle | -1 ~ 1 | 0 | 耳朵倾斜角度 |

### 3.7 表情微调 (expression) — 2 个

| 参数名 | 中文 | 英文 | 范围 | 默认值 | 说明 |
|--------|------|------|------|--------|------|
| `blush_intensity` | 腮红强度 | Blush Intensity | 0 ~ 1 | 0 | 腮红显示强度 |
| `expression_weight` | 表情权重 | Expression Weight | 0 ~ 1 | 0 | 整体表情叠加权重 |

---

## 4. 在 Inochi2D Creator 中实现

### 4.1 变形绑定流程

1. 在 Inochi2D Creator 中打开你的角色模型
2. 为每个标准参数创建一个 **Deformation Parameter**
3. **参数名必须与上表中 `参数名` 列完全一致**
4. 设置对应的 min/max 范围和默认值
5. 在 Deformation Editor 中绑定相关部件的顶点变形

### 4.2 部件层级建议

```
Root
├── Head
│   ├── Face_Shape (deform group)
│   ├── Eyes_L / Eyes_R
│   │   ├── Iris (pupil_size, iris_color)
│   │   ├── Upper_Eyelid (eye_open_l/r)
│   │   └── Lower_Eyelid
│   ├── Eyebrows_L / Eyebrows_R
│   ├── Nose
│   ├── Mouth
│   │   ├── Upper_Lip
│   │   ├── Lower_Lip
│   │   └── Teeth (optional)
│   ├── Ears_L / Ears_R
│   └── Blush (blush_intensity)
├── Body
└── Accessories
```

### 4.3 注意事项

- 未绑定的标准参数不会导致错误，只是该参数滑块不会产生可见效果
- 额外的非标准参数仍会在 neko-puppet 编辑器中显示（在"其他参数"分组下）
- 建议至少绑定 **脸型**（6 个）和 **眼睛**（7 个）这两组核心参数

---

## 5. AI 捏脸支持

使用标准参数模板的模型可以享受以下 AI 功能：

| AI 工具 | 功能 | 输入 |
|---------|------|------|
| `PuppetGenerateParams` | 文字描述生成面部参数 | "圆脸大眼的可爱角色" |
| `PuppetFromImage` | 从图片分析面部参数 | 角色参考图 |
| `PuppetAdjust` | 自然语言微调 | "眼睛再大一点" |

这些工具会生成标准参数值，只有模型绑定了对应参数才会生效。

---

## 6. 版本兼容

| 模板版本 | 参数数量 | 兼容性 |
|----------|----------|--------|
| v1.0 | 32 | 当前版本 |

未来扩展参数将通过新增（不修改/删除现有参数）的方式实现向前兼容。

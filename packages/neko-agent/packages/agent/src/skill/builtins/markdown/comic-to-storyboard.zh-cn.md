# 漫画转分镜转换器

你是漫画阅读和故事板结构化专家。目标是把漫画页转换成结构化的 StoryboardTableV1。

本 Skill 只负责分析和分镜规划，不直接生成图片、生成视频、写入时间线或导入 Canvas。如果用户需要动画计划、生成、Canvas 交付、Cut 装配或导出，应在结构化计划完成后激活 media-to-video、storyboard-to-animation-plan、animation-plan-to-cut、generated-shot-assembly 或 export-video-package。

## 工作流

### 漫画分析

1. 当上下文没有图片时，请用户提供漫画图片。
   - EPUB/CBZ/CBR/PDF 漫画文件先使用 ReadDocument。
   - 优先用 mode="manifest" 查看页数/章节，再用 mode="range" 和 image_path_limit 读取要分析的页。
   - 使用 ReadDocument.imageInfo 获取宽、高、mimeType、byteSize 和页面比例。不要为了探测图片元数据去运行 Python/PIL、file、sips、identify、unzip、unrar、7z 或其他外部命令。
   - 同一页/同一批图片只能选择一个视觉分析工具：ReadDocument 已返回 imagePaths/images 时，使用 ReadImage mode="vision"；只有仍持有文档 locator/page index 且需要工具解析成图片时，才使用 ReadDocumentImage mode="vision"。
   - 不要对同一张图先 ReadImage 再 ReadDocumentImage，也不要因为 ReadDocument 已返回 imagePaths 就再调用 ReadDocumentImage。
   - 在判断角色、对白/OCR、分格数量、动作或镜头前，必须先完成这一次视觉调用。
2. 用视觉能力分析版面：
   - 判断阅读方向：从左到右、从右到左或竖向 webtoon。
   - 识别分格边界和构图。
   - 统计分格数量。
3. 在分镜结构化前，先建立图片索引和分格映射：
   - 记录每张可引用图片的真实工具结果定位：`toolCallId`、`assetIndex`、mimeType、页码/章节/标签。
   - 为每个页面按阅读顺序标注 panel index；如果工具只返回整页图，也要记录“page image -> panels”的映射，不要假装已有独立分格图。
   - 后续每个 shot 必须引用这个索引中的真实图片；不要在生成分镜后再凭顺序补图片。
   - 多个 shot 可以显式引用同一页图，但必须在 `label`、`decisionReason` 或 `extensions["neko.mangaToVideo"]` 中说明 panel/page 对应关系；有裁切信息时记录 panel/crop/bbox。
4. 逐格提取可见内容：
   - 场景、角色、动作、表情和姿态。
   - 气泡文字和 OCR。
   - 音效字。
   - 镜头角度和景别。

### 分镜结构化

1. 需要时为每格生成视频提示词。
   - 提示词语言跟随用户内容语言。分析、分镜或用户请求是中文时，提示词写中文，除非用户明确要求英文或目标生成工具要求英文。
   - 强调视觉一致性、角色设定、画风、色彩、镜头运动、光线、氛围和动作。
2. 先给简洁可读的分析，再追加一个 `neko-composite` fenced JSON block 作为内部结构化 payload。
3. 使用 `template: "storyboard-table"`，输出 StoryboardTableV1：`schemaVersion: 1`、`kind: "storyboard-table"`、`profile: "manga-to-video"`、`title`、`scenes[]` 和 `shots[]`。

## StoryboardTableV1 规则

- scene/shot 粒度很重要。scene 是连续页面、地点/时间块或叙事段落；shot 是该 scene 内的单个分格、镜头设置或视频片段。
- 不要一镜头一个 scene。漫画通常应把同一页或同一连续动作段落的多个分格合并到一个 scene，除非页码、地点、时间或戏剧段落明显变化。
- 使用 `shotNumber` 表示全局阅读/视频顺序。
- 每个 shot 必须包含 `shotNumber`、`duration`、`visualDescription`、`characterAction` 和 `imageStrategy`。
- 明确选择 `imageStrategy`：`reuse-original`、`use-as-reference`、`generate-new` 或 `transform-original`。
- 不要默认给源图上色。黑白漫画需要彩色动画时，把原图保留在 `sourceMediaRefs`，使用 `imageStrategy: "transform-original"`，并在 `generationPrompt` 或 `extensions["neko.mangaToVideo"].colorization` 中说明。
- 只有工具真实生成后，才能把彩色图或生成结果写入 `generatedMediaRefs`。
- 只填写计划字段。运行时/工具返回前，不要声称图片已经生成。
- 嵌入图片时，只能引用图片索引中的当前对话真实工具结果。使用 `locator.type: "tool-result"`，并填写精确 tool call id 和 asset index。
- 如果当前 shot 来自某个页面/分格，必须把对应图片写入 `sourceMediaRefs`；不要只在可读说明里描述图片。
- 当 `imageStrategy` 是 `reuse-original`、`use-as-reference` 或 `transform-original` 时，必须提供 `sourceMediaRefs`。只有纯文本/脚本扩写且没有图片来源时，才允许没有图片引用。
- 不要编造图片 id，不要把本地缓存路径复制到 `referenceImagePath`，不要自行转换 base64。
- 不要在表格中嵌入 base64 图片数据、blob URL、localhost URL、绝对本地路径或编造的 tool call id。
- 不要要求用户复制或编辑 JSON；UI 会直接消费该 payload。
- 如果用户要求发送到 Canvas，先完成结构化计划，再激活 Canvas 或 media-to-video 相关 Skill。除非真实 Canvas 工具返回成功，不要报告 Canvas 成功。

```neko-composite
{
  "template": "storyboard-table",
  "schemaVersion": 1,
  "kind": "storyboard-table",
  "profile": "manga-to-video",
  "title": "Storyboard",
  "scenes": [
    {
      "sceneId": "scene-1",
      "sceneTitle": "Page 1",
      "shots": [
        {
          "shotId": "scene-1-shot-1",
          "shotNumber": 1,
          "duration": 3,
          "visualDescription": "Panel action and composition",
          "characterAction": "Character action",
          "dialogue": "OCR dialogue if present",
          "soundCue": "SFX if present",
          "generationPrompt": "Prompt for runtime generation if needed",
          "imageStrategy": "use-as-reference",
          "sourceMediaRefs": [
            {
              "refId": "source-panel-1",
              "role": "source",
              "locator": {
                "type": "tool-result",
                "toolCallId": "read-doc-call-id",
                "assetIndex": 0
              },
              "label": "Original panel",
              "mimeType": "image/jpeg"
            }
          ],
          "generatedMediaRefs": [],
          "decisionReason": "Use the panel for composition but create a video-ready keyframe."
        }
      ]
    }
  ]
}
```

## Profile 字段模板

- `script-breakdown`：强调 `dialogue`、`shotScale`、`cameraMovement`、`cameraAngle`、`duration` 和 scene 连续性。
- `manga-to-video`：强调 `sourceMediaRefs`、`imageStrategy`、OCR `dialogue`、`soundCue`、`extensions["neko.mangaToVideo"]` 下的 `motionHint` 和分格来源引用。
- `image-sequence`：强调有序 `sourceMediaRefs`、`generatedMediaRefs`、`duration`、`visualDescription` 和逐图转场备注。
- `ad-storyboard`：强调 `visualStyle`、产品时刻、call-to-action、品牌安全备注和 `extensions["neko.adStoryboard"]` 下的 CTA 元数据。
- `short-video`：强调 hook/beat/caption 结构、`voiceOver`、`soundCue` 和 `extensions["neko.shortVideo"]` 下的留存点。
- `character-design`：强调 `characters[]`、角色作用、表情、服装/连续性备注、参考图引用和 `extensions["neko.characterDesign"]` 下的设定表元数据。

## 漫画格式判断

| 格式      | 阅读顺序           | 分格版式 |
| --------- | ------------------ | -------- |
| 欧美漫画  | 从左到右、从上到下 | 规则网格 |
| 日漫/漫画 | 从右到左、从上到下 | 动态版式 |
| Webtoon   | 从上到下           | 单列长条 |

## 分格分析清单

- 场景位置。
- 出现角色。
- 动作和运动。
- 可见对白及说话者。
- 音效字。
- 情绪氛围。
- 镜头角度和景别。
- 速度线、冲击、发光、网点等特效。

## 视频提示词模板

```
[艺术风格]，[场景描述]，[角色] [动作]，
[镜头角度]，[光线]，[氛围]，[运动方式]，
保持角色设计一致，保持视觉连续性
```

示例：

```
暗黑童话插画风格，黄昏牧场边缘，金发牧羊少年瑞德握着牧羊杖
谨慎靠近发光的古老神灯，中景，紫色微光与暖色夕照交织，
神秘而紧张的氛围，镜头缓慢推进，衣摆和烟雾轻微飘动，
保持角色设计一致，保持视觉连续性
```

## 常见问题

| 问题           | 处理                         |
| -------------- | ---------------------------- |
| 分格顺序不明确 | 请用户确认阅读方向           |
| 文字看不清     | 请求更高分辨率图片或人工输入 |
| 角色换装       | 按 scene 记录服装            |
| 复杂动作       | 拆分为多个 shot              |
| 气泡重叠       | 按说话者和时机拆分对白       |

## 时长估算

| 分格类型 | 视频时长 |
| -------- | -------- |
| 对白较多 | 2-4 秒   |
| 动作格   | 1-2 秒   |
| 建立镜头 | 3-5 秒   |
| 戏剧停顿 | 1-2 秒   |

## 输出格式

分析后输出：

1. 检测到的总分格数。
2. 阅读顺序。
3. scene/shot 分解。
4. 预计总视频时长。
5. 角色列表及参考分格。
6. 已校验的 StoryboardTableV1 payload。
7. 只有当用户需要动画、Canvas、Cut 或导出时，才建议下一步 Skill。

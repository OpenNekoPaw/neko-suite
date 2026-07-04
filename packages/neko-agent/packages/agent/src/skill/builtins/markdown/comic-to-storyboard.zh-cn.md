# 漫画转分镜 Creative Table

你是漫画阅读和分镜规划专家。把漫画、日漫、webtoon、PDF、EPUB、CBZ/CBR 页面或图片序列转换成一张可审阅、可被 Canvas 摄入的 Markdown creative table。

本 Skill 只负责分析和分镜规划。不生成图片，不生成视频，不创建 Canvas 节点，不写 Cut 时间线，不导出文件，也不输出生产 JSON。用户需要动画、生成、Canvas 交付、Cut 装配或导出时，先完成可审阅表格，再通过对应 lifecycle capability 或聚焦媒体 Skill 交接。

只有当用户要求创建或更新分镜、镜头拆解、漫画改编表或 webtoon 分镜时才使用本 Skill。仅内容理解，例如“分析这个 EPUB”“阅读前 10 页”“总结/OCR 这本漫画”、检查分格顺序、人物/场景分析或质量诊断，应停留在普通读取/分析工具调用，不输出分镜表。

## 工作流

### 1. 获取视觉证据

1. 上下文没有图片时，请用户提供漫画图片。
2. EPUB/CBZ/CBR/PDF 漫画文件先使用 ReadDocument。
   - 优先用 mode="manifest" 查看页数/章节，再用 mode="range" 和 max_images 读取要分析的页。
   - 只有 manifest 的 ReadDocument 结果不是视觉证据，不能直接用来写分镜行。如果 manifest 没有返回 `imageInfo[]`，继续用 ReadDocument mode="content" 或 mode="next" 携带返回 cursor，或用 mode="range" 读取请求页范围，再输出表格。
   - QuerySemanticCoverage 只能检查已有可复用语义证据，不能读取图片像素，也不能替代 ReadImage。
   - 只有用户要求复用已有分析，或正在处理大范围重复分析时，才先调用 QuerySemanticCoverage。结果是 missing、stale、partial 或 failed 时，继续使用 ReadDocument 和 ReadImage。
   - 不要检查 `.neko/.cache`、`.neko/semantic-index`、SQLite、FTS、vector store、scratch path、Webview URI 或 provider-private payload。
   - 使用 ReadDocument.imageInfo 获取宽、高、mimeType、byteSize 和页面比例。不要为了探测图片元数据运行 Python/PIL、file、sips、identify、unzip、unrar、7z 或其他外部命令。
   - 只有在 ReadDocument 返回包含稳定资源数据的 `imageInfo[]` 后，才使用 ReadImage mode="metadata" 暴露页面图片；把这些条目原样作为结构化 `images[]` 传入，以保留 alias、locator、页面标签和资源身份。如果 ReadDocument 没有返回 `imageInfo[]`，继续用 mode="content"、mode="next" 或 mode="range" 读取请求页窗口，再诊断图片引用链不可用；不要编造 `P1`、`page_1` 或文档 entry path。
   - 不要为同一张文档图片编造第二个图片访问路径。
3. 必须让当前原生多模态模型分析返回的图片后，再判断角色、对白/OCR、分格数量、动作或镜头。QuerySemanticCoverage 结果或 imageInfo 文件名/尺寸列表本身不是视觉分析。ReadImage 返回视觉证据前，不要输出分镜行。
4. 请求页数超过单次读取工具可暴露上限时，明确分批处理，并基于已检查证据继续产出分镜。不要重复读取同一批页面，也不要切换工具强行凑齐完美批次。

### 2. 先读分格，再写行

- 判断阅读方向：从左到右、从右到左或竖向 webtoon。
- 检查图片方向；需要旋转时，先记录方向问题，再判断分格顺序。
- 识别分格边界、构图、镜头角度、景别、动作、表情和姿态。
- 提取气泡文字、旁白/字幕框、可见音效字、招牌、屏幕字和其他 OCR 证据，并分类为对白、旁白、字幕、音效、背景文字或未知。
- 一页或一张图可能对应多个 storyboard shot。不要按输入图片顺序直接生成一图一行。
- 必须先判断每张图/每个分格是否保留、跳过、合并、拆分或只作为过渡证据。
- 封面、版权页、目录页、空白页、章节页、广告页、纯说明页和重复页默认不进入正片 shot，除非用户要求保留或它承担明确叙事功能。

### 3. 建立图片索引

输出表格前，先建立内部图片索引和分格映射：

- 记录每张可引用图片的真实工具结果身份、mimeType、页码/章节/标签、尺寸，以及工具返回的稳定资源身份。
- 记录每一批图片的 alias scope，例如 tool call id、源文档 id 或 aliasScope。`page_1`、`P1`、`image_1` 这类 alias 只在该 scope 内有意义。
- 优先使用工具返回的显式 alias/label。没有时，才在当前图片索引内派生 `P1`、`P2`、`page_2#panel_1` 这类 scoped token。
- 不要把聊天附件顺序当成资源身份。
- 不要使用猜测的显示文件名，例如 `read-image-cover.jpg` 或 `read-image-*.jpg`，除非该精确 token 是当前图片索引里的真实 alias/label。
- 如果工具只返回整页图，也要记录“页面到分格”的映射，并使用 `P1#panel_1` 这类后缀；不要假装已经有独立分格图。
- 多个 shot 可以引用同一页图。用 `sourcePanel`、`decisionReason` 或其他扩展列说明页面/分格对应关系。
- 如果图片没有稳定绑定，在 `reviewStatus` 写 `needs-resource-binding`，或在 `nextAction` 说明缺失绑定，不要猜文件名。

## 输出契约

普通审阅输出时，先给简洁说明，再输出一张 Markdown creative table。这张表就是分镜表；不要引入第二个产物名，也不要说之后再转换。

普通聊天回复不要输出 YAML frontmatter 或创作文档元数据。禁止输出 `---`、`id:`、`kind: draft`、`status: draft`、`domain: storyboard` 或 `referenceChain:` 这类块/键。它们只属于 host/runtime 持久化的创作文档，不属于分镜 creative table。

生产可用的分镜输出必须对已知列精确使用以下 canonical 稳定字段 id，并尽量按此顺序出现。新 Markdown 输出不要本地化已知字段表头。已知字段由 shared storyboard profile 解析，Webview 会按当前 UI 语言展示字段标签；未知扩展列会保留 Markdown 原表头，因此扩展列请使用用户/输出语言，并保持含义清晰。

`scene`, `shot`, `source`, `sourcePanel`, `decision`, `duration`, `visual`, `motion`, `audio`, `characters`, `dialogue`, `imagePrompt`, `imageEditPrompt`, `shotVideoPrompt`, `videoEditPrompt`, `sceneStylePrompt`, `sceneVideoPrompt`, `sceneVideoEditPrompt`, `reviewStatus`, `nextAction`, `contentType`, `decisionReason`, `requiresSplit`, `duplicateOf`

validator 支持开放的审阅 metadata，不要求证据不足或任务不需要时填齐所有推荐字段。聊天分镜输出仍必须包含 `scene` + `shot`，并且包含 `source`，或至少一个提示词槽（prompt slot）/ 兼容字段 `prompt`。

规则：

- 中文/本地化表头如 `场景`、`镜头`、`来源`、`图像提示词`、`建议操作` 可用于解析用户已有表格或旧输出，但本 Skill 新生成的已知字段表头应使用 canonical field id。
- 绝不能把简化的页级分析表当作分镜表输出。禁止作为主表头的字段包括 `页码`、`景别/构图`、`节奏/情绪`、`page`、`image reference`、`analysis` 或 `suggestion`。`画面内容`、`图像提示词`、`建议操作` 等本地化表头只适用于已有表格的修复/校验，不作为新输出的首选表头。
- 不要说分镜锚点之后再补。`scene`、`shot` 和 `source`/prompt-slot 锚点必须现在就出现在唯一主表中。
- 如果 ReadImage 返回的视觉证据仍然停留在页级，也必须用已有分镜列创建一个或多个 shot 行，并在不确定的单元格写 `needs-panel-analysis`、`needs-review` 或 `needs-prompt`；不要降级成页面列表。
- 不要再输出第二张“分镜结构建议”表。keep/skip/split/merge 和下一步规划写入 `decision`、`decisionReason`、`reviewStatus` 和 `nextAction`。
- 当用户要求特定生成或编辑目标时，必须包含对应提示词槽；不确定的提示词单元格写 `needs-prompt`。
- 提示词槽必须显式、模型感知：`imagePrompt` = 单镜头图像生成提示词；`imageEditPrompt` = 单镜头图像编辑/重绘/inpaint 提示词；`shotVideoPrompt` = 单镜头视频生成提示词；`videoEditPrompt` = 单镜头视频编辑提示词；`sceneStylePrompt` = 场景级图像/风格提示词；`sceneVideoPrompt` = 场景视频生成提示词；`sceneVideoEditPrompt` = 场景视频编辑提示词。
- 兼容字段 `prompt` 仍可用于旧输出和通用图像生成，但新的输出应优先使用模型专用提示词槽。
- 每行代表一个 shot 或视频节拍；scene 列负责把多行归组到同一场景。
- Shot 提示词槽描述单镜头关键帧、编辑或短镜头运动。Scene 提示词槽描述跨多个 shot 的场景级连续性、风格，或更长的场景视频生成/编辑。
- `sceneVideoPrompt` 可以概括多个 shot 节拍如何连接；shot prompt 应保持基于来源分格/镜头证据。
- 分镜提示词可以面向图像生成/编辑和视频生成/编辑。视频模型支持只用通用语义表达，不要硬编码 provider payload、外部 API JSON 或内部 job contract。若提到 Seedance/Volcengine 类场景，也只描述为场景/镜头视频生成用途。
- 每行代表叙事 shot 或视频节拍，不是页面清单。同一个 `source` 可以在多行重复，用于表达一页/一图拆出多个 shot。
- `decision` 表达 keep/skip/merge/split/duplicate/reference-only 等选择。封面、重复页、广告页、空白页和元数据页也必须显式写出 `decision`，不要静默消失。
- `decisionReason` 说明为什么保留、跳过、合并、拆分成多个 shot，或判定为重复。
- 一页/一格需要拆成多个 shot 或需要裁切分格时，`requiresSplit` 写 `true`；否则写 `false`。
- 只有重复或需要合并到另一来源/shot 时才填写 `duplicateOf`；否则留空。
- `source` 使用当前图片索引中的稳定可读 token，例如 `P1`、`P1#panel_2`、`page_2#panel_1` 或 `P3,P4`。
- `sourcePanel` 表达分格位置、裁切意图或页面/分格映射，例如 `右上分格`、`panel 2` 或 `整页宽幅裁切`。
- 单元格保持短小、可审阅。不确定性放进扩展列，不要全部塞进 `visual`。

### 字段角色

- 审阅字段：`scene`、`shot`、`source`、`sourcePanel`、`decision`、`visual`、`audio`、`characters`、`dialogue`、`reviewStatus`，以及有用的开放审阅 metadata 列。
- 计划字段：共享 profile descriptor 中声明的字段，例如 `motion`、`duration`、提示词槽、兼容字段 `prompt`、`decisionReason`、`requiresSplit`、`requiresTextRemoval`、`requiresInpaint`、`referenceImage`、`styleRef` 和 `nextAction`。
- 计划字段只有在共享 profile descriptor 声明后才具有生产语义。
- `nextAction` 只是计划文本，不是可信执行 action。
- `actionId`、`resultRef`、`executionStatus` 和生成结果 ref 等执行字段属于可信 lifecycle 字段。除非有本地 capability/tool 结果明确支撑，本 Skill 的普通输出应省略它们。

提示词槽是后续生成或修复动作的重要输入。`source`、`visual`、`duration`、`reviewStatus` 和 `nextAction` 帮助 Canvas 展示 diagnostics 和审阅规划。

需要时，在推荐稳定表头之后继续追加扩展列，例如 `requiresTextRemoval`、`requiresInpaint`、`referenceImage`、`styleRef`、`textCueType`、`speaker`、`ocrNotes` 或 `risk`。已知字段应保持稳定；有用的扩展列应作为审阅 metadata 可见保留。没有可信 lifecycle 结果支撑时，不要输出执行字段。

## 资源引用

- 推荐普通 token：`P1`、`P1#panel_2`、`page_2#panel_1`、`P3,P4`。
- 只有当前工具/host 资源索引中存在完全相同 target 时，才在 `source` 单元格使用标准 CommonMark 图片，例如 `![P1](P1)` 或 `![panel](page_2#panel_1)`。alt text 只是展示文字，target 才是资源身份。
- 如果看不到稳定资源绑定，使用普通 token，并在 `reviewStatus` 或 `nextAction` 写 `needs-resource-binding`，不要编造 Markdown 图片。
- CommonMark 图片 target 可以是稳定 token，也可以是工具返回的稳定文档图片路径，例如 `![page](image/moe-010564.jpg)`。不要使用相对项目路径，除非工具/资源索引返回了完全相同的 token。
- `#panel_1`、`#crop_top` 等后缀表示 base image token 上的分格/裁切意图，不是另一张资源。
- 不要写 render URI、Webview URI、blob URL、`.neko/.cache` 路径、provider cache path、系统临时路径、Engine token、base64 图片数据、绝对私有路径、provider-private handle 或领域节点 JSON。
- 分镜表中不要使用 `![[cover.png]]` 或 `[[Chapter 1#Section]]` 这类 Neko/Obsidian-style resource-reference 语法。本 Skill 遵循 Codex-style 标准 Markdown：`![alt](resource-token)`。

## Canvas 交接

如果用户要求发送到 Canvas，使用运行时工具列表中可用的 Canvas lifecycle tool/capability。本地 UI/tool adapter 会携带真实稳定 resource refs。除非 Canvas capability/tool 返回成功，不要声称 Canvas 成功。

变更生产节点前，先走 validation 或 review action。不要输出领域节点 JSON 或其他项目内部交接对象。

## 示例

| scene   | shot | source     | sourcePanel | decision | duration | visual                     | motion                 | audio        | characters                 | dialogue | imagePrompt                                                      | imageEditPrompt | shotVideoPrompt                                        | videoEditPrompt | sceneStylePrompt                 | sceneVideoPrompt                                               | sceneVideoEditPrompt | reviewStatus | nextAction                 | contentType | decisionReason         | requiresSplit | duplicateOf |
| ------- | ---- | ---------- | ----------- | -------- | -------- | -------------------------- | ---------------------- | ------------ | -------------------------- | -------- | ---------------------------------------------------------------- | --------------- | ------------------------------------------------------ | --------------- | -------------------------------- | -------------------------------------------------------------- | -------------------- | ------------ | -------------------------- | ----------- | ---------------------- | ------------- | ----------- |
| 第 1 页 | 1    | P1#panel_1 | 上方分格    | keep     | 3s       | 小小的人影在黄昏靠近发光物 | 缓慢推近               | 低风声       | 牧羊少年：短披风、谨慎姿态 |          | 暗黑童话关键帧，黄昏牧场，谨慎少年靠近发光古灯，保持角色设计一致 | needs-prompt    | 缓慢推近发光古灯，短镜头，悬疑节奏                     | needs-prompt    | 黄昏牧场、紫金色魔法光、墨线质感 | 连接镜头 1-2 成 8 秒场景：靠近、手部特写、光芒增强，保持连续性 | needs-prompt         | needs-review | 标记为 Canvas 审阅参考     | story       | 建立镜头，有叙事价值   | false         |             |
| 第 1 页 | 2    | P1#panel_2 | 下方特写    | split    | 2s       | 手伸向光源，强化悬念       | 静态特写，光线轻微闪动 | 柔和魔法嗡鸣 | 牧羊少年：手和袖口可见     |          | 手伸向紫金色光源的特写关键帧，紧张氛围，保留原漫画构图           | needs-prompt    | 静态特写，只有光线轻微闪动，不添加来源分格之外的新动作 | needs-prompt    | 黄昏牧场、紫金色魔法光、墨线质感 | 连接镜头 1-2 成 8 秒场景：靠近、手部特写、光芒增强，保持连续性 | needs-prompt         | needs-review | 先拆分分格再送 Canvas 审阅 | story       | 同一页包含独立特写节拍 | true          |             |

推荐扩展示例：

| scene    | shot | source     | sourcePanel | decision | duration | visual           | motion   | audio      | characters       | dialogue | imagePrompt                | imageEditPrompt              | sceneVideoPrompt                       | sceneVideoEditPrompt         | reviewStatus | nextAction             | decisionReason       | requiresSplit |
| -------- | ---- | ---------- | ----------- | -------- | -------- | ---------------- | -------- | ---------- | ---------------- | -------- | -------------------------- | ---------------------------- | -------------------------------------- | ---------------------------- | ------------ | ---------------------- | -------------------- | ------------- |
| 正文开场 | 1    | P5#panel_1 | 右上分格    | keep     | 4s       | 主角进入巨构空间 | 缓慢推近 | 低频环境声 | 主角：小比例剪影 |          | 巨构室内关键帧，小比例剪影 | 重绘天顶光，移除对白气泡图形 | 延展镜头 1-3 的进入巨构空间节拍，12 秒 | 整场调成更冷色月光并平滑运镜 | needs-review | 拆分分格并作为参考审阅 | 一页包含多个可用分格 | true          |

## 人物和文字说明

- 可见人物出现时，在 `characters` 中提取镜头内人物信息。这只是分镜证据；本 Skill 不创建或确认项目统一实体。
- 同一视觉身份明确重复出现时，可以给角色稳定名称或局部标签；身份不清楚时标明不确定。
- 只有角色气泡对白或明确说出的画外台词应写入 `dialogue`。
- 旁白框、字幕/卡片文字、音效字和环境文字应写入 `audio`、`ocrNotes`、`textCueType` 或其他扩展列，不要当作对白。
- 分格证据支持时绑定对白说话者，例如 `凛：「……」`；不确定时保留不确定。
- 不要从本 Skill 输出实体贡献 payload、图片准备 schema、重生成计划、图片生成任务或编辑任务。用 `nextAction` 推荐后续工作即可。

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
- OCR 文字分类。
- 可见对白及说话者绑定。
- 音效和可见音效字。
- 情绪氛围。
- 镜头角度和景别。
- 速度线、冲击、发光、网点等特效。

## 时长参考

| 分格类型 | 视频时长 |
| -------- | -------- |
| 对白较多 | 2-4 秒   |
| 动作格   | 1-2 秒   |
| 建立镜头 | 3-5 秒   |
| 戏剧停顿 | 1-2 秒   |

## 最终回复结构

分析后输出：

1. 检测到的总分格数。
2. 阅读顺序。
3. keep/skip/merge/split 说明。
4. 预计总视频时长。
5. 必要时列出角色和参考分格。
6. 使用支持提示词槽的表头、资源/source token、review status 和仅计划用途的 next actions 的单张 Markdown creative table。
7. 只有用户需要 Canvas 交付时，才说明推荐 Canvas action。
8. 只有当用户需要动画、生成、Canvas、Cut 或导出时，才建议下一步 Skill。

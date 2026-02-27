分析如何提供音频、视频、图片LSP功能？是否必须使用AI模型？
在音视频与图片处理中引入 LSP (Language Server Protocol)，本质是将“多媒体素材”视为“源代码”，将“Prompt/参数”视为“编译器指令”。
通过 Rust (后端 Server) + WebView (前端 Client)，你可以构建一套跨模态的协议。以下是具体分析：
1. 如何提供音视频/图片 LSP 功能？
在架构上，你需要模拟标准的 LSP 交互流程：
定义符号 (Symbol Definition)：
将视频中的“场景”、音频中的“音效/对白”、图片中的“主体”定义为 Symbols。
功能：在 WebView 中点击时间轴上的某个波形，LSP Server 返回该片段的属性（采样率、语意标签、对应 Prompt）。
诊断信息 (Diagnostics)：
视频：检测黑场、掉帧、噪点、AI 闪烁。
音频：检测爆音、静音、音频相位抵消。
UI 表现：像代码报错一样，在时间轴或滚动条上显示红色/黄色波浪线。
悬停预览 (Hover)：
鼠标悬停在某张图片或视频片段上，LSP 返回该素材的 Diff 增量数据（例如：相比上一版改动了哪些 Prompt 权重）。
代码补全 (Completion)：
基于已生成的素材风格，推荐后续视频片段的 Prompt。
2. 是否必须使用 AI 模型？
答案是：不一定，取决于你想要达到的“语义深度”。
你可以将功能分为 “确定性逻辑”（非 AI）和 “语义逻辑”（AI）：
(1) 非 AI 实现（基于传统信号处理）—— 基础必要
音频 LSP：利用 FFT（快速傅里叶变换）检测频率缺失或音量异常。
视频 LSP：利用像素差值、帧率检测、位深校验。
图片 LSP：利用 pHash (感知哈希) 检测重复图，利用直方图检测曝光问题。
价值：性能极高，在 Rust 侧用 ffmpeg-next 即可实现。
(2) AI 实现（基于深度学习）—— 高级价值
语义对齐：必须使用 CLIP。没有它，LSP 无法理解“图片里是否有猫”。
内容识别：必须使用 Whisper (音频转文字) 或 YOLO (物体检测)。没有它们，LSP 无法提供“跳转到人声处”或“查找所有包含汽车的帧”等高级功能。
质量评估：必须使用 VMAF/NIQE 模型来判断 AI 生成素材的“自然度”。
3. 混合建议方案
为了保证插件的响应速度（LSP 的核心是快），建议采取 “异步分层” 策略：
LSP Core (Rust)：使用物理算法提供基础诊断（如剪辑错位、静音、文件格式错误），不启动 AI。
LSP AI-Extension (Plugin)：当用户开启“深度分析”时，在后台启动 ort (ONNX Runtime) 进行语义识别。
LSP Indexer：利用 SurrealDB 或向量数据库（如 Qdrant 的本地版）在 Rust 侧为素材建立索引。
4. 总结
功能层级	技术手段	是否必须 AI	典型场景
基础诊断	信号处理 / 像素比对	否	检测掉帧、黑屏、音频爆音
结构分析	特征提取 / 聚类	可选	素材去重、相似图片分组
语义服务	CLIP / Whisper / YOLO	是	Prompt 对齐、内容搜索、自动打标
结论：如果你要做“内容不符”的抽卡筛选，AI 是必须的；如果你要做“技术规格校验”，传统 Rust 算法足够。
分析如何处理 剧本fountain、图片、音频、视频、timelines数据之间的LSP功能和单独文件的LSP功能
在 Rust + WebView 架构中，将音视频与剧本（Fountain）整合进 LSP (Language Server Protocol) 体系，本质是将“多媒体素材”视为可索引、可跳转、可校验的“结构化代码”。
以下是分层次的功能分析，涵盖单文件与跨文件联动的实现逻辑：
1. 单文件 LSP：基础诊断与静态分析
每个文件类型在 Rust 后端都有独立的解析器（Parser），不一定全部依赖 AI，但 AI 能显著提升语义深度。
剧本 (Fountain)：
实现：使用 Rust 编写 Fountain 语法解析器。
LSP 功能：角色名/场景头自动补全（Completion）、场景编号大纲（Symbols）、对话字数校验（Diagnostics）。
图片 (Image)：
LSP 功能：悬停预览 (Hover) 显示 EXIF/Prompt 信息；诊断 (Diagnostics) 标识低分辨率或色彩断层。
音频/视频 (AV)：
LSP 功能：折叠 (Folding) 冗余片段；诊断 静音、黑场、掉帧或音量爆音。
2. 跨文件联动 LSP：实现“多模态跳转”
这是该插件的核心价值，通过一套全局索引（Global Index）打通所有素材。
A. 剧本 
 时间轴 (Script-to-Timeline Sync)
功能：转到定义 (Go to Definition)。在剧本中点击一行对白，Timeline 自动跳转到对应的音频/视频片段。
实现：利用 Whisper.cpp (Rust) 将音频转文字，并与剧本进行模糊匹配，建立 ScriptLine -> TimeRange 的索引映射。
B. Prompt 
 图片/视频 (Prompt-to-Asset References)
功能：查找所有引用 (Find All References)。在剧本的视觉描述（Action）上按快捷键，WebView 弹出所有符合该描述的 AI 生成素材（图片或视频）。
实现：必须使用 AI (CLIP)。通过计算 Text-to-Image 的相似度，将 Prompt 作为“变量名”，素材作为“实例值”。
C. 时间轴 
 物理素材 (Timeline-to-Source)
功能：重命名重构 (Rename)。在 Timeline 修改一个素材名称，底层文件系统同步重命名，并更新所有引用该素材的剧本标记。
3. 是否必须使用 AI 模型？分级建议
功能维度	技术手段	是否必须 AI	推荐工具 (Rust 侧)
语法解析	正则/Peg Parser	否	pest 或 nom
技术指标校验	信号处理	否	ffmpeg-next
内容语义匹配	向量嵌入 (Embedding)	是	ort (ONNX Runtime) 加载 CLIP
语音内容检索	自动语音识别 (ASR)	是	whisper-rs
4. 架构实现路径 (Rust + WebView)
Server 层 (Rust)：建立一个 Workspace Manager。它不仅扫描 .fountain 文本，还扫描同目录下的 .png, .mp4。
协议层 (JSON-RPC)：扩展标准的 LSP。
例如请求：textDocument/hover 返回的不仅是文字，还包含 base64 缩略图数据给 WebView。
Client 层 (WebView)：
Timeline 可视化：将 LSP 传回的“语义锚点”渲染为 Timeline 上的 Marker。
联动反馈：当剧本光标移动时，通过 window.__TAURI__.emit 通知 Timeline 同步滚动。
5. 价值分析：解决“抽卡”痛点
通过 LSP 联动，你可以直接在剧本里看到：“这行对白我有 5 个候选视频，其中 3 个符合语义，1 个音画同步有问题”。这种以剧本为核心的全局 Diff，能让创作者从琐碎的文件管理中解脱。

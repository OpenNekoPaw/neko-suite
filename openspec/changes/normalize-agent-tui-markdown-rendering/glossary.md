# Glossary: Agent TUI Markdown Rendering

状态：Confirmed（21 项设计决策已确认）

| Term | Definition | Status |
| --- | --- | --- |
| Markdown source | Agent/provider 产生的原始 Markdown 字符序列；是重新解析、resize 重排和复制保真的输入来源。 | Confirmed |
| Normalized Markdown document | 由 `@neko/markdown` 定义和拥有的 host-agnostic、Neko-owned 语义文档；覆盖受支持的 CommonMark/GFM 节点与显式 Neko 扩展。 | Confirmed |
| Source provenance | 语义节点与 `MarkdownDocument.source` 或显式 projection origin 之间的可追踪关系。 | Confirmed |
| Source range | 指向权威 source 的半开 UTF-16 offset 区间 `[startOffset, endOffset)`；不得与 code point、grapheme 或 terminal column 混用。 | Confirmed |
| Source-backed node | 直接由 Markdown source 某一区间解析得到、具有合法 source range 的 semantic node。 | Confirmed |
| Synthetic node | 由 Neko projection 合成、没有独立源码区间的 semantic node；必须记录 originating node/range 或 projection provenance。 | Confirmed |
| Canonical Markdown parser | `@neko/markdown` 内由 remark/GFM 实现、向包外只暴露 normalized Neko document 的唯一标准 Markdown parse path。 | Confirmed |
| AST-aware extension normalization | 基于标准 semantic node/context/source range 识别 Neko 扩展，显式跳过 code/raw-HTML 等不适用上下文的过程。 | Confirmed |
| Parser implementation model | parser 库内部产生的第三方 token/AST，例如 MDAST；仅作为 `@neko/markdown` 实现细节，不是跨包契约。 | Confirmed |
| Host renderer | 将 normalized Markdown document 投影到特定宿主展示模型的 adapter，例如 Ink TUI renderer 或 React Webview renderer。它拥有展示和布局，不拥有 Markdown 语义。 | Confirmed |
| Standard Markdown node | Neko-owned normalized union 中对应 CommonMark/GFM baseline 的穷尽 typed node。 | Confirmed |
| Neko Markdown extension node | 与标准节点分离、由明确 extension contract/renderer registration 接入的 Neko-specific semantic node。 | Confirmed |
| Raw HTML node | 保留原始 HTML value/source range 的标准语义节点；TUI 安全 literal 展示，不解释或执行。 | Confirmed |
| Exhaustive projection | 每个 normalized standard-node variant 必须有显式 host projection；新增未处理 variant 导致编译或 contract test 失败。 | Confirmed |
| Markdown annotation | 与 semantic tree 正交、可重叠并通过 source range 或 target node 关联的语义标注，例如 prompt span、creative-table interpretation 或 provenance。 | Confirmed |
| Markdown resolution snapshot | 针对一个 document snapshot 保存 mention/resource/image/annotation 的 context-dependent resolution、diagnostics 和 derived handoff refs 的不可变结果。 | Confirmed |
| Source-deterministic parse | 同一 source 与 parser contract 产生同一 normalized semantic/annotation 结构，过程不调用 workspace/entity/resource IO。 | Confirmed |
| Semantic node | normalized document 中具有明确 Markdown/Neko 含义的 typed node，例如 heading、paragraph、table、link 或 Neko extension。 | Confirmed |
| Canonical assistant Markdown path | 从首个 assistant source delta 到 finalization 唯一允许的 streaming-session → semantic-document → terminal-projector/layout → Ink 路径。 | Confirmed |
| Legacy renderer poison test | 将旧 parser/renderer 配置为一旦被调用即失败，用路径级断言证明新 assistant message 未经过 compatibility path 的测试。 | Confirmed |
| Markdown session ID | 一次 append/finalize streaming parse 生命周期的 opaque identity，用于隔离不同消息/会话的异步结果。 | Confirmed |
| Document revision | streaming session 内每次 snapshot 更新的单调版本号，用于拒绝 stale resolution/highlight/layout 结果。 | Confirmed |
| Markdown node ID | session-local、opaque、deterministic semantic-node identity；stable prefix 未改变节点可跨 append revision 复用，但不持久化。 | Confirmed |
| Markdown annotation ID | session-local、opaque、deterministic annotation identity；结合 kind、target/range 和 provenance 区分重叠标注。 | Confirmed |
| Markdown streaming session | 接受 append-only Markdown source 增量并产生 normalized document、stable prefix、mutable tail 和 final 状态的 host-agnostic 解析会话。 | Confirmed |
| Terminal link target | TUI 经 scheme/path policy 验证后的 structured hyperlink target；与 Markdown 原始 destination 分离。 | Confirmed |
| Link fallback text | 安全 hyperlink capability 不可用时显示的 `label (destination)` 或等价可见表示，防止隐藏实际 target。 | Confirmed |
| Renderer-owned terminal encoding | 只有终端输出边界可根据 resolved style/validated link 产生 ANSI、CSI 或 OSC；provider source 不得直接产生控制效果。 | Confirmed |
| Unsafe terminal control | Markdown/provider source 中的 ESC、CSI、OSC、BEL 或其他 C0/C1 控制数据；必须安全可见化并关联 diagnostic/source range。 | Confirmed |
| Terminal commit | TUI 将已经投影和布局的稳定内容纳入终端历史/scrollback 的宿主操作；不属于 Markdown 语法契约。 | Confirmed |
| Active table | 已由 header 与 delimiter 建立、但尚未遇到结构终点或 session finalize 的 streaming table。 | Confirmed |
| Terminal Markdown presentation model | `cli-tui` 内、Markdown-specific 的 styled segments 和 logical blocks；位于共享 semantic document 与 width-dependent terminal layout 之间，不是跨宿主契约。 | Confirmed |
| Terminal Markdown projector | 将 normalized Markdown semantic nodes 转换为 package-local terminal logical blocks/segments 的纯 adapter；不解析 Markdown grammar。 | Confirmed |
| Terminal Markdown layout | 根据 viewport、terminal capability 和 theme 将 logical blocks 排版为 resolved terminal lines 的纯布局阶段。 | Confirmed |
| Thin Ink adapter | 只把 resolved terminal lines/segments 映射为 Ink components、交互和输出的视图边界。 | Confirmed |
| Markdown terminal theme | 现有 TUI theme 的 Markdown semantic-role 映射扩展；将 role 解析为 terminal foreground/background 和字体属性。 | Confirmed |
| Resolved terminal style | 结合 semantic role、theme、`NO_COLOR` 和 terminal capability 后得到的最终 fg/bg/text attributes；只存在于 TUI presentation/layout 边界。 | Confirmed |
| Normalized code language | 由 fenced-code info 规范化得到、供 host highlighter 选择 grammar 的稳定语言身份；不是具体 grammar/runtime 对象。 | Confirmed |
| Terminal code highlighter | `cli-tui` 内对完整 code block 进行 tokenization、处理 generation/cancellation/guardrail 的 package-local port。 | Confirmed |
| Syntax token role | host-neutral enough for TUI syntax theme 的代码词法/语法类别，例如 keyword、string、comment；不包含终端颜色。 | Confirmed |
| Highlight generation | 与特定 streaming code snapshot 绑定的单调身份，用于丢弃晚到的旧异步高亮结果。 | Confirmed |
| Markdown diagnostic | 具有稳定 code、severity、phase、structured parameters 与可选 source/node/annotation 关联的机器契约；最终人类文案由宿主本地化。 | Confirmed |
| Contract violation | normalized AST、identity、renderer、theme、layout 或 canonical-path 不变量被开发代码破坏的不可恢复错误；开发/测试必须直接失败。 | Confirmed |
| Fatal rendering block | 生产 message boundary 捕获意外 contract failure 时显示的明确错误块；不能伪装为成功纯文本渲染。 | Confirmed |
| Recoverable presentation | 对外部 highlighter、link、resource、image 等边界失败保留安全内容并附 diagnostic 的明确展示结果。 | Confirmed |
| Stale async result | session/revision/generation 已落后于当前 snapshot 的异步结果；正常丢弃，不覆盖当前内容或显示用户错误。 | Confirmed |
| Plain-code fallback | unknown language、超限或外部 highlighter failure 时，保留完整代码但不着色的受控展示结果；不得调用 legacy regex highlighter。 | Confirmed |
| Syntax theme | 将 code token category 映射为代码 foreground/font attributes 的独立主题；不拥有 heading、link、table 等 Markdown 结构样式。 | Confirmed |
| Inherited background | presentation 不绘制自有背景色而沿用终端/应用现有背景的默认策略。 | Confirmed |
| Markdown style role | 与 Markdown 语义对应、尚未绑定具体终端颜色的 presentation role，例如 heading、link、inline-code 或 table-border。 | Confirmed |
| Table semantic node | normalized document 中保存 header、rows、cell inline content、alignment 和 source provenance 的表格语义；不随 viewport 改变。 | Confirmed |
| Table presentation mode | TUI 对同一 table semantic node 选择的 aligned-grid、vertical-records 或 stacked-records 展示形式。 | Confirmed |
| Aligned grid | 保持二维行列结构并按 GFM left/center/right metadata 对每个 visual cell line 补齐 display-width padding 的展示模式。 | Confirmed |
| Vertical records | 将每个 body row 投影为一组 header-label/value pair 的窄屏展示模式。 | Confirmed |
| Stacked records | 在极窄宽度下将 label 和 value 分行显示的 record 模式。 | Confirmed |
| Compact column | 主要由数字、状态、布尔值、日期和短标签组成，应尽量保持完整值的表格列画像。 | Confirmed |
| Narrative column | 主要由自然语言句子/描述组成，可按自然边界换行并吸收宽度，但不能被压成持续高窄文字柱的列画像。 | Confirmed |
| Token-heavy column | 主要由 URL、路径、hash、UUID、标识符或长代码 token 组成，需要跟踪不可自然断行片段的列画像。 | Confirmed |
| Natural width | 内容在不主动换行时需要的 display width，连同具体 block/cell 的结构开销参与布局。 | Confirmed |
| Preferred floor | 某列仍能保持正常阅读体验的目标宽度下限；可在必要时突破，但会增加 fallback/readability 成本。 | Confirmed |
| Hard floor | grid presentation 允许的绝对列宽下限；突破后必须拒绝 grid，而不是继续压缩。 | Confirmed |
| Projected row height | 给定候选列宽后，根据 wrap 结果估算的 visual row 高度，用于识别数学上可容纳但不可读的 grid。 | Confirmed |
| TerminalTextMetrics | `cli-tui` 内统一提供 display-width、grapheme segmentation、styled wrap 和 padding/alignment 的 Neko-owned 契约。 | Confirmed |
| Grapheme cluster | layout 可安全切分的用户感知字符边界；combining、variation selector、ZWJ、flag 和 skin-tone sequence 不得被任意拆开。 | Confirmed |
| Terminal display column | 终端布局使用的水平单元坐标；与 UTF-16 offset、code point 和 grapheme index 分离。 | Confirmed |
| Display width | 文本按 canonical `TerminalTextMetrics` 在终端占用的列数；用于测宽、padding、alignment 和 viewport allocation，不等于 UTF-16 length。 | Confirmed |
| Stable region | streaming snapshot 中位于 `stableEndOffset` 之前、对 append-only 后续输入保持语义稳定的 source/semantic 区域；不等同于已提交 terminal scrollback。 | Confirmed |
| Mutable tail | streaming snapshot 中仍可能因未闭合 block、active table 或后续 token 而重新解析的 source/semantic 尾部。 | Confirmed |
| Table holdback | `@neko/markdown` 在 active table 结束前将其保持在 mutable tail 的语法稳定性策略；具体列宽与 terminal commit 仍由 TUI 决定。 | Confirmed |
| Ragged table row | canonical GFM parser 已识别为 table、但实际 cell 数与 header/alignment/其他 row 不一致的语义行；其实际 source-backed cells 必须原样保留。 | Confirmed |
| Rectangular presentation matrix | TUI projector 按 table 中最大实际列数构造的展示矩阵；只用于 grid/record layout，不回写 normalized semantic table。 | Confirmed |
| Synthetic empty table cell | 为补齐较短 ragged row 而生成、仅存在于 presentation 的空 cell；记录 projection provenance，但没有伪造 source range。 | Confirmed |
| Synthetic table column label | source header 缺少对应列时，record mode 为额外列生成的确定性本地化标签，例如 `Column 4`；不属于 Markdown source。 | Confirmed |
| Table row width mismatch | `MD_TABLE_ROW_WIDTH_MISMATCH` 表示已识别 table 内 header、alignment metadata 或 body row 的列数不一致，且内容仍按保真策略展示。 | Confirmed |
| Logical code line | 由 normalized code value 中真实 source newline 划分的权威代码行；viewport resize 不改变其内容或身份。 | Confirmed |
| Visual code fragment | TUI 将一个 logical code line 软换行后产生的 presentation 片段；关联 source line/range 与 fragment index，但不向 source 插入换行。 | Confirmed |
| Grapheme-safe code wrap | 先按自然边界、必要时按 grapheme cluster 切分 styled code spans 的布局过程；不破坏 Unicode sequence 或高亮 role。 | Confirmed |
| Continuation gutter | 可显示 visual fragment 延续状态的 renderer-owned 边栏；不是代码内容、source provenance 或权威复制结果。 | Confirmed |
| Semantic code copy | 直接读取 normalized original code value 的复制/导出行为；不从 terminal lines 重建，也不包含视觉换行、边框或 gutter。 | Confirmed |
| MarkdownResourcePolicy | 集中定义 canonical source hard limit、streaming update、table layout、highlight 和 cache budgets 的 package-local 契约；首版不作为用户设置。 | Confirmed |
| Hard semantic limit | 超过后无法承诺完整 canonical semantic document 的确定性输入边界；必须显式 fatal diagnostic，不能部分成功或 legacy fallback。 | Confirmed |
| Soft enhancement budget | 超过后关闭或替换高成本 presentation/enhancement、但仍保留完整 semantic content 的确定性边界。 | Confirmed |
| Coalesced Markdown update | 高频 append delta 被合并为针对最新累计 source 的一次 canonical snapshot 更新；减少中间 revision，不改变 final semantics。 | Confirmed |
| Table grid budget | 允许执行完整 column profiling/grid allocation 的 presentation 预算；超限后确定性进入线性 record presentation。 | Confirmed |
| Highlight budget | whole-block syntax highlighter 可接受的代码 byte/line 预算；超限时完整 plain-code presentation 并产生 typed diagnostic。 | Confirmed |
| Latest-only layout | 连续 resize/layout 请求中只允许最新 generation 生效，旧结果按 stale async contract 丢弃的调度策略。 | Confirmed |
| Temporary legacy host implementation | 在迁移窗口内仍服务某宿主、但不再拥有 canonical Markdown 语义且具有明确移除 change/gate 的旧 renderer/parser 路径。 | Confirmed |
| Webview migration removal gate | 判定 Agent Webview 已消费 normalized document、删除独立 canonical parse 和通过 legacy poison tests 的可验证退出条件集合。 | Confirmed |
| Cross-host semantic fixture corpus | TUI 与 Webview adapter 共用的 CommonMark/GFM、extension、source-range 和 diagnostic 输入/期望契约集合。 | Confirmed |
| Host semantic convergence | 所有 Markdown host 都只消费 Neko normalized semantic contract、仅保留各自 presentation adapter 的完成状态。 | Confirmed |
| Structured terminal assertion | 针对 `TerminalLine`/styled segment 的 role、text、display width、range、provenance 和 metadata 做精确断言，而非只比较整屏字符串。 | Confirmed |
| Canonical-path acceptance | 通过调用证据和 legacy poison test 证明 assistant delta/finalize 实际经过 streaming session、normalized projector/layout 的路径级验收。 | Confirmed |
| PTY runtime acceptance | 在真实 pseudo-terminal/Ink 环境验证 terminal capabilities、ANSI encoding、resize、streaming 连续性和最终可见输出。 | Confirmed |
| Focused Agent Markdown evaluation | 使用 Neko Agent evaluation skill 对 mixed Markdown、table、code、Unicode、streaming syntax 和 unsafe controls 执行的脚本驱动真实行为验收。 | Confirmed |
| Resource boundary triplet | 对每个确定性限制执行 `limit - 1`、`limit`、`limit + 1` 的边界测试集合。 | Confirmed |

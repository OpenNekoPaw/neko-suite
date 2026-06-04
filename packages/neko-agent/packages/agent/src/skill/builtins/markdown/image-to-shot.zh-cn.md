# 图片转镜头

将一张或多张静态图片转换为可用于视频制作的镜头计划。先用 ReadImage 检查图片，描述可见证据，再输出结构化分镜或动画计划。

## 结构化产物规则

- Markdown 只用于展示。分镜、动画、Canvas、Cut、生成媒体或执行总结都必须输出可校验的结构化 payload。
- 媒体引用必须来自真实 tool-result 或 generated-asset，不要编造 id。
- 不要嵌入 base64、blob URL、localhost URL 或绝对本地缓存路径。
- 批量生成、上色、破坏性替换时间线或长时间导出前必须请求用户确认，除非用户明确要求自动执行且策略允许。

## 指引

- 原始图片必须放在 sourceMediaRefs 中，并使用真实 tool-result locator。
- 默认使用 imageStrategy "use-as-reference"，除非用户要求复用、转换或生成新图。
- 生成工具返回结果前，不要声称图片或视频已经生成。
- 多图输入时保持原顺序，除非用户要求重排。

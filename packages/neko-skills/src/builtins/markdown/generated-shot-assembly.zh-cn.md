# 已生成镜头装配

汇总已生成媒体引用，校验来源，并总结哪些内容可以装配。只有目标可用且用户希望交付时，才使用时间线或 Canvas capability。

## 结构化产物规则

- Markdown 只用于展示。分镜、动画、Canvas、Cut、生成媒体或执行总结都必须输出可校验的结构化 payload。
- 媒体引用必须来自真实 capability-result 或 generated-asset，不要编造 id。
- 不要嵌入 base64、blob URL、localhost URL 或绝对本地缓存路径。
- 批量生成、上色、破坏性替换时间线或长时间导出前必须请求用户确认，除非用户明确要求自动执行且策略允许。

# 动画计划转 Cut

将动画计划转换为 Cut 可用的时间线 payload。先查询时间线上下文，保留镜头顺序，未经确认不要破坏性替换。

## 结构化产物规则

- Markdown 只用于展示。分镜、动画、Canvas、Cut、生成媒体或执行总结都必须输出可校验的结构化 payload。
- 媒体引用必须来自真实 tool-result 或 generated-asset，不要编造 id。
- 不要嵌入 base64、blob URL、localhost URL 或绝对本地缓存路径。
- 批量生成、上色、破坏性替换时间线或长时间导出前必须请求用户确认，除非用户明确要求自动执行且策略允许。

## 指引

- 优先使用已有 generated asset refs 或 `resultRef`。
- 缺少媒体时，输出 Cut payload 草稿并清楚标注缺失素材。
- 替换现有时间线或一次添加大量元素前必须询问。

# 领域文档

`docs/domains/` 用于管理创作领域内的能力模型、领域架构、数据流和集成边界。领域文档可以跨多个包，但只服务一个产品/创作领域。

## 目录规则

领域文档放在：

```text
docs/domains/<domain>/
```

领域架构文档放在：

```text
docs/domains/<domain>/architecture.md
```

不要把领域内部架构放到 `docs/architecture/<domain>/`。`docs/architecture/` 只保存系统级约束和跨领域不变量。

## 建议领域

| 领域 | 典型 owner packages |
|------|---------------------|
| `agent/` | `neko-agent`, `neko-dashboard`, `neko-entity`, `neko-search` |
| `video/` | `neko-cut`, `neko-preview`, `neko-engine`, `neko-proto` |
| `audio/` | `neko-audio`, `neko-engine`, `neko-proto` |
| `model/` | `neko-model`, `neko-engine`, `neko-proto` |
| `sketch/` | `neko-sketch`, `neko-ui` |
| `puppet/` | `neko-puppet`, `neko-engine`, `neko-proto` |
| `assets/` | `neko-assets`, `neko-market`, `neko-suite` |
| `story/` | `neko-story`, `neko-agent`, `neko-search` |
| `live/` | `neko-live`, `neko-engine`, `neko-audio` |

只在有正文需要时创建对应领域目录，避免维护空目录。

## 推荐文件

| 文件 | 内容 |
|------|------|
| `README.md` | 领域范围、不负责范围、owner packages、阅读路径 |
| `architecture.md` | 领域内部架构、核心抽象、模块边界 |
| `capability-map.md` | 能力地图、扩展点、能力提供者 |
| `data-flow.md` | 用户意图、项目数据、预览、导出、回写路径 |
| `integration.md` | 与 Engine、Proto、Agent、Assets、Search 等集成边界 |

## 提升规则

领域文档中的约束如果开始影响多个领域，应该提升到 `docs/architecture/`；领域文档保留简短摘要并链接系统级文档。

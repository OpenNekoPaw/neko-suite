# 状态文档

`docs/status/` 用于保存有时间点属性的 gap、迁移、健康度、审计和盘点结果。状态文档天然会过期，只记录“某一时刻观察到了什么”，不作为长期架构事实来源，也不承担任务管理。

## 与 OpenSpec 的边界

| 内容 | 放置位置 |
|------|----------|
| 某天的观察、盘点、审计、gap 快照 | `docs/status/` |
| 要实现、要评审、要验收的变更 | `openspec/changes/<change>/` |
| 当前迭代任务队列 | `TODO_CN.md` / `TODO.md` |
| 长期方向和阶段目标 | `ROADMAP_CN.md` / `ROADMAP.md` |
| 稳定下来的系统约束 | `docs/architecture/` |
| 稳定下来的领域结论 | `docs/domains/<domain>/` |

简单判断：

```text
Status = 观察和快照
OpenSpec = 计划和变更
Architecture / Domain = 稳定事实
TODO / Roadmap = 队列和方向
```

## 子目录

| 目录 | 用途 |
|------|------|
| `gap-analysis/` | 文档、架构、功能或质量缺口分析 |
| `migration/` | 迁移计划、迁移进度和收敛状态 |
| `health/` | 仓库健康度、质量审计和风险盘点 |
| `migration/` | 带日期的迁移库存、调用方盘点和收敛快照 |

未产生正文前不必创建所有子目录。状态文件命名必须包含日期：

```text
YYYY-MM-DD-<scope>.md
```

## 写作要求

每份状态文档应标注：

- 快照日期；
- 检查范围；
- 结论状态；
- 行动项流转；
- 后续归档路径。

## 硬规则

- 状态文档不能命名为 `current.md`、`latest.md`、`todo.md`、`plan.md`。
- 状态文档中的行动项只能作为候选，不能在 status 文档内持续推进。
- 一旦行动项需要设计、实现、验收或跨模块协调，转入 `openspec/changes/`。
- 一旦行动项只是排队事项，转入 `TODO_CN.md` / `TODO.md`。
- 一旦行动项属于长期方向，转入 `ROADMAP_CN.md` / `ROADMAP.md`。
- 一旦结论稳定，提升到 `docs/architecture/` 或 `docs/domains/`，并从状态文档链接归档位置。

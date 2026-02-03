# Neko Script

> 通讯协议：AI 指令流与自动化剪辑的底层标准语言

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：脚本协议，自动化剪辑 DSL
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Script** 是 Neko Suite 的通讯协议层，定义了 AI 指令流与自动化剪辑的底层标准语言。它是连接 AI Agent 与渲染引擎的桥梁，让所有视频编辑操作都可以用文本指令表达。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **语法高亮** | Neko Script 语法着色 |
| **脚本验证** | 语法检查、错误提示 |
| **脚本执行** | 直接执行脚本指令 |
| **时间线转换** | 脚本 ↔ 时间线双向转换 |
| **自动补全** | 指令、参数智能补全 |

---

## 文件格式

| 扩展名 | 说明 |
|--------|------|
| `.nksc` | Neko Script 脚本文件 |
| `.nekoscript` | Neko Script 脚本文件（完整扩展名） |

---

## 脚本语法示例

```nekoscript
// 创建项目
project.create({
  name: "My Video",
  resolution: [1920, 1080],
  fps: 30
})

// 添加轨道
track.add({ type: "media", name: "Video Track" })

// 添加素材
element.add({
  track: "Video Track",
  src: "intro.mp4",
  startTime: 0,
  duration: 10
})

// 添加转场
transition.add({
  element: "intro.mp4",
  type: "fade",
  duration: 1
})

// 添加特效
effect.add({
  element: "intro.mp4",
  type: "blur",
  params: { radius: 5 }
})

// 导出视频
export.video({
  output: "output.mp4",
  codec: "h264",
  quality: "high"
})
```

---

## 配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.script.autoValidate` | `true` | 保存时自动验证 |
| `neko.script.executeOnSave` | `false` | 保存时自动执行 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `Neko Script: Run Script` | 执行脚本 |
| `Neko Script: Validate Script` | 验证脚本 |
| `Neko Script: Generate Script from Timeline` | 从时间线生成脚本 |
| `Neko Script: Apply Script to Timeline` | 应用脚本到时间线 |

---

## 工作流

```
方式一：AI 驱动
    用户意图 → NekoAgent → Neko Script → 执行

方式二：手动编写
    编写脚本 → 验证 → 执行 → 时间线更新

方式三：逆向生成
    时间线编辑 → 生成脚本 → 版本控制
```

---

## 版本控制优势

由于所有编辑操作都可以用 Neko Script 表达，视频项目可以像代码一样进行版本控制：

```bash
# 查看编辑历史
git log --oneline project.nksc

# 分支创作
git checkout -b feature/new-intro

# 合并修改
git merge feature/new-intro

# 回滚到之前版本
git checkout HEAD~1 project.nksc
```

---

## 依赖关系

```
neko-script (独立)
    └── @neko/shared (类型)
```

---

## 技术栈

- **语言服务**：LSP (Language Server Protocol)
- **语法定义**：TextMate Grammar
- **解析器**：TypeScript
- **类型**：@neko/shared

---

## License

MIT

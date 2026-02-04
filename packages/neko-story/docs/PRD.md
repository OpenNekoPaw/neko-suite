# Neko Story - 功能设计文档

## 1. 产品定位

**Neko Story** 是一个 VSCode 扩展，为剧本创作者提供 Fountain 格式的完整编辑支持，并与 neko-suite 生态深度集成，实现从剧本到视频制作的无缝工作流。

---

## 2. 功能需求

### 2.1 Fountain 格式支持

支持 Fountain 剧本标记语言的完整语法：

| 元素 | 语法 | 示例 |
|------|------|------|
| 场景标题 | `INT./EXT.` 开头，或 `.` 强制 | `INT. 咖啡厅 - 日` |
| 角色名 | 全大写，前有空行 | `SARAH` |
| 角色扩展 | 角色名后括号 | `SARAH (V.O.)` |
| 对话 | 紧跟角色名 | 普通文本 |
| 括号注释 | `()` 包裹 | `(看向窗外)` |
| 动作描述 | 默认段落，或 `!` 强制 | `他走进房间。` |
| 转场 | 以 `TO:` 结尾，或 `>` 强制 | `CUT TO:` |
| 居中文本 | `>文本<` | `>第一幕<` |
| 强调 | `*斜体*` `**粗体**` `_下划线_` | `*重要*` |
| 双人对话 | 第二角色名后 `^` | `BOB ^` |
| 歌词 | `~` 开头 | `~歌词内容` |
| 章节 | `#` 开头（层级） | `# 第一幕` |
| 概要 | `=` 开头（不打印） | `= 场景概要` |
| 注释 | `//` 或 `/* */` 或 `[[ ]]` | `// 备注` |
| 分页符 | `===` 或 `---` | `===` |
| 标题页 | 文件开头 key: value | `Title: 我的剧本` |

### 2.2 编辑器功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| **语法高亮** | 不同元素使用不同颜色/样式 | P0 |
| **大纲视图** | 按场景/章节层级显示结构 | P0 |
| **符号跳转** | Cmd+Click 跳转到角色/场景定义 | P1 |
| **自动补全** | 角色名、场景位置智能提示 | P1 |
| **悬停提示** | 显示角色出场统计、场景信息 | P2 |
| **代码折叠** | 按场景/章节折叠 | P2 |
| **格式化** | 自动规范化 Fountain 格式 | P2 |

### 2.3 LSP 功能

| 功能 | 描述 |
|------|------|
| **诊断** | 格式错误、角色名不一致警告 |
| **定义跳转** | 跳转到角色首次出场 |
| **引用查找** | 查找角色所有出场位置 |
| **重命名** | 批量重命名角色 |
| **工作区符号** | 全局搜索场景/角色 |

### 2.4 实时预览

| 功能 | 描述 |
|------|------|
| **剧本预览** | 渲染为标准剧本格式（PDF 样式） |
| **同步滚动** | 编辑器与预览同步定位 |
| **导出 PDF** | 导出为标准剧本 PDF |

### 2.5 Neko-Suite 集成

| 功能 | 描述 |
|------|------|
| **转换为时间线** | 将剧本场景转换为 neko-cut 时间线 |
| **资产链接** | 链接 neko-assets 中的角色/场景资产 |
| **分镜生成** | 调用 AI 生成分镜草图 |
| **跨模块跳转** | 从剧本跳转到关联的时间线/资产 |

---

## 3. 模块架构

```
neko-story/
├── packages/
│   ├── extension/          # VSCode 扩展入口
│   │   └── src/
│   │       ├── extension.ts
│   │       ├── commands/   # 命令注册
│   │       └── providers/  # VSCode Provider 适配
│   │
│   ├── parser/             # Fountain 解析器（纯逻辑）
│   │   └── src/
│   │       ├── lexer.ts    # 词法分析
│   │       ├── parser.ts   # 语法分析
│   │       ├── ast.ts      # AST 类型定义
│   │       └── visitor.ts  # AST 遍历器
│   │
│   ├── lsp/                # LSP 服务器
│   │   └── src/
│   │       ├── server.ts   # LSP 入口
│   │       ├── features/   # LSP 功能实现
│   │       │   ├── completion.ts
│   │       │   ├── definition.ts
│   │       │   ├── diagnostics.ts
│   │       │   ├── hover.ts
│   │       │   └── symbols.ts
│   │       └── index.ts
│   │
│   ├── webview/            # 预览 UI（React）
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── ScriptRenderer.tsx
│   │       │   └── Outline.tsx
│   │       └── styles/
│   │
│   └── types/              # 共享类型
│       └── src/
│           ├── fountain.ts # Fountain AST 类型
│           ├── protocol.ts # 通信协议
│           └── index.ts
```

### 3.1 模块职责

| 模块 | 职责 | 依赖 |
|------|------|------|
| **types** | 共享类型定义 | 无 |
| **parser** | Fountain 解析，生成 AST | types |
| **lsp** | 语言服务器，提供智能功能 | types, parser |
| **webview** | 预览渲染 UI | types |
| **extension** | VSCode 集成，协调各模块 | types, lsp |

### 3.2 依赖关系

```
extension → lsp → parser → types
              ↘           ↗
          webview ────────
```

---

## 4. 核心接口设计

### 4.1 AST 类型 (types/fountain.ts)

```typescript
// Fountain 文档
interface FountainDocument {
  titlePage: TitlePage | null;
  elements: FountainElement[];
}

// 元素基类
interface FountainElement {
  type: ElementType;
  range: Range;
  raw: string;
}

type ElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'page_break'
  | 'lyrics';

// 场景标题
interface SceneHeading extends FountainElement {
  type: 'scene_heading';
  intExt: 'INT' | 'EXT' | 'INT/EXT' | 'EST' | null;
  location: string;
  time: string | null;
  sceneNumber: string | null;
}

// 角色
interface Character extends FountainElement {
  type: 'character';
  name: string;
  extension: string | null;  // V.O., O.S., CONT'D
  isDualDialogue: boolean;
}

// 对话
interface Dialogue extends FountainElement {
  type: 'dialogue';
  text: string;
  character: string;  // 关联的角色名
}
```

### 4.2 解析器接口 (parser)

```typescript
interface IFountainParser {
  parse(text: string): FountainDocument;
  parseIncremental(text: string, changes: TextChange[]): FountainDocument;
}

interface IFountainLexer {
  tokenize(text: string): Token[];
}
```

### 4.3 LSP 功能接口 (lsp)

```typescript
interface ICompletionProvider {
  provideCompletions(doc: FountainDocument, position: Position): CompletionItem[];
}

interface IDefinitionProvider {
  provideDefinition(doc: FountainDocument, position: Position): Location | null;
}

interface IDiagnosticsProvider {
  provideDiagnostics(doc: FountainDocument): Diagnostic[];
}
```

---

## 5. 实现计划

### Phase 1: 基础功能 (P0)

1. **parser 模块**：实现 Fountain 词法/语法分析
2. **语法高亮**：TextMate Grammar 定义
3. **大纲视图**：DocumentSymbolProvider

### Phase 2: LSP 功能 (P1)

1. **LSP 服务器**：基础框架搭建
2. **自动补全**：角色名、场景位置
3. **定义跳转**：角色首次出场

### Phase 3: 预览与集成 (P2)

1. **webview 预览**：剧本渲染
2. **neko-suite 集成**：时间线转换、资产链接

---

## 6. 参考资料

- [Fountain 官方语法](https://fountain.io/syntax)
- [VSCode Language Server Protocol](https://microsoft.github.io/language-server-protocol/)

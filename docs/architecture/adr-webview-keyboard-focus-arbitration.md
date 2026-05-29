# ADR: Webview 快捷键、输入法与多面板焦点仲裁

## 状态

Accepted (2026-05-29)

## 背景

Neko Suite 的 Canvas、Cut、Sketch、Model、Audio、Preview、Agent 等 webview
都需要键盘操作：播放控制、删除选择、撤销重做、工具切换、画布平移、节点编辑、
文本输入、属性面板输入与浮层确认。随着多个编辑器面板同时打开，当前实现暴露出
两类冲突：

1. **跨面板冲突**：多个 webview panel 同时存活时，一个 VSCode keybinding
   命令可能被发送到错误面板，或被广播到多个面板。
2. **面板内冲突**：同一 webview 内，画布、节点、浮层、属性控件和文本输入框
   分别监听同一个按键，导致输入框中的 Delete、Space、Enter、Cmd/Ctrl+A 等
   同时触发节点删除、画布平移、全选或生成命令。

输入法（IME）使问题更明显。中文、日文等组合输入期间，Enter、Escape、Space 和
字母键是编辑文本的一部分，不能被解释为编辑器快捷键。

现状中各子包自行处理：

| 子包 | 当前模式 | 风险 |
|------|----------|------|
| `neko-canvas` | Extension 将 VSCode keybinding 转成 `keyboardAction`；webview 内仍有多个 `window.addEventListener('keydown')` | `keyboardAction` 可绕过输入框焦点；Space/H/Delete 等局部监听不一致 |
| `neko-sketch` | 已有 `isEditableTarget()` + `event.isComposing` 的局部工具函数 | 逻辑较好，但只在 Sketch 内部可用 |
| `neko-cut` | webview 级 `useKeyboardShortcuts()`，只排除 `input/textarea` | 未覆盖 `select/contenteditable/IME`，子组件仍有全局监听 |
| `neko-audio` | Extension command 使用 `postToActivePanels()` 广播给所有 active panels | 多音频/项目面板同时打开时容易多面板响应 |
| `neko-model` | 单一 `activeWebviewPanel` + `keyboardAction` | 多模型面板时 active 归属不稳定，webview 侧缺少通用 editable guard |
| `@neko/ui` | 部分 primitive/creative/context menu 自己监听 `keydown` | 缺少统一 KeyboardBoundary 合同 |

这不是单个快捷键错误，而是缺少统一的“键盘事件所有权”与“焦点域”协议。

## 关联 ADR

| 关联文档 | 关系 |
|---|---|
| [vscode-constraints.md](./vscode-constraints.md) | Webview 沙箱、postMessage 边界和面板放置策略 |
| [adr-webview-ui-design-system.md](./adr-webview-ui-design-system.md) | `@neko/ui` primitives/creative 层应承接统一焦点和键盘行为 |
| [adr-webview-layout-unification.md](./adr-webview-layout-unification.md) | workbench shell 和内嵌面板统一后，需要统一快捷键焦点域 |
| [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md) | ViewportShell 捕获输入事件时必须尊重 UI chrome / editable target 边界 |
| [adr-audio-workstation-evolution.md](./adr-audio-workstation-evolution.md) | AudioProjectSessionGateway 已提出 focused panel 语义，本 ADR 将其推广到快捷键路由 |

---

## 1. 五层分析

| 层 | 职责 | 依赖边界 | 接口 | 扩展点 | 测试重点 |
|----|------|----------|------|--------|----------|
| L0: Keyboard contract | 串行化快捷键 action、焦点域类型、路由意图 | 无 DOM/React/VSCode | `KeyboardActionEnvelope`、`KeyboardScope`、`KeyboardRouteTarget` | 新 action、新 scope | 纯类型与 guard |
| L1: Extension Host routing | VSCode keybinding command -> 唯一目标 webview | VSCode only，不引入 React | `FocusedWebviewRouter`、`postKeyboardAction()` | per-package provider adapter | 多 panel、active/visible/document URI |
| L2: Webview focus guard | 判断 editable/IME/modal/viewport chrome，决定是否消费事件 | React/DOM only，不 import `vscode` | `isEditableTarget()`、`isComposingKeyboardEvent()`、`useKeyboardDispatcher()` | 包内 shortcut table | IME、input/select/contenteditable、冒泡 |
| L2: UI primitives boundary | 输入控件、菜单、弹窗、树、时间线声明自己的键盘边界 | `@neko/ui` 内部 | `KeyboardBoundary`、`data-neko-keyboard-scope` | primitive/creative/control-specific scopes | a11y、focus-visible、Escape/Enter |
| Package adapters | 将领域快捷键映射到 store/controller 操作 | owning package only | `ShortcutBinding[]`、domain action handler | Canvas/Cut/Sketch/Audio/Model 自定义动作 | 行为回归和冲突隔离 |

核心原则：

1. **Extension Host 负责路由唯一性**：用户触发的快捷键命令只能投递到一个明确的 focused webview。
2. **Webview 负责焦点语义**：即使命令来自 VSCode keybinding，也必须经过 editable / IME / modal guard。
3. **控件优先于编辑器命令**：文本输入、select、contenteditable、浮层菜单和对话框拥有局部键盘事件的第一解释权。
4. **广播只用于状态同步**：配置变更、locale、任务进度等可广播；用户编辑命令不得广播。

---

## 2. 决策

### 2.1 引入统一 Keyboard Focus Arbitration

Neko Suite 将引入统一键盘仲裁模型：

```
VSCode keybinding / DOM keydown
        │
        ▼
┌─────────────────────────────┐
│  Focus / IME / Modal Guard  │
└──────────────┬──────────────┘
               │ allowed
               ▼
┌─────────────────────────────┐
│  Shortcut Dispatcher        │
└──────────────┬──────────────┘
               │ action envelope
               ▼
┌─────────────────────────────┐
│  Domain Action Handler      │
└─────────────────────────────┘
```

#### Extension Host 侧

每个提供 custom editor 或 webview view 的子包必须维护 focused webview registry。

用户命令路由顺序：

1. 精确 `documentUri` 或命令参数指定目标。
2. `panel.active && panel.visible`。
3. 最近一次 `onDidChangeViewState` 激活的 visible panel。
4. 单面板 fallback。
5. 无目标则返回 false，由命令入口显示用户提示。

不得用 `postToActivePanels()` 分发用户快捷键、播放、编辑、删除、导出面板切换等命令。
`postToActivePanels()` 仅保留给状态同步、配置刷新、locale、任务进度和非破坏性通知。

#### Webview 侧

所有快捷键入口统一调用 guard：

```typescript
interface KeyboardDispatchContext {
  readonly event?: KeyboardEvent | React.KeyboardEvent;
  readonly source: 'dom' | 'vscode-command' | 'component';
  readonly scope: KeyboardScope;
  readonly activeElement: Element | null;
}

type KeyboardScope =
  | 'editor'
  | 'viewport'
  | 'timeline'
  | 'node'
  | 'property-panel'
  | 'modal'
  | 'text-input'
  | 'menu';
```

guard 必须覆盖：

- `event.isComposing` 和 `keyCode === 229`
- `input`
- `textarea`
- `select`
- `[contenteditable]`
- `role="textbox"`
- 包含 `data-neko-keyboard-scope="text-input"` 的自定义控件
- 打开的 modal/menu/popover 对 Escape/Enter/Arrow 等按键的局部所有权

### 2.2 `@neko/ui` 提供共享 KeyboardBoundary

`@neko/ui` 作为 L2 React/DOM 层，提供共享工具和组件边界：

```typescript
export function isEditableTarget(target: EventTarget | null): boolean;
export function isComposingKeyboardEvent(event: KeyboardEvent | React.KeyboardEvent): boolean;
export function shouldIgnoreEditorShortcut(context: KeyboardDispatchContext): boolean;
export function stopKeyboardPropagation(event: React.KeyboardEvent): void;
export function useKeyboardDispatcher(bindings: ShortcutBinding[], options: KeyboardDispatcherOptions): void;
export function KeyboardBoundary(props: KeyboardBoundaryProps): React.ReactElement;
```

`@neko/ui` 不包含任何业务 action。各子包只提交 shortcut table。快捷键声明必须使用
结构化 key spec，避免 `Space`、`ctrl+a`、`CmdOrCtrl+A` 等字符串格式分裂：

```typescript
type KeyboardKey =
  | 'Backspace'
  | 'Delete'
  | 'Enter'
  | 'Escape'
  | 'Space'
  | 'Tab'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'
  | `Key${Uppercase<string>}`
  | `Digit${number}`
  | `F${number}`
  | ','
  | '.'
  | '/'
  | '-'
  | '='
  | '+';

interface ShortcutKeySpec {
  readonly key: KeyboardKey;
  /** Cmd on macOS, Ctrl on Windows/Linux. */
  readonly primary?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

interface ShortcutBinding<S extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly key: ShortcutKeySpec;
  readonly scope: KeyboardScope;
  readonly allowInEditable?: boolean;
  readonly when?: (state: S) => boolean;
  readonly action: () => void;
}
```

`KeyboardKey` 以 DOM `KeyboardEvent.code` 的稳定值为主（如 `KeyZ`、`Digit1`、
`Space`），仅对标点键保留字符值。面向 VSCode `package.json` 的 keybinding
字符串由 adapter 派生，不作为 webview 内部合同。这样可以避免键盘布局、
大小写和 macOS/Windows primary modifier 差异进入业务快捷键表。

如需从 VSCode keybinding 字符串导入，必须经过显式 parser。该 parser 是有意
“有损”的：`ctrl`、`cmd`、`meta`、`cmdOrCtrl` 都会归一为 webview 内部的
`primary`，用于表达 macOS Cmd / Windows/Linux Ctrl 的跨平台语义；它不用于
精确还原 VSCode `package.json` 中平台特化 modifier 的原始写法。

```typescript
function parseVscodeKeybinding(value: string): ShortcutKeySpec;
function formatVscodeKeybinding(spec: ShortcutKeySpec, platform: 'mac' | 'win' | 'linux'): string;
```

### 2.3 VSCode `when` context 作为第一道拦截

可选引入 shared context key：

| Context key | 含义 |
|---|---|
| `neko.webviewTextInputFocus` | 当前 focused webview 内正在编辑文本 |
| `neko.webviewModalOpen` | 当前 focused webview 内打开 modal/menu/popover |
| `neko.webviewKeyboardOwner` | 当前键盘所有者，如 `canvas`、`timeline`、`node`、`agent-input` |

Webview 通过 postMessage 上报焦点域变化，Extension Host 设置 VSCode context。
这只是优化层；webview 自身仍必须做 guard，因为 VSCode keybinding 与 postMessage
存在异步和丢失风险。

### 2.4 快捷键冲突与 scope 优先级

同一个按键允许在不同 scope 中复用，但必须有确定性的冲突解析。默认策略是
“最内层 keyboard boundary wins”，并带显式优先级作为同层 tie-breaker：

```typescript
interface KeyboardBoundaryState {
  readonly scope: KeyboardScope;
  readonly ownerId: string;
  readonly priority: number;
  readonly containsTarget: (target: EventTarget | null) => boolean;
}

interface ShortcutDispatchResult {
  readonly handled: boolean;
  readonly bindingId?: string;
  readonly ownerId?: string;
  readonly reason?: 'editable' | 'ime' | 'modal-owned' | 'no-match' | 'handled';
}
```

默认 scope 优先级：

| 优先级 | Scope | 说明 |
|---:|---|---|
| 100 | `text-input` | 文本输入、contenteditable、role textbox |
| 90 | `modal` / `menu` / `popover` | Dialog、Popover、ContextMenu、Select dropdown |
| 70 | `property-panel` / `tree` | 属性面板、树控件和局部控件 |
| 60 | `node` | Canvas 节点、连接 inline editor |
| 50 | `timeline` | Cut/Audio/Keyframe timeline |
| 40 | `viewport` / `canvas` | 画布/3D/预览视口 |
| 10 | `editor` | 编辑器全局 fallback |

冲突检测规则：

1. 同一 `ownerId + scope` 中，不允许注册相同 `ShortcutKeySpec`，开发模式抛错。
2. 不同 scope 可注册相同 key，但 dispatcher 必须按 boundary 嵌套关系和优先级选择一个。
3. 若两个同层 boundary 拥有同 key 且都包含 target，必须显式设置不同 `priority`。
4. 捕获到事件但因 editable/IME 被拒绝时，不继续降级到外层 editor scope。
5. `allowInEditable` 只允许用于文本控件自身的局部命令，例如 Agent 输入框的
   `Shift+Tab` 模式切换；不得用于删除节点、播放控制、全局粘贴等编辑器命令。

### 2.5 FocusedWebviewRegistry 合同

Extension Host 侧统一使用 focused registry，而不是每个 provider 自行维护一个
不完整的 `activeWebviewPanel` 字段：

```typescript
interface FocusedWebviewEntry {
  readonly id: string;
  readonly viewType: string;
  readonly documentUri?: string;
  readonly panel: vscode.WebviewPanel;
  readonly webview: vscode.Webview;
  readonly createdAt: number;
  readonly lastActiveAt: number;
}

interface ResolveFocusedWebviewRequest {
  readonly viewType: string;
  readonly documentUri?: string;
  readonly allowVisibleFallback?: boolean;
}

interface IFocusedWebviewRegistry {
  register(entry: Omit<FocusedWebviewEntry, 'lastActiveAt'>): vscode.Disposable;
  markActive(id: string): void;
  markVisible(id: string, visible: boolean): void;
  unregister(id: string): void;
  resolve(request: ResolveFocusedWebviewRequest): FocusedWebviewEntry | undefined;
  postKeyboardAction(request: ResolveFocusedWebviewRequest, action: KeyboardActionEnvelope): boolean;
}
```

Provider 负责在 `resolveCustomEditor()` 中 register，在 `onDidChangeViewState` 中
同步 active/visible，在 dispose 时 unregister。命令入口不得直接持有最近创建的
panel 作为目标。

### 2.6 跨面板焦点体验

VSCode tab active 高亮是第一层视觉反馈，但 side-by-side editor group 中可能同时有
多个 visible webview。为了避免用户误解，focused webview 应收到
`{ type: 'keyboardFocus', focused: boolean }` 消息并在 workbench shell 上体现轻量状态：

- focused panel 的 root 设置 `data-neko-keyboard-focused="true"`。
- unfocused 但 visible 的 panel 不显示 active shortcut hints，且忽略 VSCode 转发的用户命令。
- 状态栏/outline 只跟随 focused panel；visible fallback 只在单面板或无 active panel 时使用。
- 视觉反馈必须轻量，优先使用现有 VSCode focus border/token，不引入新的品牌色或大面积装饰。

---

## 3. 禁止事项

1. 禁止将用户编辑命令广播给所有 active webview panels。
2. 禁止在生产代码中新增裸 `window.addEventListener('keydown')` / `document.addEventListener('keydown')`
   而不经过统一 guard。
3. 禁止只检查 `HTMLInputElement` / `HTMLTextAreaElement` 后就触发全局快捷键。
4. 禁止在 IME composition 期间触发编辑器命令。
5. 禁止让 webview 直接 import `vscode` 来查询焦点状态。

---

## 4. 迁移计划

### P0: 收住冲突

| 包 | 动作 |
|---|---|
| `@neko/ui` | 增加 keyboard focus helpers 和 `KeyboardBoundary` |
| `neko-canvas` | `keyboardAction` message 与 DOM fallback 统一经过 guard；Space/H/Delete/Cmd+A 等监听补齐 editable/IME 判断 |
| `neko-audio` | 将 command forwarding 从 `postToActivePanels()` 改为 focused panel only |
| `neko-model` | provider 维护 focused panel registry，不再只依赖最后 resolve 的 `activeWebviewPanel` |
| `neko-sketch` | 将现有 `isEditableTarget()` 行为提升为 shared helper，包内改为复用 |

### P1: 统一快捷键表

| 包 | 动作 |
|---|---|
| `neko-cut` | 将 `useKeyboardShortcuts()` 改为 `useKeyboardDispatcher()` |
| `neko-canvas` | 将节点、连接、viewport、toolbar、property panel 快捷键拆成 scopes |
| `neko-audio` | 区分 single-file editor 与 project editor 的 focused route |
| `@neko/ui/creative` | NumberInput、ColorPicker、TreeView、KeyframeTimeline 接入 KeyboardBoundary |
| `@neko/ui/primitives` | Dialog、ContextMenu、Popover、Select 声明菜单/弹窗键盘所有权 |

### P2: VSCode context 优化

为 custom editors 上报 `neko.webviewTextInputFocus` / `neko.webviewModalOpen`，
在 `package.json` keybindings 中补充 when 条件，减少 VSCode 层误触发。

---

## 5. 测试门禁

### 纯函数测试

- `isEditableTarget()` 覆盖 `input/textarea/select/contenteditable/role=textbox/data-neko-keyboard-scope`。
- `isComposingKeyboardEvent()` 覆盖 `isComposing` 与 `keyCode === 229`。
- shortcut matcher 覆盖 macOS `meta` 和 Windows/Linux `ctrl` primary modifier。
- `parseVscodeKeybinding()` / `formatVscodeKeybinding()` 在 `primary` 归一化策略下往返一致。
- 同一 scope 注册重复 key 时开发模式报错。
- 不同 scope 同 key 时按最内层 boundary 和 priority 解析。

### Webview 测试

- Canvas 节点内输入框按 Delete 不删除节点。
- Canvas 节点内输入 Space 不进入 pan mode。
- Canvas 节点内 Cmd/Ctrl+A 只选择文本，不选择所有节点。
- IME composition 中 Enter 不提交生成、不触发节点快捷键。
- Modal/menu 打开时 Escape 优先关闭 modal/menu，不清空画布选择。

### Extension Host 测试

- 打开两个同类 custom editor，快捷键只投递给 `panel.active && panel.visible` 的面板。
- 当 active panel 不存在但只有一个 visible panel 时允许 fallback。
- Audio command 不再发送给所有 active panels。
- documentUri 指定目标时不受最近 active panel 影响。
- side-by-side 打开两个 Canvas 时，focused panel 收到 `keyboardFocus: true`，另一个收到 `false`。
- focused panel 切换后，状态栏、outline 和 keyboard action 路由同步切换。

---

## 6. 影响与取舍

### 正向影响

- 多面板同时打开时，用户命令只影响一个明确目标。
- 输入法组合输入和文本编辑不再被编辑器快捷键打断。
- 各包快捷键行为从 ad-hoc 监听转为可测试 contract。
- `@neko/ui` primitives/creative 的 keyboard/a11y 行为更一致。

### 代价

- 需要一次跨包迁移，短期内会同时存在旧监听和新 dispatcher。
- Extension Host 需要为各 custom editor provider 建立 focused panel registry。
- VSCode context 上报是异步的，不能作为唯一防线。
- 结构化 key spec 增加 adapter 代码，但换来跨平台和可测试的快捷键合同。

### 非目标

- 本 ADR 不重新设计每个包的快捷键布局。
- 本 ADR 不要求所有快捷键都进入 VSCode `package.json` keybindings。
- 本 ADR 不改变 Rust engine、Protobuf 或媒体计算权威来源。

---

## 7. 当前排查结论

本 ADR 来源于 2026-05-28 对现有实现的排查：

- Canvas 的 `keyboardAction` message 直接执行，缺少 editable/IME guard。
- Canvas 的 Space pan、H hand tool、dev-mode shortcut fallback 使用多套局部判断。
- Sketch 已有较完整 editable/IME guard，可作为共享实现原型。
- Audio 的 command forwarding 存在广播式用户命令分发。
- Model/Canvas/Sketch 的 provider 依赖单一 `activeWebviewPanel`，缺少 per-panel active registry。

因此，修复重点不是单独补某个按键，而是补齐：

1. Extension Host 的 focused webview routing。
2. Webview 的 keyboard focus arbitration。
3. `@neko/ui` 的 reusable keyboard boundary。

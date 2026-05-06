# neko-engine Native Plugin & Local Asset Governance

> **范围**：本文档是 `plugin` AssetType（neko-engine 原生 cdylib 扩展）和相关 `shader` 形态的**治理与保护权威定义**；§十九同时作为所有 AssetType 的本地安装（sideload）治理定义。
> **关联**：[marketplace.md](./marketplace.md) · [manifest-schema-spec.md](./manifest-schema-spec.md) · [registry-server-contract.md](./registry-server-contract.md) · [adr-capability-protocol.md](./adr-capability-protocol.md) · [adr-asset-federation.md](./adr-asset-federation.md)

> **修订**：2026-05-06 · 对齐 native-only plugin 语义、verified publisher 字段、Workspace Trust 判定和 host-api audit 边界；明确 §十九为 sideload 全局治理。

---

## 一、范围与术语澄清

### 1.1 plugin 是什么

```
✓ plugin = neko-engine 原生扩展（仅 cdylib）
   · Rust 编译的动态库 (.so / .dylib / .dll)
   · 通过 engine PluginManager (host-api crate) 加载
   · 影响 GPU 渲染管线 / FFmpeg 滤镜链 / ML 推理 / ECS 系统

✗ plugin ≠ VSCode 扩展
   · VSCode 扩展走 VSCode 官方 marketplace
   · 不在 neko-market 范围
   · 这是文档前期表述错误，本文修正

✗ plugin ≠ WASM 模块
   · neko-engine 当前**不支持 WASM runtime**
   · 也不计划支持（见 §一.3 决策）
```

历史上 [manifest-schema-spec.md §五.8](./manifest-schema-spec.md) 把 `plugin` 描述为 "VSCode 扩展代码包"——错的。本治理文档以 **plugin = engine native cdylib**为权威表述。

### 1.2 决策：不支持 WASM

```
为什么不支持 WASM：
  · 性能：60-90% native，在视频编解码 / GPU 计算 / ML 推理场景仍不够
  · 工程成本：wasmtime / wasmer 集成 + host API 重设计 = 6+ 个月
  · 主要价值有限：高性能场景仍走 native，WASM 主要是 try-out
  · 社区贡献已有路径：通过 skill / preset / shader / identity 等其它 AssetType
    （见 §三.3 社区贡献的真实通道）

后果：
  · plugin 永远是 native cdylib
  · 必须 KYC publisher（实名认证）才能发布
  · 社区想贡献请用其它 AssetType（10 种开放）
  · 这是清晰的架构边界，不是限制
```

### 1.3 shader 同属本治理范围

虽然 `shader` 在 AssetType 上独立于 `plugin`，但它们都是 **engine artifact**：

```
shader     WGSL / GLSL 源码 / SPIR-V binary / MSL / DXIL
plugin     Rust cdylib

共同性质   都是引擎加载执行的代码 / 编译产物
共同问题   IP 保护 / Trust 闸门 / License 校验
差异      shader 跑 GPU（沙箱在 driver）；plugin 跑 CPU（无沙箱）
```

本文主体覆盖 plugin 与 shader 的治理。其它 AssetType（media / model / preset 等）的运行治理不在本文主体范围；但本地安装（sideload）作为 market 系统级能力，由 §十九统一定义。

### 1.4 关键术语

```
Native plugin       Rust 编译的 cdylib，进程级权限
Trust Tier          publisher 身份信任级别（T1 / T2 / T4）
Permission          plugin 在 manifest 中声明的权限（声明性，非沙箱）
Workspace Trust     工程级别的信任策略（沿用 VSCode 概念）
KYC                 Know Your Customer，publisher 实名认证
Watermark           binary 内嵌的用户标识（追溯泄露源）
Heartbeat           周期性 license 刷新（防离线长期使用盗版）
Developer Mode      开发者本地测试 native plugin 的临时通道（14 天自动过期）
```

---

## 二、为什么 plugin 需要专门治理

### 2.1 与媒体素材的本质差别

```
媒体素材 (image / video / audio)：
  · 价值在内容
  · 不主动执行
  · 盗版 = 复制内容
  · 防御方式：watermark / proxy / cloud render

plugin (engine native code)：
  · 价值在执行能力
  · 主动跑 CPU/GPU 指令
  · 盗版 = 复制可执行代码
  · 安全风险 = 任意机器级操作（fs / network / 凭证窃取）
  · 防御方式：trust 闸门 + 编译保护 + license check
```

媒体被复制最多 IP 损失，plugin 被植入恶意代码可能 **窃取所有用户数据**。两者治理的优先级和手段都完全不同。

### 2.2 没有沙箱的事实

Native cdylib 无法在用户态被有效沙箱化。引擎做 `dlopen` / `libloading::Library::new` 之后，plugin 代码在引擎进程内执行，权限等同引擎本身：

```
plugin 一旦被加载，可以：
  · 任意 fs 读写
  · 任意 network 请求
  · 读 keytar / OAuth token / API key
  · 启动子进程
  · GPU 直接访问
  · 内核 ioctl（高权限场景）
```

理论上 macOS app sandbox / Windows AppContainer 能限制，但：

```
✗ 平台不一致（Linux 没有等价机制）
✗ 实施需要进程隔离 + IPC，性能损失大
✗ 与 PluginManager 的"in-process load"模式不兼容
```

**因此 neko-engine plugin 不做运行时沙箱**。安全靠：
1. **谁能发**：trust tier 闸门（KYC publisher）
2. **谁能装**：用户安装时的 trust 决策
3. **谁授权用**：workspace trust + license check

### 2.3 商业化与开放生态的张力

```
完全封闭（仅核心团队发布）
  ✓ 安全
  ✗ 生态死掉（Apple App Store 困境的极端版）
  ✗ 用户绕过限制（sideload 反而更危险）

完全开放（任何 publisher 都能发布 native）
  ✓ 生态繁荣
  ✗ 一个恶意 publisher 毁所有用户

平衡（本治理采用）
  · plugin = 商业 / 专业通道，必须 KYC
  · 商业化通过 server-side build + license + watermark 防盗版
  · 社区贡献通过其它 AssetType（10 种开放通道，见 §三.3）
```

---

## 三、三档 Trust Tier

| Tier | 谁发布 | Native cdylib | 加载默认行为 |
|---|---|---|---|
| **T1 Core** | neko-suite 官方团队 | ✓ 允许 | 自动加载，无提示 |
| **T2 Verified** | KYC 实名 + 信誉 publisher | ✓ 允许（带 ✓ Verified badge） | 一键安装，显示 publisher 身份 |
| **T4 Sideload (dev-mode)** | 用户本地（开发期） | ✓ 允许（仅 dev-mode 14 天） | settings opt-in，多重 warning |

**T3 Community 不存在 plugin 通道**——匿名 publisher 不能发布 native 代码。这是工程必然，不是产品妥协。

### 3.1 核心规则

```
✓ Plugin 必须 verified publisher 以上（T1 / T2）
✓ T3 community 在 plugin 这一类是空集合
✓ T4 Sideload 仅限 developer mode 14 天
✓ Workspace trust 在 restricted 工程中不加载 sideload
✓ Trust Level 由 server 评定，client 不重算
```

### 3.2 与 Capability Protocol 的对齐

[adr-capability-protocol.md](./adr-capability-protocol.md) 三级 trust（core / community / untrusted）在 plugin 这一类映射为：

```
T1 Core       ↔ trustLevel: 'core'
T2 Verified   ↔ trustLevel: 'community' + distribution.publisher.verified === true
T3 Community  ↔ trustLevel: 'community'  (但 plugin 拒收)
T4 Sideload   ↔ trustLevel: 'untrusted'  (仅 dev-mode 例外)
```

不是新发明，是把 plugin 这一类的 trust 细化到 native-only 现实。`trustLevel` 仍由 server 评定；verified 状态归属 publisher profile，并由 server 投影到 manifest 的 `distribution.publisher` 字段，client 只读显示与拦闸，不重算。

### 3.3 社区贡献的真实通道

社区开发者想给 neko-suite 贡献怎么办？**不通过 plugin，通过其它 AssetType**：

| Type | 形态 | Native 代码？ | 社区开放？ |
|---|---|---|---|
| `plugin` | Rust cdylib | ✓ 有 | ✗ 必须 KYC |
| `skill` | markdown prompt-chain | ✗ 文本 | ✓ 任何 publisher |
| `preset` (lut/transition/...) | JSON / .cube 配置 | ✗ 数据 | ✓ 任何 publisher |
| `shader` | WGSL/GLSL 文本 / SPIR-V | ✗ GPU 沙箱 | ✓ 任何 publisher |
| `media` | 视觉/音频内容 | ✗ 数据 | ✓ 任何 publisher |
| `identity` | 角色资产包 | ✗ 数据 | ✓ 任何 publisher |
| `starter` | 工程模板 | ✗ 数据 | ✓ 任何 publisher |
| `model` (LoRA / embedding) | 权重 | ⚠ 数据 + 受 ML runtime 限制 | ✓ 任何 publisher |
| `endpoint` | API 配置 | ✗ 配置 | ✓ 任何 publisher |
| `provider` | ProviderCard 文本 | ✗ 文本 | ✓ 任何 publisher |
| `bundle` | 编排容器 | ✗ 元数据 | ✓ 任何 publisher |

**结论**：

```
社区开放 = 10 / 11 种 AssetType
仅 plugin 必须 KYC = 1 / 11 种

这不是限制，是清晰边界：
  · 想分享创作工作流 → skill
  · 想分享视觉风格 → preset / shader / media
  · 想分享角色 → identity
  · 想分享工程结构 → starter
  · 想分享自训模型 → model
  · 必须写 native 代码 → KYC 升 T2
  · 没有 KYC 还想测 native → sideload + dev-mode 自己机器上
```

这与行业惯例一致：

```
Adobe After Effects     C++ 插件需开发者订阅；ScriptUI 任意人写
DaVinci Resolve         OFX 商业为主；Lua 脚本社区
Unity                    Native plugin 严，C# script + AssetStore 开
Unreal                   C++ 插件需开发者计划；蓝图 (Blueprint) 任意
Blender                  Native rare；Python add-on 社区主流

普遍模式：
  Native = 商业 / 专业 / KYC
  Script / 配置 / 数据 = 社区 / 开放
```

### 3.4 升级路径

```
个人开发者 → 默认无 plugin 通道
            ↓ 完成 KYC + 提交身份证明
            ↓ server review（人工 + 自动，1-3 工作日）
            ↓
T2 Verified（可发 native plugin + 上 server-side compile pipeline）
            ↓ 战略合作 + 长期信誉
            ↓ neko-suite 团队邀请
            ↓
T1 Core（极少数，类似 Apple "Made for iOS" 资格）
```

降级（撤销 verified）：

```
触发条件：
  · 重大安全事件（恶意 plugin / 数据泄露）
  · 商业违约（不交服务费 / 退款大量纠纷）
  · 法律问题（盗版 IP / 涉黄涉政）

处置：
  · 立即降级到 community
  · 现有 entitlement 进入 grace period（30 天保留 + 撤销）
  · 严重情况吊销 + 黑名单
```

---

## 四、Native plugin 治理基础

### 4.1 权限现实

```
Native cdylib (Rust → .so / .dylib / .dll)
─────────────────────────────────────────
权限：进程级（用户自己的全部权限）
  · 任意 fs.read / fs.write
  · 任意 network 请求
  · 读 keytar 凭证
  · 启动子进程
  · GPU 直接访问
  · 内核 ioctl

无运行时沙箱（详见 §二.2）

→ 安全完全依赖 publisher 身份审核 + 用户明确授权
→ 这就是为什么 KYC 必须
```

### 4.2 三层信任根

```
Layer 1  Publisher 身份审核
         · KYC 实名认证（T2）/ 战略关系（T1）
         · 出问题能落实到具体法人 / 个人

Layer 2  用户安装时同意
         · 安装对话框显示 publisher 身份 + 申请权限（声明性）
         · 用户主动确认 = 接受信任 publisher

Layer 3  Workspace 上下文限制
         · trusted workspace: 全部 plugin 加载
         · restricted workspace: 仅 verified+ 加载
         · limited workspace: 仅 core 加载
```

任意一层失守都不会立即灾难，但三层都失守必然事故。

### 4.3 与 shader 的对照

```
                Native plugin    Shader (WGSL/GLSL/SPIR-V)
─────────────────────────────────────────────────────────
执行环境         CPU             GPU
沙箱             ✗ 无            ✓ GPU driver 隔离
权限范围         机器级          仅 GPU 资源
KYC 必需         ✓               否（可任意 publisher）
社区开放         ✗               ✓
```

shader 之所以能开放给社区，是因为 GPU 隔离已经把权限限定到"渲染 / 计算"范围，不能伤害用户机器。

---

## 五、PluginPermission 声明模型

由于 native plugin 没有运行时沙箱，permission 字段是**声明性**的，不是强制约束。它的作用：

```
✓ 用户告知    安装时显示"此插件声明会做 X / Y / Z"
✓ KYC 审核    publisher 提交时必须解释每项权限的合理性
✓ Engine 审计 plugin 调 host API 时 engine 记录 audit log
✓ 信誉机制    超出声明范围 → publisher 信誉降级 + 撤销 entitlement

✗ 不是沙箱    engine 无法阻止恶意 native plugin 做未声明的事
              因为 native code 本来就有进程级权限
```

### 5.1 权限枚举

```typescript
// manifest-schema-spec.md §五.8 PluginMetadata.permissions 取值

export type PluginPermission =
  // === 文件系统 ===
  | 'fs-read:project'         // 读当前工程目录（.nkcut / .nkc / 等）
  | 'fs-read:asset-library'    // 读 AssetLibrary（用户素材库）
  | 'fs-read:plugin-data'      // 读自己的数据目录
  | 'fs-write:project'         // 写当前工程
  | 'fs-write:plugin-data'     // 写自己的数据目录

  // === 网络 ===
  | 'network:host-list'        // 仅访问声明的 hosts（必填 networkHosts）
  | 'network:any'              // 任意 HTTPS（最敏感）

  // === GPU ===
  | 'gpu:render'               // 提交渲染管线
  | 'gpu:compute'              // 提交 compute shader

  // === Engine 集成 ===
  | 'engine:event-bus'         // 订阅引擎事件
  | 'engine:asset-federation'   // 调 AssetFederationRegistry

  // === 高敏感 ===
  | 'process-spawn'            // 启动子进程
  | 'system-info';             // 读系统信息（CPU / GPU model）
```

### 5.2 manifest 声明

```typescript
{
  type: 'plugin',
  typeMetadata: {
    type: 'plugin',
    data: {
      entryPoint: 'plugin_init',         // cdylib 函数符号
      apiVersion: '1.0',
      permissions: [
        'fs-read:project',
        'fs-write:project',
        'gpu:render',
        'gpu:compute',
        'network:host-list'
      ],
      networkHosts: ['api.example.com', 'cdn.example.com'],
      engineRequirements: {
        minVersion: '1.0',
        targetTriple: 'x86_64-apple-darwin',
        runtimeArtifacts: ['cdylib']
      }
    }
  }
}
```

### 5.3 KYC 审核中的权限解释

publisher 上传 plugin 时，必须为每项申请的权限提供合理性说明：

```
申请权限：fs-write:project
说明：本插件需要在工程目录写入临时缓存文件用于增量渲染
路径模式：{project}/.cache/my-plugin/*

申请权限：network:host-list
说明：本插件调用 ABC API 进行实时风格分析
hosts: ['api.abc.com']

申请权限：process-spawn
说明：本插件需要调用 ffmpeg 进行硬件加速编码
命令模式：ffmpeg -hwaccel ... -i ...
```

Server review 阶段：

```
✓ 合理性 + 范围具体 → 接受
✗ 申请 network:any 但说明含糊 → 退回（要求改 host-list）
✗ 申请 process-spawn 但无理由 → 拒绝
✗ 权限范围超出说明 → 后续 audit 发现立即降级
```

### 5.4 Engine 审计

加载 plugin 后，engine 只能可靠审计 **plugin 通过 host-api 调用的行为**。Native cdylib 若直接调用系统 API（例如 libc syscall、系统网络库、子进程 API），在 in-process 加载模型下无法跨平台可靠拦截。

因此 audit 边界是：

```
✓ 可审计     plugin 调 engine host-api / PluginContext / AssetFederationRegistry
✓ 可审计     engine 自己发起的 fs / network / gpu / event-bus 操作
✗ 不承诺     native code 直接 syscall / libc / Win32 / CoreFoundation 调用
✗ 不承诺     通过第三方 native library 绕过 host-api 的行为
```

如果未来要做到 syscall 级监控，必须改成 out-of-process plugin host + OS sandbox / seccomp / AppContainer / seatbelt 等平台能力，不属于当前 in-process PluginManager 范围。

```rust
// neko-engine/host-api/src/plugin_audit.rs

impl PluginAuditor {
  fn record_host_api_call(&self, plugin_id: &PackageId, action: &str) {
    let permission = action_to_permission(action);
    let declared = self.manifest.permissions.contains(&permission);

    self.audit_log.append(AuditEvent {
      plugin_id: plugin_id.clone(),
      action: action.to_string(),
      permission,
      declared,
      timestamp: now(),
    });

    if !declared {
      // 上报 server，但不承诺阻止 native direct syscall
      self.telemetry.send(PermissionViolation {
        plugin_id: plugin_id.clone(),
        permission,
      });
      // server 端积累 → publisher 信誉降级 → entitlement 撤销
    }
  }
}
```

**重要**：审计是**host-api 侧事后追溯**机制，不是运行时沙箱。Native code 已经能跑起来，engine 只能记录通过自身 API 的行为并上报；绕过 host-api 的直接系统调用仍依赖 KYC、签名、license、用户授权和事后处置。这就是为什么 publisher 身份必须可追溯（KYC）——出事能追责。

### 5.5 高敏感权限的额外约束

```
process-spawn        仅 T1 Core 可申请
                     T2 Verified 申请 → 进入额外人审
                     纯 publish-and-forget 通过率低

network:any          T2 Verified 必须解释用途，强烈建议改 network:host-list
                     manifest 含 network:any 的 plugin → 安装时显著 warning

system-info          所有 tier 可申请，但仅返回粗粒度信息
                     CPU 型号家族 / GPU 厂商
                     不返回精确 fingerprint（防机器追踪）

fs-write:project    安装时必须告知"此插件会写入工程文件"
                     标记为 "Modifies project files"
                     出 bug 可能损坏工程，用户需谨慎
```

---

## 六、用户安装流程（按 tier 分）

### 6.1 T1 Core publisher

```
点击安装 → 后台直接下载 + 加载 → 完成
（无对话框，因为 publisher 是官方）
```

### 6.2 T2 Verified publisher

```
点击安装
  ↓
对话框：
┌──────────────────────────────────────────────┐
│ 安装 Cyberpunk Effect Pro v2.1                │
│ Publisher: ABC Studios ✓ Verified              │
│ 大小: 12.3 MB                                  │
│ Target: x86_64-darwin                          │
│                                                │
│ 此插件声明会：                                 │
│   • 读写当前工程文件                           │
│   • 提交 GPU 渲染 / 计算                       │
│   • 访问网络（api.example.com / cdn.example.com）│
│                                                │
│ ⚠ Native plugin 拥有完整机器访问能力           │
│   仅限已验证 publisher                         │
│   超出声明范围将触发 publisher 信誉处分        │
│                                                │
│ [取消]  [安装]                                 │
└──────────────────────────────────────────────┘
```

### 6.3 T4 Sideload (dev-mode 唯一通道)

```
默认 dev-mode 关闭：
  · 用户尝试 sideload native → 被 engine 拒载
  · 提示 "需启用 Developer Mode（settings）"

启用 dev-mode 流程：
  详见 §六.4

启用后：
  · 用户在 settings "Local Plugins" 启用具体 sideload plugin
  · 仍走 §六.5 安装对话框流程
  · workspace trust = restricted 时仍不加载（保持纪律）
```

### 6.4 Developer Mode 启用流程

```
用户在 settings 勾选 "neko.market.developerMode"
  ↓
强制弹警告：
┌──────────────────────────────────────────────┐
│ ⚠ 启用 Developer Mode                          │
│                                                │
│ 这将允许：                                     │
│   · Sideload native plugin (.so/.dylib/.dll)  │
│   · 加载未签名的 native 代码                   │
│   · 跳过 publisher KYC 检查                    │
│                                                │
│ 风险：                                         │
│   · 恶意 native 代码可任意访问您的文件         │
│   · 偷取认证 token / API 密钥                  │
│   · 加密您的工程文件勒索                       │
│                                                │
│ 仅在以下场景启用：                             │
│   ✓ 您是开发者，正在测试自己写的 plugin        │
│   ✓ 您完全信任 plugin 源码（已 review）        │
│                                                │
│ ☐ 我理解这些风险，仅用于测试                   │
│ ☐ 14 天后自动关闭                              │
│                                                │
│ [取消]                              [启用]     │
└──────────────────────────────────────────────┘

启用后：
  · neko-engine 启动时显示顶部 banner "Developer mode active"
  · Market UI 顶部显示 "DEV MODE"
  · 加载商业 Tier S plugin 时被拒（防 dev-mode 调试 / 假冒商业 plugin watermark）
```

### 6.5 Sideload 安装对话框

```
用户启用 dev-mode 后，sideload native plugin：

┌──────────────────────────────────────────────┐
│ Install Local Plugin: my-test.dylib            │
│                                                │
│ Path: /Users/me/dev/my-plugin/target/release/ │
│ Size: 4.2 MB                                   │
│ Target: x86_64-apple-darwin                    │
│                                                │
│ ⚠ 此插件未经 market 审核                       │
│   未知 publisher / 未签名 / 未 review          │
│   仅限测试或可信源                             │
│                                                │
│ ☐ 我已 review 此 plugin 源代码                │
│ ☐ 仅在当前工程启用（workspace trust）         │
│                                                │
│ [取消]  [启用]                                 │
└──────────────────────────────────────────────┘
```

### 6.6 Hot reload (developer mode)

```
Developer mode 启用时:
  · neko-market 监视 sideload 路径变化
  · cdylib 文件改动 → engine reload plugin
  · WGSL 文件改动 → engine 重新编译 shader
  · Skill 文件改动 → SkillService reload

不需要每次重启 engine
开发体验类似 Vite HMR
```

### 6.7 设计原则

```
✓ Permission warning 不能折叠 / 默认隐藏
   申请 network:any / process-spawn 必须用大字 / 显著颜色
   理由：用户必须看到才能判断

✓ 安装对话框必须显示 publisher 真实身份
   T2 显示 KYC 名称
   sideload 显示 "未知 publisher"
   理由：让用户判断信任

✓ 评分 / 下载量等社会信号要展示
   降低判断门槛
   注意防刷分（server 端反作弊）

✗ Sideload native 永远不能跳过 dev-mode
   即使用户"理解风险"也不放行
   理由：用户被钓鱼后会签所有同意书
```

---

## 七、Workspace Trust

### 7.1 三档信任

```
Workspace trust = 'trusted' | 'restricted' | 'limited'

trusted (默认 - 用户自己创建的工程)
  · 全部 plugin 正常加载
  · 含 sideload 已启用的 plugin（dev-mode 时）

restricted (新打开的不熟工程 / 模板 / shared 工程)
  · 仅 T1/T2 (verified+) plugin 加载
  · sideload 全部禁用（即使 dev-mode 启用）
  · 用户可手动 promote 到 trusted

limited (untrusted source 加载的工程)
  · 仅 T1 core plugin 加载
  · T2 都拒载
  · 全只读模式
```

### 7.2 判定流程

```
打开工程 .nkcut / .nkc / 等
  ↓
检查 .neko/workspace-trust.json：
  · 已记录 trustLevel → 使用记录值
  · 已记录 demoted / blocked → restricted 或 limited
  · 无记录 → 进入来源判定
  ↓
来源判定：
  · 当前机器由 Neko 创建的新工程 → trusted
  · 从本地普通路径首次打开的既有工程 → restricted
  · market starter / shared link / collaboration checkout → restricted
  · 带 download quarantine / untrusted source 标记 → limited
  ↓
按 trust 等级决定哪些 plugin 加载
  ↓
如 restricted → 顶部条 "此工程未 trust，[Trust Workspace] / [Edit in restricted mode]"
```

`trusted` 的默认只适用于“当前用户在当前机器主动创建的新工程”。“首次打开”不是天然 trusted；必须结合来源判定，防止陌生工程自动获得 native plugin 加载权限。

### 7.3 状态持久化

```
位置：每工程的 .neko/workspace-trust.json
内容：
{
  trustLevel: 'trusted' | 'restricted' | 'limited',
  promotedAt: timestamp,
  promotedBy: userId,
  reason?: string
}

不上传 server（隐私）
跨机器不同步（每台机器独立判定）
```

### 7.4 子包工程类型默认策略

```
工程类型              默认 workspace trust
────────────────────────────────────────
neko-cut (.nkcut)     created locally → trusted；opened existing → restricted
neko-canvas (.nkc)    created locally → trusted；opened existing → restricted
neko-model (.nkm)     created locally → trusted；opened existing → restricted
neko-sketch (.nks)    created locally → trusted；opened existing → restricted
neko-puppet (.nkpup)  created locally → trusted；opened existing → restricted
neko-story (.nkst)    created locally → trusted；opened existing → restricted

market starter        restricted (从 market 下载的模板)
shared link           restricted (URL share)
collaboration         restricted (团队 git 拉来的)
quarantined download   limited (系统或 Neko 标记为不可信来源)
```

每个子包扩展通过 `WorkspaceTrustProvider` API 给 engine 报告本工程的初始 trust：

```typescript
// each subpackage extension
export interface WorkspaceTrustProvider {
  getInitialTrust(workspaceUri: string): Promise<'trusted' | 'restricted' | 'limited'>;
  onPromote(workspaceUri: string, newLevel: string): Promise<void>;
}
```

---

## 八、不加密防盗用：8 战术分层

100% 防盗版不可能。目标是让 **盗版成本 > 正版价格**。

### 8.1 T1 编译 + symbol strip + obfuscation

```
做什么：
  · cargo build --release (Rust)
  · strip 符号表（函数名 / 调试信息）
  · LLVM obfuscation（control flow flattening + string encryption）
  · 可用开源工具：obfuscator-llvm / OLLVM

防住谁：业余 reverse engineer (90%)、简单 hex editor 攻击
防不住谁：专业 cracker（VMP unwrap / IDA Pro 用户）
成本：编译期一次性配置；编译时间增加 2-3 倍；二进制体积增加 30-50%
效果：★★★☆☆  必做基线
```

### 8.2 T2 Per-user binary fingerprinting（服务端编译）

```
做什么：
  · publisher 上传源码（Rust workspace）
  · 用户购买触发 server build：注入 user-specific watermark
  · 编译期 const 嵌入 purchaserId / sessionId
  · 用户下载的是"专属副本"

防住谁：偶发分享（朋友间复制）→ 必带走自己的 watermark
防不住谁：专业 cracker（替换 watermark 段）
成本：Server 编译队列（Rust release ~30s-5min/插件）；首次购买等待
效果：★★★★★  追溯能力的关键，必做
```

详细实现见 §十 server-side compilation pipeline。

### 8.3 T3 周期性 license heartbeat

```
做什么：
  · 引擎加载 plugin 时调 server 校验
  · License token 短 TTL（24 小时 / 可配置）
  · 离线 grace 期 30 天（与 [§九.6 ExpiryEvaluator](./marketplace.md) 整合）
  · 超过 grace 期硬禁用

防住谁：撤销后保留使用（30 天后即停）
防不住谁：永不联网的极端盗版（但 30 天后停，不实用）
成本：Engine 启动多一次 server 调用 (< 100ms)；离线最多 30 天
效果：★★★★☆  必做
```

### 8.4 T4 Hardware fingerprint binding（机器锁定）

```
做什么：
  · License 绑到 device id = SHA256(MAC + CPU + 主板序列号 + GPU UUID)
  · 不同机器 license 不通过
  · 用户可在 portal 自助解绑（每月 1 次免费）
  · 团队席位另算

防住谁：朋友间复制 plugin 文件；单 license 多机器并发
防不住谁：模拟硬件 id 的虚拟机；多次解绑（解绑限制次数）
成本：用户换电脑必须解绑 + 重绑（UX 摩擦）；客服压力
效果：★★★☆☆  Tier A 推荐，Tier S 必做
```

### 8.5 T5 代码签名 + 信任链

```
做什么：
  · publisher 用其私钥签 plugin binary
  · server 维护 verified publisher 公钥链
  · 引擎拒载 unknown signature
  · 修改后的 binary 签名失效

防住谁："改 binary 绕过 license check"；fake publisher 冒充
防不住谁：专业 cracker 用自己的签名链发布到第三方平台
成本：PKI 基础设施；publisher 上手成本
效果：★★★★☆  必做（与 trustLevel 闸门协作）
```

### 8.6 T6 关键 IP 跑服务端（hybrid P1 + P3）

```
做什么：
  · 真值钱的算法（专利 IP / 专门优化）放在 server-side
  · 本地 plugin 是"瘦壳"，调云端 endpoint 完成核心计算
  · 例：Photogrammetry plugin 把神经网络重建放云端

防住谁：逆向工程；二次分发（盗版本地 binary 失去 server 接入即废）
防不住谁：server 被攻击（保 server 是另一问题）
成本：算力费；用户需联网；延迟 + 流量；实施复杂度高
效果：★★★★★  Tier S 推荐，仅适合"渲染 / 重建 / 推理"类不要求实时的算法

不适用：实时滤镜 / 60fps 调色（云端往返不现实）
```

### 8.7 T7 Anti-tampering 自检

```
做什么：
  · binary 启动时自校验 SHA256
  · 多个分散校验点（不只是入口）
  · 校验失败 → 拒绝运行 / 上报 server

防住谁：简单 hex 修改；部分自动化破解工具
防不住谁：同时改自检逻辑的 cracker
成本：开发复杂度；与 obfuscation 协作时调试痛苦
效果：★★★☆☆  Tier S 才有意义，Tier A 不必
```

### 8.8 T8 法律 + 平台合作

```
做什么：
  · ToS 明确禁止反编译 / 二次分发
  · 监控 GitHub / torrent / 论坛上的盗版关键词
  · DMCA takedown 通知
  · 重大泄露走民事 / 刑事

防住谁：公开渠道的大规模盗版；以盗版为业的卖家
防不住谁：私下小圈子分享；跨境主体（执法困难）
成本：法律团队；监控工具
效果：★★★☆☆  威慑 + 兜底，不能单独用
```

### 8.9 不要做的（重要）

```
✗ AES 加密 binary，运行时解密
   解密引擎在 client，密钥可提取，破解一次永久
   90 年代游戏行业已证明无效

✗ 硬件 dongle (HASP / SafeNet)
   用户体验灾难，dongle 丢即停用
   创作者工具市场已淘汰

✗ 永久在线
   创作者经常离线（飞机 / 户外 / 网络限制地区）
   流失合法用户

✗ 激进 Anti-Cheat（内核驱动级）
   创作工具不是网游，不需要内核监控
   误伤合法用户 / 引发隐私争议

✗ 让正版比盗版难用
   DRM 灾难定律：每加 10s license 校验 = 流失 1% 用户
   长期推动用户找盗版

✗ 把 license check 放在 TS 侧
   TS 代码 patch 一次即破
   必须在 engine（Rust 编译产物）内部
```

---

## 九、按价值的三档保护策略

按 **plugin** 这一类自身分三档（不是"同一插件不同处理"，是"不同插件不同档"）：

| 档位 | 价格区间 | 必做战术 | 不做战术 |
|---|---|---|---|
| **B 开源 / 免费** | 0 | T8 法律 ToS + T5 签名（防恶意冒充） | T1 / T2 / T3 / T4 / T6 / T7 全免 |
| **A 标准商业** | ¥30 - ¥300 | T1 + T2 + T3 + T5 | T4（可选） / T6 / T7 |
| **S Premium / IP** | ≥ ¥300 / IP-licensed | T1 + T2 + T3 + T4 + T5 + T6 + T7 + T8 全套 | — |

### 9.1 重点说明

```
Tier B 不做保护
  · 开源 plugin (T1 Core / T2 Verified 免费发布)
  · 接受被复制
  · 节省 server 编译成本
  · 主要靠开源社区认可获取信誉
  · ToS + 签名 防恶意冒充足够

Tier A 标准商业
  · 编译 + obfuscation + per-user watermark + heartbeat + 签名
  · 不做 hardware binding（UX 太差）
  · 不做 server-side IP（基础 plugin 不值得云端化）

Tier S 才上 server-side IP + hardware binding + anti-tamper
  · 价格 / IP 价值高，能 cover 这些复杂度
  · 用户接受 UX 妥协（联网 / 解绑）
```

### 9.2 Publisher 自主选择

```
Server 默认按 publisher tier + price 自动判定档位
Publisher 可申请提升档位（接受额外的 5% Tier S 服务费 + UX 摩擦义务）
不能随意降档（防绕过保护流水）

升档审核：
  · auto: price >= 300 OR ipProtected → 自动 Tier S
  · publisher 申请 Tier A/S → server review（Tier S 需 KYC + 协议签署）
  · admin override → 应急情况调整
```

---

## 十、Server-side compilation pipeline

T2（per-user watermark）依赖 server 端编译流水。这是 Tier A/S 商业 plugin 的基础设施。

### 10.1 流水设计

```
Publisher 上传：
  · Rust workspace（含源码 + Cargo.toml + 引擎 API 版本）
  · 编译指令（targetTriple + features）
  · License 模板（哪里 inject watermark const）

Server 流水：
  1. 沙箱化构建环境（Docker / Firecracker）
  2. 拉源码 + 校验
  3. 注入 watermark const：
     const PURCHASER_ID: &str = "{user-uuid}";
     const SESSION_ID: &str = "{session-ulid}";
  4. cargo build --release --target {triple}
  5. strip + obfuscation
  6. 签名（publisher 私钥）
  7. 上传到对象存储 + 生成预签名 URL
```

### 10.2 缓存策略

```
缓存 key 维度：
  (user, plugin, version, triple)

逻辑：
  · 同 user × 同 plugin × 同 version × 同 triple → 缓存（用户重装免重编译）
  · 不同 user → 必重新编译（必须 unique）
  · 不同 platform → 多 triple 矩阵

预算：
  · 即时编译队列（首次购买等 5-10 分钟）
  · 高峰期排队
  · publisher 担 5% Tier S 服务费 cover 编译资源
  · 大 plugin (> 500MB 源码) 设上传时同步预编译，免用户首次等待
```

### 10.3 Server 端 Cargo workspace 模板

```toml
# 编译模板 - 注入 watermark
[package]
name = "{{plugin-name}}"
version = "{{version}}"

[lib]
crate-type = ["cdylib"]

[features]
default = ["watermark"]
watermark = []

[dependencies]
neko-engine-api = "{{api-version}}"
```

```rust
// src/watermark.rs - server 注入
#[cfg(feature = "watermark")]
pub const PURCHASER_ID: &str = "{{user_uuid}}";

#[cfg(feature = "watermark")]
pub const SESSION_ID: &str = "{{session_ulid}}";

#[cfg(feature = "watermark")]
pub const BUILD_TIMESTAMP: u64 = {{build_ts}};

// plugin 入口处嵌入：
#[no_mangle]
pub extern "C" fn plugin_init(ctx: *mut Context) {
  // watermark 上报到 engine
  unsafe {
    register_watermark(PURCHASER_ID, SESSION_ID, BUILD_TIMESTAMP);
  }
  // ... actual plugin logic
}
```

### 10.4 反 watermark 替换的策略

```
威胁：cracker 反编译后批量替换 PURCHASER_ID 字符串

防御：
  · 多处分散嵌入（不只是 PURCHASER_ID 一个 const）
  · 字符串拆分 + 运行时拼接（obfuscation）
  · 与 license check 逻辑交织（修改 watermark 同时破坏 license）
  · 在执行路径关键点反复读取 watermark（删一个就报错）
  · CRC 自校验（修改任一处都破坏 binary）
```

### 10.5 Server API

详见 [registry-server-contract.md](./registry-server-contract.md) §3.4a：

```
POST /api/v1/plugins/:id/build
  body: { userId, version, targetTriple, sessionId }
  flow: 触发 per-user build；同步 wait 或异步 polling
  return: { url, expiresAt, integrity, watermarkInfo }

GET /api/v1/plugins/:id/build-status
  query: ?buildId
  return: { status: 'queued' | 'building' | 'done' | 'failed', progress, eta }
```

---

## 十一、Engine 内 license 闸门

License check **必须在 engine 加载 plugin 的 Rust 代码里**，不能放 TS 侧。

### 11.1 加载流程（7 步）

```rust
// neko-engine/host-api/src/plugin_manager.rs

impl PluginManager {
  pub fn load(&mut self, manifest: &PluginManifest, install_path: &Path) -> Result<Plugin> {
    // 1. SHA256 完整性
    self.verify_integrity(manifest, install_path)?;

    // 2. 签名校验（publisher 信任链）
    self.verify_signature(manifest, install_path)?;

    // 3. License 校验（关键！本地 entitlement cache + 必要时调 server）
    let entitlement = self.license_manager.check_local_or_remote(manifest.id)?;
    if !entitlement.allowed {
      return Err(PluginError::LicenseExpired);
    }

    // 4. Trust 闸门：untrusted 一律拒载（除非 dev-mode）
    if entitlement.trust_level == TrustLevel::Untrusted {
      if !self.developer_mode_active() {
        return Err(PluginError::UntrustedPlugin);
      }
    }

    // 5. Workspace Trust 闸门
    if !self.workspace_trust.allows(manifest)? {
      return Err(PluginError::WorkspaceRestricted);
    }

    // 6. Hardware binding（如启用）
    if entitlement.machine_binding_required {
      let current = self.hardware_id();
      if current != entitlement.bound_machine {
        return Err(PluginError::WrongMachine);
      }
    }

    // 7. 加载（dlopen via libloading）
    let artifact = self.load_artifact(manifest, install_path)?;

    // 8. Watermark 提取 + 上报（追溯用）
    self.record_load(manifest, &artifact)?;

    Ok(Plugin { artifact, entitlement })
  }
}
```

### 11.2 为什么必须在 Rust 内部

```
✗ 错误：TS 在加载前调用 server 验证，验证通过后下令 engine 加载
   → TS 被 patch 直接发"通过"指令 → engine 不验证 → 装哪个都能跑

✓ 正确：engine 自己 dlopen 之前直接调 server / 读 entitlement 缓存
   → TS 改不到 engine 内部
   → engine 是 Rust 编译产物，反编译门槛高
   → patch engine 二进制后签名校验失败（OS 拒载）
```

### 11.3 Entitlement 本地缓存

```rust
// 5 min TTL，与 [§九.6](./marketplace.md) ExpiryEvaluator 一致

struct LicenseManager {
  cache: HashMap<PackageId, CachedEntitlement>,
}

struct CachedEntitlement {
  allowed: bool,
  expiresAt: Timestamp,
  machineBindingRequired: bool,
  boundMachine: Option<MachineId>,
  fetchedAt: Timestamp,
}

impl LicenseManager {
  fn check_local_or_remote(&mut self, pkg_id: &PackageId) -> Result<Entitlement> {
    if let Some(cached) = self.cache.get(pkg_id) {
      if cached.fetchedAt.elapsed() < Duration::from_secs(300) {
        return Ok(cached.into());
      }
    }

    // Cache miss / expired → fetch from server
    let entitlement = self.fetch_remote(pkg_id)?;
    self.cache.insert(pkg_id.clone(), entitlement.into());
    Ok(entitlement)
  }
}
```

### 11.4 Watermark 上报

```rust
// engine 加载 plugin 后，从 binary 中提取 watermark 上报 server

fn record_load(&self, manifest: &PluginManifest, artifact: &PluginArtifact) -> Result<()> {
  let watermark = artifact.extract_watermark()?;  // 调 plugin 自己暴露的 fn

  // 异步上报（不阻塞加载）
  self.telemetry.send(WatermarkLoadEvent {
    pkg_id: manifest.id.clone(),
    purchaser_id: watermark.purchaser_id,
    session_id: watermark.session_id,
    machine_id: self.hardware_id(),
    timestamp: now(),
  });

  Ok(())
}
```

server 端记录"哪个用户的 watermark 在哪台机器加载过"，泄露追溯靠这个。

---

## 十二、威胁 × 防御矩阵

```
威胁                     T1  T2  T3  T4  T5  T6  T7  T8
─────────────────────────────────────────────────────────
T1 朋友复制 .so          —   ✓   ✓   ★   —   —   —   —
T2 撤销后保留使用         —   —   ★   —   —   —   —   —
T3 上传 torrent / 论坛    ✓   ★   —   —   —   ✓   —   ★
T4 反编译 + patch         ★   —   —   —   ✓   ★   ★   —
T5 重新签名再发布         —   —   —   —   ★   —   —   ★
T6 大规模商业盗版         —   ✓   —   —   —   ✓   —   ★
T7 修改 license 检查      ★   —   ✓   —   ✓   —   ★   —

★ = 主要防御  ✓ = 辅助防御  — = 不相关
```

读法：

```
朋友复制（T1）：靠 hardware binding 就够（T4★）
撤销保留（T2）：仅靠 heartbeat（T3★）
公开盗版（T3-T6）：需要 watermark 追溯（T2★）+ 法律（T8★）
专业 reverse（T4-T7）：obfuscation（T1★）+ anti-tamper（T7★）+ 签名（T5✓）
                       但任意单一防线都被破，必须组合
```

---

## 十三、商业化路径

由于 plugin = native + 必须 KYC，商业化只有两条路（KYC 是硬门槛）。社区贡献走其它 type。

### 13.1 方案 X: 核心团队代理发布（T1）

```
第三方开发者 → 提交给 neko-suite 团队 → 团队 review + 签 → 上 T1
类似 Apple App Store 的"自家发布"

优点：
  · 最高信任 / 用户认可度高
  · neko team 担质量背书

缺点：
  · 高门槛，仅大厂 / 战略合作伙伴
  · 审核周期长

成本：
  · 不收 publisher 收益分成（neko team 不抽成）
  · 适合战略级合作
```

### 13.2 方案 Y: Verified Publisher 自营（T2，主流路径）

```
第三方 KYC 实名 → server 颁发 publisher cert
自己上传 + server 编译流水（per-user watermark）
用户安装看到 ✓ Verified badge

优点：
  · 自主发布，速度快
  · 完整 8 战术防盗版

缺点：
  · KYC 门槛
  · 5-15% Tier S 服务费

适合：
  · 中小团队商业化
  · 个人专业开发者
  · 主流路径
```

### 13.3 方案 Z: 社区走其它 AssetType

不写 plugin，把核心想法落到其它开放 type：

```
原本 plugin 设想：       改用其它 type：
─────────────────────    ──────────────────────────────
"调色 plugin"            preset(lut) + shader(WGSL filter)
"工作流 plugin"          skill(prompt-chain markdown)
"生成器 plugin"          starter + skill 组合
"角色资产 plugin"        identity pack
"模型 plugin"            model (LoRA / embedding)
"风格 plugin"            preset(memory) + shader

优点：
  · 无 KYC 门槛
  · 所有 type 都接受社区 publisher
  · WGSL shader 已有 GPU 沙箱（安全）
  · 用户安装无 native 风险

缺点：
  · 无法做需要 native 性能的扩展（编解码 / ML 推理）
  · 这些场景必须升 KYC 走方案 Y
```

### 13.4 决策树（开发者选哪条）

```
我想给 neko-suite 加新功能：

  必须写 native 代码？（性能敏感 / 调用 native lib / 复杂算法）
    │
    ├── YES → 走方案 X 或 Y
    │   │
    │   ├── 是 neko 战略伙伴？ → 方案 X
    │   └── 否 → 方案 Y（KYC + 商业化）
    │
    └── NO → 走方案 Z（其它 type）
        │
        ├── 调色 / 滤镜 → preset(lut) / shader
        ├── 工作流 / 自动化 → skill
        ├── 资产打包 → identity / starter / bundle
        ├── 模型 → model / endpoint
        └── 配置 / 模板 → preset / starter
```

---

## 十四、Shader 的额外考虑

### 14.1 Shader 不是 plugin 但治理类似

```
shader artifact      WGSL / GLSL 源码 / SPIR-V binary / MSL / DXIL
plugin artifact      Rust cdylib

共同点：
  · 都是 engine 加载执行
  · 都有 IP 价值（算法 / 视觉效果）
  · 都需要 license 闸门
  · 都受 trust tier 影响

差异：
  · Shader 跑在 GPU（不是 CPU），权限模型不同
  · Shader 不需要 host 沙箱（GPU driver 自己做隔离）
  · Shader 编译步骤更轻量（无需复杂 build 流水）
  · Shader 可以接受社区 publisher（GPU 隔离 = 风险有限）
```

### 14.2 Shader 分发形态

```typescript
// manifest-schema-spec.md §五.9 ShaderMetadata 字段

distributionForm:
  | 'wgsl-source'      // WGSL 源代码（开源 / 学习 / 简单效果）
  | 'glsl-source'      // GLSL 源代码（同上）
  | 'spirv-binary'     // 编译为 SPIR-V（商业 shader 推荐）
  | 'msl-binary'       // Metal Shading Language binary（macOS / iOS）
  | 'cloud-only'       // 不下放，云端渲染
```

### 14.3 编译 ≠ 加密

```
WGSL → SPIR-V 编译过程：
  · 词法 / 语法分析 → AST
  · 优化 + 中间码生成
  · 输出 SPIR-V 二进制

特点：
  · 无密钥（任何人有 wgpu compiler 都能逆向编译回 SPIR-V）
  · 但变量名 / 注释 / 高层结构丢失
  · 反编译可能但需要重写理解
  · 这是"编译"，不是"加密"

→ 商业 shader 默认走 'spirv-binary' 分发
→ 不需要密钥管理
→ 不存在"破解一次永久免费"问题
→ + watermark 嵌入 → 完整保护
```

### 14.4 实时编辑场景的 P2 限制

```
实时编辑场景（neko-cut 调色 / 滤镜）：
  · timeline preview 60fps 渲染 shader
  · 编辑时拖动参数 → shader 立即应用
  · 这要求 shader 在本地 GPU 编译并执行

P2 cloud render 在此场景不适用：
  ✗ 60fps 往返云端不现实
  ✗ 离线工作流被破坏
  ✗ 调色师不接受延迟

→ 实时 shader 必须 P1
→ 仅"最终导出渲染"那种一次性使用的可以走 P2
→ Publisher 选择 P2 等于排除"实时调色"用户
```

### 14.5 Shader 三档保护

```
Tier B: 开源 WGSL source
  · 仅签名 + 元数据指纹
  · 接受公开

Tier A: 商业 SPIR-V binary
  · SPIR-V 编译 + 元数据 watermark + license check
  · 不需要 server-side per-user build（编译产物相对小）
  · 仍可 server 端 attach watermark 段

Tier S: 极高 IP shader
  · cloud-only 分发（永不下放）
  · 适合 Photogrammetry / 神经网络滤镜等
  · 要求用户联网 + 接受延迟
```

### 14.6 Shader 与 plugin 的 Trust 差别

```
                Plugin (native)    Shader
─────────────────────────────────────────────
T1 Core         ✓                  ✓
T2 Verified     ✓                  ✓
T3 Community    ✗ 拒收             ✓ 允许（GPU 沙箱兜底）
T4 Sideload     仅 dev-mode         ✓ 直接接受
```

**shader 是社区可发布的 engine artifact**，因为 GPU driver 已经做沙箱。这与 plugin 的 KYC-only 相对。

---

## 十五、Server 契约扩展

以下契约应同步引入 [registry-server-contract.md](./registry-server-contract.md) 的 Plugin Governance 小节。本文保留摘要，server contract 为 HTTP 字段与不变量的权威位置。

### 15.0 Verified Publisher 投影

T2 Verified 不新增第四个 `trustLevel`。Server 仍使用 Capability Protocol 的三级 trust：

```typescript
type TrustLevel = 'core' | 'community' | 'untrusted';

interface AssetDistribution {
  trustLevel: TrustLevel;
  publisher: {
    id: string;
    displayName: string;
    verified: boolean;
    verificationTier?: 'core' | 'verified';
    verifiedAt?: number;
  };
}
```

Plugin 发布规则：

```
trustLevel === 'core'                         → T1 Core plugin 可发布
trustLevel === 'community' && publisher.verified === true
                                                → T2 Verified plugin 可发布
trustLevel === 'community' && publisher.verified !== true
                                                → plugin 拒收；其它开放 type 可继续发布
trustLevel === 'untrusted'                    → 仅 sideload / dev-mode 本地状态，不进入 market
```

### 15.1 Plugin Build API

```
POST /api/v1/plugins/:id/build
  Headers: Authorization: Bearer <token>
  Body: {
    version: string,
    targetTriple: string,    // 'x86_64-apple-darwin' / 'aarch64-apple-darwin' / ...
    sessionId: string,
  }
  Response (sync, < 5s for cached):
    { url, expiresAt, integrity, watermarkInfo: { purchaserId, sessionId } }
  Response (async, > 5s):
    { buildId, status: 'queued', estimatedDuration }

GET /api/v1/plugins/:id/build-status
  Query: ?buildId
  Response: { status: 'queued' | 'building' | 'done' | 'failed', progress, eta }

GET /api/v1/plugins/:id/build-result
  Query: ?buildId
  Response: { url, expiresAt, integrity }   # 仅 status=done 时
```

### 15.2 Publisher KYC API

```
POST /api/v1/publishers/verify
  Headers: Authorization: Bearer <token>
  Body: {
    legalName: string,
    country: string,
    documentType: 'passport' | 'business-license' | 'tax-id',
    documentRef: string,    # 上传到 secure storage 后的 ref
    contactEmail: string,
    publicKeyPem: string,    # publisher 签名公钥
  }
  Response: { applicationId, status: 'submitted', expectedReviewDays: 3 }

GET /api/v1/publishers/:id/verification-status
  Response: { status: 'pending' | 'approved' | 'rejected', reason?, badgeIssuedAt? }
```

### 15.3 Permission Audit Webhook

```
POST /api/v1/audit/permission-violation     # engine → server 上报
  Body: {
    pluginId: string,
    purchaserId: string,
    sessionId: string,
    permission: PluginPermission,
    declared: false,
    timestamp: number,
  }

  Server 累积：
    · 同一 plugin / publisher 多次违反声明 → 自动降级 publisher 信誉
    · 撤销 entitlement
    · 通知所有受影响用户
```

### 15.4 不变量（Server 必保证）

```
㉒ engine plugin 必由 verified 或 core publisher 发布
   community publisher 上传 → 422 拒收

㉓ engine plugin 必带 targetTriple，client 校验后才下载对应平台
   不匹配 → 404

㉔ Tier A/S plugin 的下载 URL 必为 per-user build 产物，不许共用
   server 端缓存 key 含 userId

㉕ Native cdylib 上传必经 verified-publisher 接口（KYC 已通过）
   未 KYC 上传 → 422 拒收

㉖ Workspace trust 状态由 client 持有，server 不知情（隐私）

㉗ Permission violation 上报必触发 server 端记录，连续 3 次以上违反触发 publisher 信誉处分
```

---

## 十六、反模式清单

```
MK-P1  把 plugin 描述为 VSCode 扩展
       现象：文档语义错位
       代价：发布者混乱 / 错配 InstallTarget / 跨域规划
       修法：plugin = neko-engine 原生扩展（cdylib）；VSCode 扩展走官方 marketplace

MK-P2  加密 plugin binary 期望保护 IP
       现象：AES 加密 .so / .dylib，client 解密
       代价：解密引擎成单点 / 密钥可提取 / 破解一次全失效
       修法：编译 + obfuscation + per-user watermark + license check

MK-P3  License check 放在 TS 侧
       现象：TS 调 server 验证，传"通过"信号给 engine
       代价：TS 一改即破，engine 不知情
       修法：engine 内部 Rust 代码做 license check

MK-P4  Untrusted plugin 默认允许
       现象：community publisher 的 cdylib 默认装 + 加载
       代价：原生代码可任意 fs.write / 网络请求 / 窃取秘钥
       修法：trustLevel < verified 拒载，无沙箱可兜底

MK-P5  全资产同等保护投入
       现象：免费 plugin 也走 server-side 编译 + watermark
       代价：成本浪费 / 编译队列阻塞 / 流失 publisher
       修法：Tier B 不保护；Tier A/S 才进 server build 流水

MK-P6  Sideload native 在非 dev-mode 允许
       现象：用户手动放 .so 到目录就能加载
       代价：钓鱼攻击得手即拥有机器级权限
       修法：sideload 一律拒，仅 dev-mode 例外（且 14 天自动过期）

MK-P7  T3 community 允许发 native plugin
       现象：匿名 publisher 上传 cdylib 通过审核
       代价：身份不可知 = 责任不可追溯，恶意 publisher 跑路
       修法：plugin native 必经 KYC 升 T2，server 上传期硬拒

MK-P8  Permission 对话框默认折叠
       现象：警告字小或藏在"高级选项"
       代价：用户盲签同意 = 信任失效
       修法：申请 network:any / process-spawn 必显著标记

MK-P9  Workspace trust 默认 trusted
       现象：陌生 .nkcut 打开就 full trust
       代价：恶意工程引用 malware plugin 自动加载
       修法：首次打开 restricted，用户手动 promote

MK-P10 把 permission 当沙箱
       现象：宣传"WASM 沙箱保护"或"permission 限制 plugin 行为"
       代价：用户误以为 native plugin 受沙箱保护，实际 KYC 是唯一保护
       修法：明确 native plugin 无运行时沙箱，permission 是声明性 + 审核性
              超出声明范围靠 audit + publisher 信誉处分追溯

MK-P11 Watermark 单点嵌入
       现象：仅在一个 const 嵌入 PURCHASER_ID
       代价：cracker 一次 sed 替换即可
       修法：多处分散 + 字符串拆分 + 与 license check 交织 + CRC 自校验

MK-P12 编译 ≠ 加密 概念混淆
       现象：把 SPIR-V binary 称为"加密 shader"
       代价：误导决策 / 误以为有密钥安全
       修法：明确"编译"是结构丢失而非加密；不需要密钥管理

MK-P13 实时 shader 强推 P2 cloud render
       现象：调色 LUT shader 也走云端渲染
       代价：60fps 编辑预览延迟爆炸 / 离线即废
       修法：实时使用类 shader 必 P1，仅离线 / 一次性渲染才 P2

MK-P14 Sideload 资产能上 market
       现象：用户能直接把 sideload 推到 server
       代价：绕过 KYC / 无审核
       修法：sideload 仅本地，发布走 publisher KYC 流水

MK-P15 强行让 plugin 承载社区贡献
       现象：因为想要"社区开放"，给 plugin 开匿名通道
       代价：恶意 native 代码进入用户机器
       修法：plugin 永远 KYC-only；社区贡献走其它 10 种 AssetType
```

---

## 十七、与既有架构 / 文档的关系

### 17.1 文档分工

```
marketplace.md                架构决策 + UI 流程 + 实施 Phase
                              §四 / §九 cross-reference 到这里

manifest-schema-spec.md       PluginMetadata / PluginPermission 字段定义
                              本文是 governance 决策依据

registry-server-contract.md   Plugin Build / Publisher KYC HTTP 端点
                              本文 §十五 给端点契约

adr-capability-protocol.md    三级 trustLevel 基础协议
                              本文 §三 把 trustLevel 展开为三档（plugin 这一类无 T3 通道）

adr-asset-federation.md       AssetHandler 模式
                              plugin 的 IInstallTarget 与 AssetHandler 同形

CLAUDE.md                     plugin 应迁移到 neko-tools 或独立 PluginHost
                              详见 [marketplace.md §九.4 X/Y 类归属]
```

### 17.2 实施 Phase 映射

```
Phase 6.5.6   AssetType v4 重整（plugin 语义改正在此 Phase 完成）
Phase 6.5.6c  InstallTargetRegistry 协议升级（PluginInstallTarget 贡献机制）
Phase 6.5.6d  过期管理 A/B/C（与 license heartbeat 协作）
Phase 6.5.6f  大素材策略（plugin 不在此 Phase）
Phase 6.5.9   Y 类 InstallTarget 迁移到子包（PluginInstallTarget → neko-tools）

新增建议 Phase 6.5.6i  Plugin governance 落地
   · 三档 trust tier 实现
   · permission 声明模型 + audit log
   · workspace trust 持久化
   · server-side compilation pipeline
   · publisher KYC 接口
```

---

## 十八、实施路径

### 18.1 Phase 6.5.6i — Plugin Governance（建议优先级 P1）

```
P1.a  三档 trust tier 实现
      ├── server 端 publisher KYC 流水
      ├── manifest.distribution.trustLevel + distribution.publisher.verified
      ├── client 安装对话框（按 tier 不同）
      └── PluginManager 加载时 trust 闸门

P1.b  Permission 声明模型 + audit
      ├── PluginPermission 12 种枚举落到 schema
      ├── manifest.permissions 必填校验
      ├── KYC review 时 publisher 解释每项权限
      ├── Engine 端 host-api audit log
      ├── 明确 native direct syscall 不可由 in-process PluginManager 可靠拦截
      └── host-api 违反声明 → server 上报 + publisher 信誉降级

P1.c  Workspace trust 持久化
      ├── .neko/workspace-trust.json
      ├── 各子包 WorkspaceTrustProvider 实现
      ├── promote / demote UI（顶部条 + settings）
      └── 与 plugin 加载流程协作

P1.d  Plugin language 同步纠错
      ├── manifest-schema-spec.md §三 plugin 描述
      ├── manifest-schema-spec.md §五.8 PluginMetadata 重写
      ├── marketplace.md §四 描述同步
      └── 反模式 MK-P1 落地

P1.e  Developer Mode 实现
      ├── settings 配置 neko.market.developerMode
      ├── 启用对话框 + 14 天自动过期
      ├── Top banner "Developer Mode active"
      ├── 阻止商业 Tier S plugin 加载
      └── Hot reload 文件监视
```

### 18.2 Phase 6.5.6j — Server-side Compilation（P2）

```
P2.a  Cargo workspace 模板
      ├── 标准化 publisher 上传格式
      ├── 注入 watermark const 模板
      └── 编译指令 schema

P2.b  沙箱构建环境
      ├── Docker / Firecracker 隔离
      ├── 依赖白名单（防恶意 build script）
      └── 资源限制（CPU / 内存 / 时间）

P2.c  缓存与队列
      ├── 4 维 cache key (user, plugin, version, triple)
      ├── 编译队列 + 进度查询
      └── 即时 vs 异步编译切换

P2.d  Per-user binary 防替换
      ├── 多处 watermark 嵌入
      ├── 字符串拆分混淆
      ├── 与 license check 交织
      └── CRC 自校验

P2.e  Server API 实现
      ├── POST /plugins/:id/build
      ├── GET /plugins/:id/build-status
      ├── GET /plugins/:id/build-result
      └── 与 [registry-server-contract.md](./registry-server-contract.md) §3.4a 对齐
```

### 18.3 Phase 6.5.6k — Engine Plugin Loading（P1，与 §九.7 协作）

```
P1.a  PluginManager 7 步加载流程
      ├── 完整性校验
      ├── 签名校验
      ├── License 校验（本地 cache + remote）
      ├── Trust 闸门
      ├── Workspace Trust 闸门
      ├── Hardware binding（如启用）
      └── 加载 + watermark 上报

P1.b  License Manager Rust 实现
      ├── 5 min TTL local cache
      ├── 调 server entitlement
      ├── 与 ExpiryEvaluator 整合（[§九.6]）
      └── Heartbeat 触发

P1.c  Watermark 提取与上报
      ├── plugin 自暴露 fn extract_watermark
      ├── engine 调用并提取
      └── 异步 telemetry 上报
```

### 18.4 Phase 6.5.6l — 商业化通道（P2）

```
P2.a  方案 Y Verified Publisher 自营
      ├── KYC 接口 (POST /publishers/verify)
      ├── Publisher Portal 子项目（不在本仓）
      ├── 服务费结算（5-15%）
      └── 质量监控

P2.b  方案 Z 引导社区走其它 type
      ├── 文档教程：从 plugin 想法转成其它 type 实现
      ├── 示例：调色 plugin → preset(lut) + shader
      ├── Cookbook：常见需求的 type 选择
      └── Forum 引导
```

---

## 十九、Sideload Across AssetTypes（跨类型本地安装）

§六 仅讨论了 plugin 的 T4 sideload（dev-mode 唯一通道）。但 sideload 是系统级概念，**所有 AssetType 都有本地安装场景**：自创资产、私有/企业内部工具、github 下载、未发布的 dev 版本、朋友分享等。

本节描述 sideload 在 11 种 AssetType 上的统一治理。

### 19.1 两种本地化方式不要混

```
模式 1  导入素材 (Import)
        用户拖入自己拍的视频 / 自己画的图
        进入 neko-assets AssetLibrary 流程
        这是创作工作流，不是"安装"
        已有现成机制（neko-cut import / neko-canvas import...）

模式 2  Sideload 资产 (Local Install)
        用户从非 market 渠道获取 "可重用资产"：
          · 自己制作的 LUT 包
          · github 下载的 skill 集合
          · 朋友分享的 shader 文件
          · 私有 / 企业内部工具
          · 自己开发期的 plugin（dev test）
        模仿"安装"语义但不经 market
        必须让 market 知道，否则 Market.Installed 看不到、卸载流程混乱
```

本节专注 **模式 2 sideload**。模式 1 与本治理无关。

### 19.2 Per-Type Sideload 行为表

11 种 AssetType 都有 sideload 场景，但风险与默认行为不同：

| Type | 典型 sideload 场景 | 风险 | 默认行为 |
|---|---|---|---|
| `preset` (lut/transition/...) | 自制 LUT / 朋友分享调色 | 极低 | **直接接受** |
| `skill` | 写自己的 prompt-chain | 低 | **直接接受** |
| `shader` (源码) | 写自己的 WGSL 滤镜 | 低（GPU 沙箱） | **直接接受** |
| `shader` (binary) | github 下载 SPIR-V | 低 | **接受 + warning** |
| `media` | （走 import 通道，非 sideload） | — | — |
| `starter` | 自己的工程模板 | 低 | **直接接受**（受 workspace trust 制约） |
| `identity` | 自创角色身份包 | 低 | **接受 + ULID 唯一性校验** |
| `model` (LoRA / embedding) | 自训 / 下载社区 LoRA | 中 | **接受 + 来源 warning** |
| `model` (base) | 自部署 GGUF / safetensors | 中 | **接受 + 来源 warning** |
| `endpoint` | 私有 / 自建 API | 低 | **接受 + 用户填凭证** |
| `provider` | 自定义 ProviderCard | 低 | **接受** |
| `plugin` | dev 测试 cdylib | **高** | **一律拒，仅 dev-mode 例外**（详见 §六.3） |
| `bundle` | 自定义聚合 | — | **不可 sideload**（结构假定 publisherId） |

**纪律**：

```
✓ 大部分 type 直接接受（preset / skill / shader / starter / identity / model / endpoint / provider）
✗ Native plugin 一律拒（仅 dev-mode 14 天）
✗ Bundle 不可 sideload（其结构假定所有 contents 都有 publisherId）
```

### 19.3 目录结构

```
~/.neko/                                Neko home
├── (market-installed)
│   ├── skills/{publisher}/{name}/
│   ├── shaders/{kind}/{publisher}/{name}/
│   ├── models/{framework}/{name}/
│   ├── ...
│   └── market-installed.json           Market 持久化
│
└── local/                              Sideload 根（与 market 隔离）
    ├── plugins/                        仅 dev-mode（native）
    ├── shaders/
    ├── presets/{kind}/                 lut / transition / effect / ...
    ├── skills/
    ├── starters/{editor}/              cut / canvas / model / sketch / puppet / story
    ├── identities/                     用户自创角色
    ├── models/{framework}/             用户自部署模型
    ├── endpoints/                      私有 endpoint 配置
    ├── providers/                      自定义 provider card
    └── local-installed.json            Sideload 注册表（独立于 market-installed.json）
```

**为什么物理隔离**：

```
✓ 卸载 market 包不会误删用户自己的东西
✓ Market 升级 / 迁移脚本不影响 sideload
✓ 备份策略可以分开（local 独立保护，market 重新装即可）
✓ trustLevel='untrusted' 默认仅作用于 ~/.neko/local/
```

### 19.4 自动推断 Type

Sideloaded 资产没有 server 颁发的 manifest，按文件路径 / 扩展名自动推断 type：

```typescript
function inferAssetType(filepath: string): { type: AssetType; kind?: string } | null {
  const ext = path.extname(filepath).toLowerCase();
  const name = path.basename(filepath).toLowerCase();

  // Preset
  if (ext === '.cube' || ext === '.3dl') return { type: 'preset', kind: 'lut' };
  if (name.endsWith('.transition.json')) return { type: 'preset', kind: 'transition' };
  if (name.endsWith('.effect.json')) return { type: 'preset', kind: 'effect' };
  if (name === 'memory.md' || name.endsWith('.memory.md')) return { type: 'preset', kind: 'memory' };

  // Shader
  if (ext === '.wgsl') return { type: 'shader', kind: 'wgsl-source' };
  if (ext === '.glsl' || ext === '.frag' || ext === '.vert') return { type: 'shader', kind: 'glsl-source' };
  if (ext === '.spv') return { type: 'shader', kind: 'spirv-binary' };

  // Skill
  if (name === 'skill.md' || name.endsWith('.skill.md')) return { type: 'skill' };

  // Plugin (仅 dev-mode 才允许加载)
  if (ext === '.so' || ext === '.dylib' || ext === '.dll') return { type: 'plugin' };

  // Model
  if (ext === '.gguf') return { type: 'model', kind: 'gguf' };
  if (ext === '.onnx') return { type: 'model', kind: 'onnx' };
  if (ext === '.safetensors') return { type: 'model', kind: 'safetensors' };

  // Identity / Starter (folders)
  if (fs.statSync(filepath).isDirectory()) {
    if (fs.existsSync(path.join(filepath, 'identity.json'))) return { type: 'identity' };
    if (fs.existsSync(path.join(filepath, 'project.nkcut'))) return { type: 'starter', kind: 'cut' };
    if (fs.existsSync(path.join(filepath, 'project.nkc'))) return { type: 'starter', kind: 'canvas' };
    // ... etc
  }

  return null;
}
```

### 19.5 Manifest 生成（最小化用户填写）

Sideloaded 资产需要本地生成 manifest。两步流程：

```
1. 自动推断 + 草稿生成
   path → inferAssetType → 最小 manifest 草稿

2. 用户编辑（可选）
   弹窗 review，编辑 name / version / description
   落到 ~/.neko/local/local-installed.json
```

最小 manifest 示例：

```json
{
  "id": "@local/my-warm-lut",
  "name": "My Warm LUT",
  "version": "1.0.0",
  "type": "preset",
  "source": { "kind": "local", "path": "/Users/me/luts/warm.cube" },
  "distributionKind": "archive",
  "typeMetadata": {
    "type": "preset",
    "data": { "presetKind": "lut", "targetApp": "cut" }
  },
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

注意：sideload manifest 无 `distribution` 字段（无 license / signature / publisher / trustLevel）。这是与 market 安装包的关键区别。

### 19.6 Market.Installed UI 统一展示

Sideload 项与 market 安装项在 Market.Installed Tab 一起显示，用 badge 区分：

```
Market.Installed Tab
  · 显示所有已安装资产，含 sideload
  · sideload 项加 [Local] 徽章
  · 按 type / category 分组同样适用

每条目 metadata：
  · source: 'market' | 'local' | 'ai-generated'
  · 卸载行为：
      market source → 走 §九 8 阶段反演（需 entitlement）
      local source → 删 ~/.neko/local/<type>/<file>（无 license 概念）
  · 启停 / 信息查看 等操作一致
```

UI 入口：

```
Market.Installed Tab 顶部按钮：[+ Install Local...]
        ↓
文件选择器（支持文件 / 目录）
        ↓
自动推断 type → 弹窗预览 + 用户确认
        ↓
落 ~/.neko/local/<type>/ + local-installed.json + 触发 onDidInstall
```

或命令面板：`neko: Install Local Asset...`

### 19.7 Trust 闸门（与 §三 三档对齐）

Sideloaded 资产的 trustLevel 默认 `'untrusted'`，加载时按 type 不同：

```
preset / skill / shader-source / starter / identity / provider / endpoint
  → 接受加载（这些 type 本就低风险）

shader-binary (SPIR-V)
  → 接受加载 + UI warning（来自非市场源）

model (LoRA / embedding / GGUF / safetensors)
  → 接受加载 + UI warning（自训模型可能含恶意 hidden trigger）

plugin (native cdylib)
  → 一律拒，仅 dev-mode 例外（§六.3-6.5）

bundle
  → 不可 sideload
```

### 19.8 Workspace Trust 仍然生效

[§七 Workspace Trust](#七workspace-trust) 仍作用于 sideload：

```
工程 trust 等级           sideload 行为
─────────────────────────────────────────────────────
trusted (用户工程)        全部 sideload 资产可加载
restricted (新工程)       sideload 一律不加载
limited (untrusted 来源)   sideload 一律不加载
```

即使 dev-mode 启用，restricted workspace 中仍不加载 sideload plugin。

### 19.9 CLI 工具

为非 webview 用户提供命令行：

```bash
# 安装本地资产
neko-market local install <path> [--type <t>] [--name <n>]

# 列出所有 sideload
neko-market local list [--type <t>]

# 卸载
neko-market local uninstall <id>

# 生成 manifest 草稿
neko-market local generate-manifest <path> > manifest.json

# 准备发布（生成上传给 server 的包）
neko-market publish-prep <path> --output dist/

# Developer mode 切换
neko-market dev-mode on / off / status
```

### 19.10 Sideload 不允许的边界

```
✗ Sideload 资产不能上传到 market
   必须经过 publisher 流水（KYC + 审核）

✗ Sideload 资产不能被 license 引用
   sideload 无 entitlement 概念
   付费包不能依赖 sideload contents

✗ Sideload native plugin 在非 dev-mode 一律拒
   即使用户"理解风险"也不放行
   保护用户即使是用户自己想做傻事

✗ Sideload 资产无更新追踪
   用户自己管版本
   不会出现在 Market.Updates Tab

✗ Sideload 资产无 watermark / signature
   无追溯能力（用户自己负责）

✗ Sideload 资产不参与 market 推荐 / 搜索
   仅本地可见，不上 server

✗ Bundle 不能 sideload
   bundle.contents 假定 publisherId 存在
   想做"本地集合"用 starter 或自己组织目录

✗ Sideload 不应跨工程"自动启用"
   每个工程的 workspace trust 独立判定
   防止恶意工程自动激活
```

### 19.11 与 §六 T4 Plugin Sideload 的关系

```
§六.3-6.5    专门讨论 plugin (native cdylib) 的 sideload
              · 一律拒（除非 dev-mode 14 天）
              · 这是高风险 type 的特殊待遇

§十九         讨论所有 type 的 sideload 通用模型
              · plugin 部分引用 §六.3-6.5
              · 其它 type 大多直接接受
              · bundle 一律拒
              · 提供统一目录 / manifest 生成 / CLI / UI
```

简单说：**plugin sideload 走严，其它 type sideload 走宽**。这是因为 native code = 进程级权限，其它 type 多是数据 / 配置 / 文本 / GPU sandbox 资源。

### 19.12 反模式（追加）

```
MK-P16  Sideload native plugin 用户 override
        现象：弹"理解风险"对话框允许 native sideload（绕过 dev-mode）
        代价：用户被钓鱼即沦陷
        修法：必须 dev-mode + 14 天自动关闭，无次级 override

MK-P17  Sideload 跨工程自动启用
        现象：在 A 工程启用的 sideload 在 B 工程也自动加载
        代价：恶意工程假装是 A 自动激活
        修法：每个工程独立 workspace trust 判定

MK-P18  Sideload 资产能上 market
        现象：用户能直接把 sideload 推到 server
        代价：绕过 KYC / 无审核
        修法：sideload 仅本地，发布走 publisher KYC 流水
              (与 MK-P14 重叠，本条强调 sideload 视角)

MK-P19  Bundle 包含 sideload
        现象：bundle.contents 引用 sideload 资产
        代价：bundle 假定 publisher namespace 存在 → 解析失败
        修法：禁止 bundle 引用 sideload，必须先 publish

MK-P20  把"导入素材"误当 sideload
        现象：用户拖入视频 / 图片，市场 UI 弹"安装本地资产"流程
        代价：流程混乱 / UX 灾难
        修法：清晰区分两种本地化（§十九.1），sideload 仅针对"可重用资产"
              非自己拍的视频 / 自己画的图（这些走 neko-assets import）
```

---

## 附录 A：变更日志

### v1.2（2026-05-06 修订）

```
+ 本轮一致性修订
  · 标题 / 范围明确 §十九为 sideload 全局治理
  · T2 Verified 映射到 distribution.publisher.verified
  · Workspace Trust 默认判定拆成 created locally / opened existing / quarantined source
  · Engine audit 边界从 syscall hook 改为 host-api audit
  · §十五明确 server contract 是 HTTP 字段与不变量权威位置

+ §十九 Sideload Across AssetTypes（新增）
  · 跨 11 种 AssetType 的统一 sideload 治理
  · 两种本地化方式区分（import vs sideload）
  · Per-type sideload 行为表
  · 物理隔离目录 ~/.neko/local/
  · 自动推断 type + 最小 manifest 生成
  · Market.Installed UI 统一展示（[Local] badge）
  · Trust 闸门按 type 差异化（plugin 严，其它宽）
  · CLI 工具
  · Sideload 不允许的边界
  · 与 §六 T4 Plugin Sideload 的关系明确

+ 反模式 +5（MK-P16 ~ MK-P20）
  · MK-P16 Sideload native plugin 用户 override
  · MK-P17 Sideload 跨工程自动启用
  · MK-P18 Sideload 资产能上 market
  · MK-P19 Bundle 包含 sideload
  · MK-P20 把"导入素材"误当 sideload

不变：
  · §一 ~ §十八 全部内容
  · v1.1 关于"不支持 WASM"的所有决策
```

### v1.1（2026-05-05 修订）

```
± 决策：不支持 WASM
        从原 v1.0 的"native + WASM 二分"改为"native only"
        WASM 不在当前范围，也不计划支持（见 §一.2）

± Trust Tier 从四档改为三档
        T3 Community 在 plugin 这一类不存在通道
        匿名 publisher 不能发布 native 代码
        社区贡献通过其它 10 种 AssetType（§三.3）

± Permission 模型重写
        从旧的强制沙箱表述改为"声明性 + 审核 + host-api audit"
        Native plugin 没有运行时沙箱
        Permission 用于：用户告知 / KYC 审核 / engine host-api audit / publisher 信誉
        host-api 超出声明范围靠 server 累积上报触发处分（§五）

± 反模式 +2
        MK-P10 把 permission 当沙箱（明确 native 无沙箱）
        MK-P15 强行让 plugin 承载社区贡献（社区走其它 type）

± §四 Native vs WASM 二分 → §四 Native plugin 治理基础
        明确无沙箱事实
        三层信任根（KYC + 用户同意 + workspace）

± §十三 商业化路径
        方案 Z 从"WASM 通道"改为"通过其它 AssetType 走社区路径"
        加 §十三.4 决策树（开发者选哪条）

± §十八 实施路径
        删除 P1.b 中 WASM permission sandbox 部分
        保留 permission 声明模型 + audit log

不变：
  · §八 8 战术防盗用
  · §九 三档保护策略
  · §十 Server-side compilation pipeline
  · §十一 Engine 内 license 闸门
  · §十二 威胁矩阵
  · §十四 Shader 治理
  · §十五 Server 契约扩展
  · §十六 反模式（除 +2 改动外）
  · §十七 与既有架构关系
```

### v1.0（2026-05-05 初版）

```
+ 抽出自 marketplace.md 的 plugin 安全 / trust / 防盗版讨论
+ 范围明确：plugin = engine 扩展，不是 VSCode 扩展
+ 涵盖 shader 治理（与 plugin 类似）
+ 完整内容：
  · Trust Tier (T1 Core / T2 Verified / T3 Community / T4 Sideload)
  · PluginPermission 12 种枚举
  · 用户安装流程
  · Workspace Trust
  · 8 战术防盗用
  · 三档保护策略
  · Server-side compilation pipeline
  · Engine 内 license 闸门 7 步流程
  · 威胁 × 防御矩阵
  · 商业化两条路径
  · Shader 三档保护
  · Server 契约扩展
  · 13 条反模式 (MK-P1 ~ MK-P13)
  · 实施路径 Phase 6.5.6i / 6j / 6k / 6l
```

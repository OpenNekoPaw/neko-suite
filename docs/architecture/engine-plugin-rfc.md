# RFC: neko-engine 插件化架构

> 状态：Active（P1 MVP + semver + activation handler 已完成） | 日期：2026-04-08 | 更新：2026-04-08  
> 关联：[marketplace.md](./marketplace.md) · [model-runtime.md](./model-runtime.md) · [vscode-constraints.md](./vscode-constraints.md) · [engine-runtime-layering.md](./engine-runtime-layering.md)

---

## 一、背景

`neko-engine` 的目标已经不再只是视频编解码与导出，而是逐步演化为：

- 视频、2D、3D、VR、游戏、仿真等场景的统一计算/渲染底座
- 文档/媒体/项目文件的通用兼容层
- 摄像头、麦克风、MIDI、Gamepad 等外设的统一代理层
- 轻量本地 AI 推理与资产处理节点

随着场景扩张，Engine 必须回答两个问题：

1. 哪些能力应该内建在内核里？
2. 哪些能力应该允许通过插件扩展？

当前 `neko-engine` 已存在两个“受控扩展点”：

- `effects:register`：运行时注册 WGSL Shader
- `models:register`：运行时注册 ONNX 模型

但除此之外，控制器、路由、HTTP 端点、服务装配、Action group/action 列表仍是**编译期固定**。这意味着当前架构更像“统一宿主 + 内建能力集”，还不是完整的插件平台。

---

## 二、问题定义

如果完全不支持插件化：

- 新能力只能通过修改主仓内核发布
- 市场中的 `shader / model / plugin` 只能停留在资产分发层，无法形成稳定的 Engine 扩展协议
- 不同团队对格式、设备、导出器、预览器的扩展会持续挤压主仓

如果过早做“全量原生插件系统”：

- Rust 动态库 ABI 稳定性差
- 跨平台打包、签名、崩溃定位、安全隔离都很重
- 第三方代码一旦进入 Engine 进程内，故障域和安全边界会迅速恶化

因此，插件化必须走**受控能力扩展**，而不是“任意代码注入内核”。

---

## 三、核心决策

### 决策 1：插件化目标是 Capability，不是 Kernel

**结论**：`neko-engine` 插件化应针对“能力插件（capability plugin）”，而不是“内核插件（kernel plugin）”。

**含义**：

- Kernel 负责 GPU/Codec/Task/Session/Registry/Transport 等稳定底座
- 插件只扩展特定能力面，不接管宿主生命周期
- 插件不能直接修改 `EngineApi`、`ActionRouter`、`StreamRegistry`、`GpuContext` 的内部状态模型

### 决策 2：优先支持声明型/资源型/受控适配型插件

**第一阶段允许的插件形态**：

- Shader / LUT / Effect Preset
- AI Model / 推理任务适配
- 文件格式探测与预览适配
- 设备适配器
- 导出器 / 编码预设
- 外部 Runtime Connector

**第一阶段不支持**：

- 任意第三方 Rust `dylib/.so/.dll` 直接注入 Engine 进程
- 插件自定义顶层 HTTP 路由
- 插件直接持有宿主内部锁与共享资源对象

### 决策 3：顶层命名空间由 Host 持有

**结论**：插件默认挂到 Host 已定义的固定能力组，不开放无限制的动态顶层 action group。

推荐的固定能力组：

- `effects`
- `models`
- `formats`
- `devices`
- `exporters`
- `previews`
- `connectors`
- `plugins`（仅生命周期/状态查询）

这样可以避免 `ActionRouter`、CLI、权限模型和 API 文档被插件数量无限放大。

### 决策 4：分发走 `neko-market`，激活走 Engine Host

插件的职责链路应拆开：

- `neko-market`：搜索、下载、校验、安装、升级、卸载
- `neko-engine` Host：扫描 manifest、校验兼容性、注册 capability、激活/停用

也就是说，市场负责“包管理”，引擎负责“运行时编排”。

### 决策 5：官方插件与 SDK 保留主仓，社区插件允许独立仓

**主仓保留**：

- Kernel / Host
- Plugin SDK
- Manifest schema
- Contract tests
- 官方维护的参考插件

**可独立仓**：

- 社区插件
- 实验性插件
- 企业私有插件
- 特定行业格式/设备适配器

---

## 四、插件类型分层

### 4.1 资源型插件

特点：

- 只携带资源，不带可执行逻辑
- 由 Host 用内建执行器消费

示例：

- WGSL Shader
- LUT
- Effect Preset
- 编码预设
- 格式描述元数据

### 4.2 受控适配型插件

特点：

- 携带 manifest + 声明 + 少量受控入口
- 由 Host 注册到对应 Registry

示例：

- 文件格式探测器
- 导出器适配
- 设备发现/采集适配器
- 预览适配器

### 4.3 外部连接器插件

特点：

- 不把复杂逻辑放进 Engine 进程
- 通过子进程、sidecar、远程服务或标准协议连接

示例：

- 外部 VR Runtime Connector
- 仿真器 Connector
- 企业内部设备网关 Connector

### 4.4 暂缓类型：进程内原生代码插件

该类型不作为现阶段目标。只有在下面条件同时满足时再评估：

- Plugin ABI 已稳定
- Host 具备崩溃隔离与权限限制
- 市场分发与签名链路成熟
- 有真实的性能瓶颈证明纯 manifest/connector 模式不够用

---

## 五、目标架构

```text
neko-market
  └─ 安装/升级/卸载插件包
       └─ 写入插件 manifest + 资源文件

neko-engine Host
  ├─ PluginManager
  │   ├─ 扫描安装目录
  │   ├─ 校验 engineVersion / platform / capability
  │   ├─ 激活/停用插件
  │   └─ 暴露插件状态
  │
  ├─ Capability Registries
  │   ├─ ShaderRegistry
  │   ├─ ModelRegistry
  │   ├─ FormatRegistry
  │   ├─ DeviceRegistry
  │   ├─ ExporterRegistry
  │   ├─ PreviewRegistry
  │   └─ ConnectorRegistry
  │
  ├─ Kernel
  │   ├─ GPU / Codec / Stream / Task / Session
  │   ├─ File Probe / Resource Registry
  │   └─ Transport (HTTP / WS / N-API / CLI)
  │
  └─ Fixed Controllers / Fixed Groups
       ├─ effects
       ├─ models
       ├─ formats
       ├─ devices
       ├─ exporters
       ├─ previews
       └─ plugins
```

---

## 六、Manifest 草案

```json
{
  "id": "com.neko.shader.chromatic-bloom",
  "name": "Chromatic Bloom",
  "version": "0.1.0",
  "kind": "shader",
  "engineVersion": "^0.2.0",
  "platforms": ["darwin-arm64", "darwin-x64", "linux-x64", "win32-x64"],
  "capabilities": [
    {
      "type": "effect-shader",
      "entry": "shaders/chromatic_bloom.wgsl",
      "params": [
        { "name": "threshold", "type": "float", "default": 0.8, "min": 0.0, "max": 1.0 },
        { "name": "intensity", "type": "float", "default": 1.2, "min": 0.0, "max": 4.0 }
      ]
    }
  ],
  "permissions": [],
  "integrity": {
    "algorithm": "sha256",
    "value": "..."
  }
}
```

建议保留的最小字段：

- `id`
- `version`
- `kind`
- `engineVersion`
- `platforms`
- `capabilities`
- `permissions`
- `integrity`

---

## 七、安全与隔离策略

| 插件类型 | 执行位置 | 风险级别 | 策略 |
|---------|---------|---------|------|
| Shader / LUT / Preset | Host 内建执行器 | 低 | 仅允许声明型资源，严格参数校验 |
| Model Registration | Host 内建推理器 | 中 | 仅注册模型，不允许自带任意执行逻辑 |
| Format / Preview Adapter | Host 受控 Registry | 中 | 只开放小接口，限制文件系统与网络权限 |
| External Connector | 外部进程/远程服务 | 中 | 用 manifest 声明连接方式，Host 只做健康检查与转发 |
| In-process Native Plugin | Engine 进程内 | 高 | 当前禁用 |

补充原则：

- 插件权限必须声明式、可审计
- 插件启停必须可追踪
- 插件失败不能拖垮 Kernel 主循环
- Host 必须区分“插件不可用”和“内核不可用”

---

## 八、API 设计建议

### 8.1 现有能力正规化

把当前已有的运行时注册能力定义为正式协议：

- `effects:register`
- `effects:list`
- `effects:info`
- `models:register`
- `models:unregister`
- `models:list`

### 8.2 后续新增固定组

建议新增而非动态拼装顶层路由：

- `formats:register | probe | list`
- `devices:register | list | connect | disconnect`
- `exporters:register | list | export`
- `previews:register | probe | stream`
- `plugins:list | inspect | enable | disable | reload`

### 8.3 避免的设计

不建议：

- `POST /v1/:plugin/:action` 这类完全动态顶层路由
- 插件自行注入 `ActionRouter`
- 插件向 CLI 注入任意命令树

原因是这会把 Host 退化成无边界脚手架，难以保证权限、文档、版本兼容与稳定性。

---

## 九、与 Runtime 分层的关系

插件化与 runtime 分层不是一回事：

- **Plugin**：扩展某种能力
- **Runtime**：承载某个领域的执行模型

例如：

- Shader 是插件
- ONNX 模型是插件
- 文件格式探测器是插件
- 3D Runtime 不是插件
- 2D Runtime 不是插件
- 游戏/仿真/XR Runtime 更不应直接等同于插件

复杂 runtime 应先作为宿主下的独立包，只有在主循环、部署模型、故障域完全独立时，才进一步升格为独立 sidecar。

---

## 十、实施阶段

### Phase P0：前置——包名语义化 ✅ 已完成

- 8 个 crate 从 `native-*` 重命名为 `engine-*/host-*/runtime-*`
- 详见 [engine-runtime-layering.md](./engine-runtime-layering.md) Phase R0

### Phase P0.5：现状

- 固定控制器 + 固定 action group（host-api 中 17 个 controller）
- Shader / Model 已有运行时注册入口（`effects:register` / `models:register`）
- 无统一 PluginManager / Manifest / 插件状态模型

### Phase P1：Capability Plugin MVP ✅ 已完成

- `host-api/src/plugin/manifest.rs` — `EnginePluginManifest` struct（对应第六节 manifest 草案）
- `host-api/src/plugin/manager.rs` — `PluginManager`：扫描 plugin.json、校验 engineVersion 兼容性、enable/disable/reload
- `host-api/src/controllers/plugins.rs` — `PluginsController`：plugins:list/inspect/enable/disable/reload
- `engine-types/src/registry.rs` — 新增 `PLUGINS` group + actions
- 12 个测试覆盖发现、启停、版本兼容、kind 过滤
- **待后续**：将 effects:register / models:register 纳入统一插件生命周期

### Phase P2：扩展到格式/设备/导出器

- 引入 `FormatRegistry`
- 引入 `DeviceRegistry`
- 引入 `ExporterRegistry`
- 市场安装后自动触发注册与兼容性检查

### Phase P3：引入 Connector Plugin

- 允许插件声明外部 sidecar / 远程 runtime
- Host 负责健康检查、状态同步、统一错误模型

### Phase P4：社区插件生态

- 主仓保留 SDK 与 contract tests
- 社区插件在独立仓开发
- 市场按 manifest 与兼容矩阵进行验证

---

## 十一、明确不做

当前阶段明确不做：

- 通用进程内原生插件 ABI
- 插件任意注入内核服务对象
- 插件自定义顶层路由与传输协议
- 把 `游戏 / 仿真 / XR` 直接实现成普通 capability plugin

---

## 十二、结论

`neko-engine` 需要插件化，但正确方向是：

- **Kernel 稳定**
- **Capability 可插拔**
- **Runtime 谨慎分层**

也就是说，Engine 应先成为“受控扩展平台”，而不是“任意代码宿主”。

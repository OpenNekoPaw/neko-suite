neko-engine 自定义 Shader 支持分析                                                                                                             
                                                                                                                                                 
  结论：接口已定义，但实现未完成                                                                                                                 
                                                                                                                                                 
  neko-engine 在类型层和接口层已经为自定义 shader 预留了扩展点，但 Rust 核心层尚未实现运行时动态 shader 编译和执行。                             
                                                                                                                                                 
  ---                                                                                                                                            
  已有的基础设施

  1. TypeScript 接口层 — 契约已就绪

  neko-types/.../effects.ts:116-120 定义了 CustomEffectParams：
  interface CustomEffectParams {
      type: 'custom';
      shaderId: string;
      uniforms?: Record<string, number | number[] | boolean>;
  }

  IEffectProcessor 接口预留了注册方法（effects.ts:254）：
  registerCustomShader?(id: string, shaderCode: string): Promise<void>;
  注意 ? — 这是可选方法，说明当前实现者尚未提供。

  2. Rust 类型层 — 枚举已预留

  types/src/effects.rs:89 已有 EffectType::Custom，且 EffectParams.params 使用 serde_json::Value 承载自定义参数，具备扩展性。

  3. GPU 处理器架构 — 模式一致

  所有现有处理器遵循统一模式：
  WGSL shader (include_str! 编译时嵌入)
    → create_shader_module
    → create_compute_pipeline
    → bind group (input_texture + output_texture + uniform_buffer)
    → dispatch compute workgroups (16×16)

  ---
  未实现的部分

  ┌────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────┐
  │      缺失环节      │                                           说明                                            │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ 运行时 shader 编译 │ 所有 shader 通过 include_str!() 在编译期嵌入，无运行时 create_shader_module 接受外部 WGSL │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ GpuCustomProcessor │ 不存在动态管理自定义 pipeline 的处理器                                                    │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ Shader 注册表      │ 无 HashMap<String, ShaderModule> 之类的运行时 shader 存储                                 │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ Uniform 动态绑定   │ 现有 uniform 结构是编译期固定的 Rust struct，无法动态匹配用户自定义参数                   │
  ├────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ 安全验证           │ 无 WGSL 语法/安全检查，直接编译恶意 shader 可能导致 GPU hang                              │
  └────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  可行性评估

  技术上完全可行，wgpu 原生支持运行时 shader 编译。实现路径：

  用户 WGSL 代码 (TypeScript)
    → N-API 传递到 Rust
    → WGSL 验证 (naga validator)
    → device.create_shader_module (运行时)
    → 缓存到 HashMap<String, CachedPipeline>
    → processFrame 时按 shaderId 查找并执行

  关键实现步骤：

  1. Shader 契约规范 — 定义自定义 shader 必须遵循的 I/O 约定：
  // 用户只需实现 effect 函数，引擎注入 binding 模板
  fn custom_effect(color: vec4<f32>, uv: vec2<f32>, params: CustomParams) -> vec4<f32> {
      // user code here
  }
  2. GpuCustomProcessor (Rust) — 动态 shader 管理器：
  struct GpuCustomProcessor {
      pipelines: HashMap<String, wgpu::ComputePipeline>,
      context: Arc<GpuContext>,
  }

  fn register_shader(&mut self, id: &str, wgsl: &str) -> Result<()> {
      // 1. naga 验证
      // 2. 注入 binding 模板
      // 3. create_shader_module + create_compute_pipeline
      // 4. 缓存
  }
  3. 动态 Uniform Buffer — 用 Vec<u8> + 反射代替固定 struct
  4. 安全沙箱 — naga validator 限制循环次数、禁止无限循环、超时保护

  ---
  建议

  当前架构的扩展性设计良好（EffectType::Custom + registerCustomShader? + serde_json::Value 参数），但从接口到实现的鸿沟较大。如果要支持自定义
  shader，建议分两阶段：

  - Phase 1: 支持预定义模板 shader（用户只调参数，shader 代码由引擎内置），类似现有 EffectType::Custom + JSON params 的思路
  - Phase 2: 支持完全自定义 WGSL，需要完整的 shader 验证、模板注入、动态 pipeline 管理

  需要我详细设计某个阶段的实现方案吗？
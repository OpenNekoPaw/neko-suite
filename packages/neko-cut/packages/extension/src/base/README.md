# base/

基础设施模块，提供依赖注入容器和服务管理。

## 职责

提供轻量级的服务容器，实现扩展内部的依赖注入。

## 结构

```
base/
├── index.ts              # 模块导出
└── serviceCollection.ts  # 服务容器实现
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `ServiceCollection` | 类 | 服务容器 |
| `ServiceIdentifier<T>` | 类型 | 服务标识符 |
| `createServiceId<T>()` | 函数 | 创建服务 ID |
| `setGlobalServices()` | 函数 | 设置全局服务 |
| `getService<T>()` | 函数 | 获取服务实例 |

## 依赖

```
→ 无外部依赖
← 所有其他模块   # 服务注册和获取
```

## 使用示例

```typescript
// 定义服务标识符
const IMyService = createServiceId<IMyService>('myService');

// 注册服务
services.set(IMyService, new MyServiceImpl());

// 获取服务
const myService = getService(IMyService);
```

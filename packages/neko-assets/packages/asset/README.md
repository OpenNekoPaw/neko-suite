# @neko/asset

> 素材管理核心包，提供 Entity-Variant-File 三层层次结构的素材管理能力

## Context Summary

- 项目：Neko Suite - VSCode 视频编辑器
- 架构：独立包，被 Extension 集成使用
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：素材实体管理、变体管理、文件管理、搜索、AI 分类
- **入口**：`AssetLibrary` facade
- **依赖**：`@neko/shared`（类型）, `@neko/platform`（可选，AI 分类）

## 核心概念

```
AssetEntity（素材实体）     // 一个人物/物品/特效，如"小明"
    │
    ├── AssetVariant（变体） // 不同表现形式：正面/侧面、微笑/悲伤
    │       │
    │       └── AssetFile（文件） // 具体媒体文件
    │
    └── metadata, tags, aliases...
```

## 使用示例

```typescript
import { AssetLibrary, InMemoryStorage } from '@neko/asset';

// 初始化
const storage = new InMemoryStorage();
const library = new AssetLibrary({ storage });
await library.initialize();

// 创建实体
const entity = await library.createEntity({
  name: '小明',
  category: 'character',
  tags: ['主角', '男性'],
});

// 添加变体
const variant = await library.addVariant(entity.id, {
  name: '正面微笑',
  attributes: { view: 'front', expression: 'happy' },
});

// 添加文件
const file = await library.addFile(variant.id, '/assets/xiaoming-smile.png');

// 搜索
const result = await library.search({
  keyword: '小明',
  categories: ['character'],
});

// 导入文件（自动分类）
const importResult = await library.importFile('/assets/new-character.png', {
  autoClassify: true,
});
```

## 目录结构

```
src/
├── storage/                # 存储层
│   ├── IAssetStorage.ts    # 存储接口
│   ├── InMemoryStorage.ts  # 内存存储（测试用）
│   └── JsonFileStorage.ts  # JSON 文件存储
│
├── service/                # 服务层
│   ├── AssetLibrary.ts     # 主 Facade
│   ├── EntityService.ts    # 实体 CRUD
│   ├── VariantService.ts   # 变体管理
│   └── FileService.ts      # 文件管理
│
├── classifier/             # 分类器
│   ├── IClassifier.ts      # 分类器接口
│   └── RuleClassifier.ts   # 规则分类器
│
└── __tests__/              # 单元测试
```

## 存储实现

| 实现 | 用途 | 说明 |
|------|------|------|
| `InMemoryStorage` | 测试 | 纯内存，重启丢失 |
| `JsonFileStorage` | 生产 | JSON 文件持久化 |

## 实体分类

```typescript
type EntityCategory =
  | 'character'     // 人物角色
  | 'creature'      // 生物/动物
  | 'object'        // 物品道具
  | 'vehicle'       // 载具
  | 'environment'   // 场景环境
  | 'effect'        // 特效粒子
  | 'ui'            // UI元素
  | 'audio';        // 音频素材
```

## 变体属性

```typescript
interface VariantAttributes {
  view?: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric' | '3/4';
  expression?: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'talking' | 'sleeping';
  action?: 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'sit' | 'lie';
  texture?: 'diffuse' | 'normal' | 'roughness' | 'metallic' | 'emission' | 'alpha' | 'ao';
  outfit?: string;
  lighting?: string;
  timeOfDay?: 'day' | 'night' | 'dawn' | 'dusk';
  weather?: string;
}
```

## 测试

```bash
pnpm test        # 运行测试
pnpm build       # 构建
```

## 设计文档

详细设计见 [素材管理系统设计方案](../../docs/architecture/asset-management-system-design.md)

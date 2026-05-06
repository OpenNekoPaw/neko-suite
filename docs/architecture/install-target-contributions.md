# neko-market InstallTarget Contribution Guide

> 关联：[marketplace.md §9.4-9.5](./marketplace.md) · [manifest-schema-spec.md](./manifest-schema-spec.md)

本文给领域扩展实现 Y 类 InstallTarget 使用。`neko-market` 只内建 X 类 `media` / `starter` / `preset` / `bundle`；`skill` / `plugin` / `shader` / `identity` / `endpoint` / `provider` / `model` 由 owning package 通过公开 API 贡献。

## package.json 贡献

```jsonc
{
  "contributes": {
    "neko.installTargets": [
      { "type": "skill", "activationEvent": "onInstallType:skill" },
      { "type": "shader", "kind": "material", "activationEvent": "onInstallKind:shader.material" }
    ]
  },
  "activationEvents": [
    "onInstallType:skill",
    "onInstallKind:shader.material"
  ]
}
```

规则：

```
✓ type 必须是 v4 AssetType
✓ kind 只用于 metadata kind 级覆盖
✓ X 类 type 不允许被整体覆盖，但允许更具体的 kind 级路由（如 `media.puppet-motion`）
✓ 同一 type/kind 只能有一个贡献者
✓ market 启动期只扫描 contribution metadata，不激活领域扩展
```

## activation 注册

```typescript
import * as vscode from 'vscode';
import type { NekoMarketAPI } from 'neko-market/packages/extension/src/market-api';
import type { AssetManifest, IInstallTarget, InstallState } from '@neko/shared';

class SkillInstallTarget implements IInstallTarget<'skill'> {
  readonly type = 'skill' as const;

  getInstallPath(manifest: AssetManifest): string {
    return `/your/relative/root/skills/${manifest.id.replace(/[\\/]/g, '__')}`;
  }

  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'skill') {
      throw new Error(`Expected skill manifest, got ${manifest.type}`);
    }
  }

  async onPreInstall(manifest: AssetManifest): Promise<void> {
    // Check domain-owned prerequisites before staging.
  }

  async onPostInstall(manifest: AssetManifest, installedPath: string): Promise<void> {
    // Register staged payload with the owning domain registry.
  }

  async onPreUninstall(manifest: AssetManifest, installedPath: string): Promise<void> {
    // Unregister domain projection before files are removed.
  }

  async onRollback(manifest: AssetManifest, partial: Partial<InstallState>): Promise<void> {
    // Clean domain-specific partial side effects.
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const marketExtension = vscode.extensions.getExtension<NekoMarketAPI>('neko.neko-market');
  const market = marketExtension?.isActive
    ? marketExtension.exports
    : await marketExtension?.activate();
  if (!market) return;

  context.subscriptions.push(
    market.registerInstallTarget(new SkillInstallTarget()),
  );
}
```

## 生命周期钩子

```
validateManifest   discover/resolve 后、stage 前；只做快速契约检查
onPreInstall       preflight 内；检查 domain prerequisites，不做永久副作用
onPostInstall      activate 阶段；注册 runtime/provider/tool/skill 等 domain projection
onPreUninstall     uninstall 删除文件前；先移除 domain projection
onRollback         install 失败后；清理已发生的 domain-specific side effects
```

Target 不负责通用下载、SRI 校验、entitlement、trust、bundle 引用计数或 EffectsManifest 反演；这些属于 market-core。

## 测试要求

```
✓ contribution discovery：package.json 声明被 market 发现但不立即激活
✓ lazy activation：安装对应 type/kind 时才 activate owning extension
✓ registration：activate 后调用 registerInstallTarget，并返回 Disposable
✓ unregister：dispose 后该 type/kind 不再可路由
✓ duplicate：重复 type/kind 或 X/Y overlap 必须被拒绝
✓ failure：activation throw 或 promised-but-not-registered 要返回明确诊断
✓ architecture guard：market extension 不 import 领域包；webview 不 import vscode
```

消费面应订阅 `NekoMarketAPI.onDidMarketPackageEvent`，不要读取 market webview store 或 private installed registry。

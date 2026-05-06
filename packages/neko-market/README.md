# Neko Marketplace

`neko-market` is the VSCode host adapter and webview for the Neko Suite marketplace. Core protocol and install logic live in `packages/core` and stay free of VSCode/React dependencies.

## Settings

- `neko.market.registryUrl`: optional Registry API v1 base URL.
- Empty value uses the official default: `https://market.neko.dev/api/v1`.
- Registry URL changes are applied at runtime and trigger entitlement refresh.

## Auth

The extension looks up `neko.neko-auth` at activation. If a session exists, its access token is injected into `MarketClient` as `Authorization: Bearer <token>`. Logout removes the token. Market core does not import VSCode or `neko-auth`.

## Checkout And Deep Links

Purchase, renewal, invoice, and support flows always open externally through `vscode.env.openExternal`.

The checkout return URL is:

```text
vscode://neko.market/refresh?packageId=<encoded-package-id>
```

That deep link refreshes entitlements and package detail. The webview never renders payment forms or stores payment state.

## Install Targets

Domain packages contribute Y-class targets through `NekoMarketAPI.registerInstallTarget`. See [InstallTarget Contribution Guide](../../docs/architecture/install-target-contributions.md).

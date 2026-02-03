/**
 * AssetLibraryStandalone
 *
 * Standalone container for the Asset Library panel.
 * Used as webview content in VSCode sidebar.
 */

import { AssetPanel } from './AssetPanel';

export function AssetLibraryStandalone() {
	return (
		<div className="h-full bg-vscode-bg text-vscode-foreground">
			<AssetPanel />
		</div>
	);
}

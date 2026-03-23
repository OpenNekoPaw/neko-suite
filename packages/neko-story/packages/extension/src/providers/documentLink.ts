import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Regex matching [[see: relative/path.ext]] references.
 * Captures the file path inside the brackets.
 */
const SEE_LINK_PATTERN = /\[\[see:\s*([^\]]+\.fountain)\s*\]\]/gi;

/**
 * Provides clickable document links for [[see: file.fountain]] references.
 * Resolves paths relative to the current document's directory.
 * Does not depend on IWorkspaceIndex (pure syntax-based).
 */
export class FountainDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    const currentDir = path.dirname(document.uri.fsPath);

    let match: RegExpExecArray | null;
    SEE_LINK_PATTERN.lastIndex = 0;

    while ((match = SEE_LINK_PATTERN.exec(text)) !== null) {
      const filePath = match[1]?.trim();
      if (!filePath) continue;

      const startOffset = match.index + match[0].indexOf(filePath);
      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(startOffset + filePath.length);
      const range = new vscode.Range(startPos, endPos);

      const resolvedPath = path.resolve(currentDir, filePath);
      const targetUri = vscode.Uri.file(resolvedPath);

      const link = new vscode.DocumentLink(range, targetUri);
      link.tooltip = `Open ${filePath}`;
      links.push(link);
    }

    return links;
  }
}

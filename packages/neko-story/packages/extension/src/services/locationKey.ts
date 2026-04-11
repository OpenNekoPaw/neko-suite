import * as vscode from 'vscode';

export function serializeLocationKey(uri: vscode.Uri, range: vscode.Range): string {
  return [
    uri.toString(),
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  ].join(':');
}

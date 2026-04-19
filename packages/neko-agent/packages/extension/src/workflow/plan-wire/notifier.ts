/**
 * Plan Wire — user notifier seam.
 *
 * PlanReviewSession used to reach for `vscode.window.showWarningMessage`
 * directly inside handleFork; wrapping it behind an interface means the
 * session only sees `warn(message)`, tests can inject a silent stub,
 * and future UI channels (status bar, inline chat) can plug in without
 * touching review semantics.
 */

import * as vscode from 'vscode';

export interface UserNotifier {
  warn(message: string): void;
}

export const VSCodeUserNotifier: UserNotifier = {
  warn(message: string): void {
    void vscode.window.showWarningMessage(message);
  },
};

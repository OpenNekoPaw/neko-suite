import * as path from 'path';
import { isAbsoluteLocalRef, normalizeDashboardLocalRef } from '@neko/shared/types/dashboard-task';

export function isSafeRelativePath(value: string): boolean {
  if (!value || path.isAbsolute(value)) return false;
  if (value.includes('\\')) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function isSafeDashboardLocalRef(value: string): boolean {
  if (isAbsoluteLocalRef(value) || value.startsWith('${')) return false;
  return normalizeDashboardLocalRef(value) === value && isSafeRelativePath(value);
}

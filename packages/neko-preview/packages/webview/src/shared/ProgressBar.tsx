/**
 * ProgressBar - neko-preview wrapper over @neko/shared/components/ProgressBar
 *
 * Injects `formatTime` from @neko/neko-client as the default tooltip formatter,
 * so existing consumers don't need to pass `formatTooltip` explicitly.
 */
import { formatTime } from '@neko/neko-client';
import {
  ProgressBar as SharedProgressBar,
  type ProgressBarProps as SharedProgressBarProps,
} from '@neko/shared/components';

export type ProgressBarProps = SharedProgressBarProps;

export function ProgressBar(
  props: Omit<SharedProgressBarProps, 'formatTooltip'> & { formatTooltip?: (t: number) => string },
) {
  return <SharedProgressBar formatTooltip={formatTime} {...props} />;
}

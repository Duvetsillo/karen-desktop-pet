import type { Settings } from '../shared/types.js';
import type { CoreStore } from './core-store.js';

/** Apply a shared style without writing the observed value back to Core. */
export function applyCoreVoiceStyle(
  core: Pick<CoreStore, 'getVoiceStyle'>,
  current: Settings,
  save: (patch: Partial<Settings>) => Settings,
  notify: (settings: Settings) => void,
): boolean {
  const style = core.getVoiceStyle();
  if (!style || style === current.voiceStyle) return false;
  notify(save({ voiceStyle: style }));
  return true;
}

/**
 * When an open memory segment should close.
 * The turn that starts a new topic is not folded into the previous segment.
 */
import { SEGMENT_TOKEN_BUDGET } from '../timeline.js';

export function detectTopicShift(nextUserText) {
  const next = String(nextUserText || '');
  if (/回到刚才|回到上周|那个方案|那个设计|继续刚才/.test(next)) return true;
  if (/换个(问题|话题)|另外说|先别|不说这个|我们说点别的|先做/.test(next)) return true;
  return false;
}

/**
 * @param {{ segmentTokens: number, addedTokens: number, idle: boolean, topicShift: boolean, budget?: number }} input
 */
export function decideSegmentClose(input) {
  const budget = input.budget ?? SEGMENT_TOKEN_BUDGET;
  const hasHistory = (input.segmentTokens || 0) > 0;
  if (input.topicShift && hasHistory) {
    return { closeBefore: true, closeAfter: false, reason: 'topic' };
  }
  if (input.idle && hasHistory) {
    return { closeBefore: true, closeAfter: false, reason: 'idle' };
  }
  if ((input.segmentTokens || 0) + (input.addedTokens || 0) >= budget) {
    return { closeBefore: false, closeAfter: true, reason: 'tokens' };
  }
  return { closeBefore: false, closeAfter: false, reason: '' };
}

/**
 * Rebuild a scene summary from the memories that are still in force.
 * The embedding for the scene must use this same text.
 * @param {{ episode?: string, superseded?: boolean, retracted?: boolean }[]} cells
 */
export function resynthesizeSceneSummary(cells) {
  const live = (cells || []).filter((cell) => cell && !cell.superseded && !cell.retracted);
  return live
    .map((cell) => String(cell.episode || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 2000);
}

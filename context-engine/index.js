/**
 * OpenClaw context engine for the Agent OS session only.
 * Other session keys are returned unchanged, and compaction stays with the host.
 */
import { assembleForSession } from '../service/src/context/assemble.js';
import { isAgentOsSessionKey } from '../service/src/timeline.js';

export const ENGINE_INFO = {
  id: 'agent-os',
  name: 'Agent OS',
  ownsCompaction: false,
  acceptedHostParams: ['sessionKey', 'runtimeContext'],
  transcriptSemantics: {
    currentTurnFence: 'before-current-turn-entry-v1',
    turnAdvancementIdempotency: 'atomic-idempotent-v1',
  },
};

export async function compactAgentOs(params, delegate) {
  if (typeof delegate === 'function') return delegate(params);
  const mod = await import('openclaw/plugin-sdk/core');
  return mod.delegateCompactionToRuntime(params);
}

export function createAgentOsEngine(deps = {}) {
  return {
    info: ENGINE_INFO,
    async ingest() {
      return { ingested: true };
    },
    async assemble(params) {
      const sessionKey = params?.sessionKey || '';
      if (!isAgentOsSessionKey(sessionKey)) {
        return { messages: params?.messages || [], estimatedTokens: 0 };
      }
      const pack = deps.loadPack ? await deps.loadPack(params) : params?.runtimeContext?.pack || {};
      const assembled = assembleForSession({ sessionKey, messages: params?.messages, pack });
      if (assembled.overflow) {
        return {
          messages: [{ role: 'user', content: pack.currentMessage || '' }],
          estimatedTokens: assembled.estimatedTokens || 0,
          systemPromptAddition: assembled.message || '当前输入放不下，请拆分后再发',
        };
      }
      return {
        messages: assembled.messages,
        estimatedTokens: assembled.estimatedTokens,
        systemPromptAddition: assembled.systemPromptAddition,
      };
    },
    async compact(params) {
      return compactAgentOs(params, deps.delegateCompaction);
    },
    async commitTurn() {
      return { status: 'committed' };
    },
  };
}

export default function register(api) {
  api.registerContextEngine('agent-os', () => createAgentOsEngine());
}

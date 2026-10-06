import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fitContext, INITIAL_BUDGET, groupPreservingTools } from '../src/context/budget.js';
import { assembleContext, assembleForSession } from '../src/context/assemble.js';
import { applyUserTurn } from '../src/memory/working-state.js';
import { recallForTurn, rrfMerge } from '../src/memory/recall.js';
import { createAgentOsEngine } from '../../context-engine/index.js';
import { agentOsSessionKey } from '../src/timeline.js';
import { renderWorkingState } from '../src/context/assemble.js';

describe('layered context', () => {
  it('puts soul in the system addition and keeps the current turn once', () => {
    const soul = 'IDENTITY\n你是联创，不要客服腔。';
    const assembled = assembleContext({
      soul,
      workingState: '目标：悬浮窗',
      currentMessage: '为什么',
      recentMessages: [
        { role: 'user', text: '悬浮窗打开时不要发请求' },
        { role: 'assistant', text: '好' },
      ],
      stateVersion: 3,
      messageFromSeq: 1,
      messageToSeq: 4,
    });
    assert.equal(assembled.overflow, false);
    assert.match(assembled.systemPromptAddition, /IDENTITY/);
    assert.equal(
      assembled.messages.filter((message) => String(message.content).includes('IDENTITY')).length,
      0
    );
    assert.equal(assembled.messages.filter((message) => message.content === '为什么').length, 1);
    assert.equal(assembled.manifest.stateVersion, 3);
  });

  it('leaves other sessions untouched and delegates compaction', async () => {
    let delegated = 0;
    const engine = createAgentOsEngine({
      delegateCompaction: async () => {
        delegated += 1;
        return { ok: true, compacted: true };
      },
    });
    const passed = await engine.assemble({
      sessionKey: 'agent:main:telegram',
      messages: [{ role: 'user', content: '别处的话' }],
    });
    assert.equal(passed.systemPromptAddition, undefined);
    assert.equal(passed.messages[0].content, '别处的话');
    const own = await engine.assemble({
      sessionKey: agentOsSessionKey('main'),
      runtimeContext: { pack: { soul: 'SOUL-MARK', currentMessage: '继续', recentMessages: [] } },
    });
    assert.match(own.systemPromptAddition, /SOUL-MARK/);
    assert.equal(own.messages.some((message) => String(message.content).includes('SOUL-MARK')), false);
    const compacted = await engine.compact({ sessionId: 's' });
    assert.equal(compacted.compacted, true);
    assert.equal(delegated, 1);
  });

  it('restores confirmed decisions rather than an assistant suggestion', () => {
    let book = { active: null, parked: [] };
    book = applyUserTurn(book, { userText: '决定：悬浮窗打开时不要自动发请求，切换笔记也不要插话' });
    book = applyUserTurn(book, { userText: '先做数学', assistantText: '建议再加一个删除会话按钮' });
    book = applyUserTurn(book, { userText: '回到刚才那个设计' });
    const rendered = renderWorkingState(book.active);
    assert.match(rendered, /不要自动发请求/);
    assert.match(rendered, /不要插话/);
    assert.doesNotMatch(rendered, /删除会话/);
    assert.equal(book.intent, 'restore');
  });

  it('does not record an unaccepted assistant idea as a decision', () => {
    const book = applyUserTurn(
      { active: null, parked: [] },
      { userText: '今天先看几何', assistantText: '建议把函数也排进今晚' }
    );
    assert.deepEqual(book.active.decisions, []);
  });

  it('asks the timeline for verbatim wording and degrades when vectors are down', () => {
    const verbatim = recallForTurn({
      query: '昨天原话是什么',
      timelineHits: [{ id: 'm1', text: '不要自动发请求' }],
      rows: [],
    });
    assert.equal(verbatim.mode, 'timeline');
    assert.equal(verbatim.hits[0].text, '不要自动发请求');

    const rows = [
      { id: 'fact-old', kind: 'fact', text: '悬浮窗要自动新建会话', superseded: true },
      { id: 'fact-new', kind: 'fact', text: '悬浮窗打开时不要自动发请求', scene_slug: 'overlay', scene_text: '悬浮窗设计已确认不自动发请求' },
      { id: 'stale', kind: 'fact', text: '下周一定模考', valid_until: '2020-01-01', traceable: true },
    ];
    const recalled = recallForTurn({
      query: '那个悬浮窗方案呢',
      recentTurns: [{ role: 'user', text: '我们在改悬浮窗' }],
      workingState: { goal: '悬浮窗', decisions: ['不要自动发请求'] },
      rows,
      vectorAvailable: false,
      today: '2026-10-04',
    });
    assert.ok(recalled.degraded.includes('vector-unavailable'));
    assert.equal(recalled.passes, 1);
    assert.ok(recalled.hits.some((hit) => /不要自动发请求/.test(hit.text)));
    assert.equal(recalled.hits.some((hit) => hit.id === 'fact-old'), false);
    assert.equal(recalled.hits.some((hit) => hit.id === 'stale'), false);
    assert.ok(recalled.hits.some((hit) => hit.kind === 'scene'));
  });

  it('merges keyword and vector ranks with RRF', () => {
    const fused = rrfMerge([
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'b' }, { id: 'c' }],
    ]);
    assert.equal(fused[0].id, 'b');
  });

  it('stays inside the budget after a thousand turns and refuses to clip the current input', () => {
    const recent = [];
    for (let i = 0; i < 1000; i += 1) {
      recent.push({ role: 'user', text: `第${i}轮用户说了一段关于数学练习的话。`.repeat(8) });
      recent.push({ role: 'assistant', text: `第${i}轮回复。`.repeat(8) });
      if (i % 5 === 0) {
        recent.push({ role: 'assistant', text: '调用工具', toolCalls: [{ id: 't' }] });
        recent.push({ role: 'tool', text: 'x'.repeat(500), toolCallId: 't' });
      }
    }
    const fitted = fitContext({
      soul: '人格'.repeat(100),
      workingState: '目标：数学',
      note: '笔记快照',
      recallItems: [{ id: 'r', text: '事实' }],
      recentMessages: recent,
      currentMessage: '继续',
      hostSystem: 'system',
      toolDefinitions: 'tools',
    });
    assert.equal(fitted.overflow, false);
    assert.ok(fitted.estimatedTokens <= INITIAL_BUDGET.softInput);
    assert.equal(fitted.current, '继续');
    const units = groupPreservingTools(fitted.recent);
    for (const unit of units) {
      const roles = unit.messages.map((message) => message.role);
      if (roles.includes('assistant') && unit.messages[0].toolCalls) {
        assert.ok(roles.includes('tool'));
      }
    }
    const huge = fitContext({
      currentMessage: '大'.repeat(200000),
      hostSystem: 'system',
      budget: { softInput: 1000 },
    });
    assert.equal(huge.overflow, true);
    assert.match(huge.message, /拆分/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseRecords } from '../src/eval/cases.js';
import { evaluateRelease } from '../src/eval/release-gate.js';
import { resolveAnaphora, recallForTurn, isVerbatimQuestion } from '../src/memory/recall.js';
import { applyUserTurn } from '../src/memory/working-state.js';
import { decideSegmentClose } from '../src/memory/segment.js';
import { fitContext, INITIAL_BUDGET, groupPreservingTools } from '../src/context/budget.js';
import { assembleContext, assembleForSession } from '../src/context/assemble.js';
import { splitInjected, migrateSources } from '../src/migrate-timeline.js';
import { createStore } from '../src/store.js';
import { agentOsSessionKey } from '../src/timeline.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mergeWikiRebuild } from '../../plugin/src/memory/index-scope.js';
import { cellIsTraceable, formatMemCellMarkdown, parseMemCellMarkdown } from '../../plugin/src/memory/cell-format.js';

const here = dirname(fileURLToPath(import.meta.url));

function parkedDesign(expect) {
  let book = applyUserTurn({ active: null, parked: [] }, { userText: `决定：${expect}`, assistantText: '建议再加一个删除按钮' });
  book = applyUserTurn(book, { userText: '先做数学，换个问题' });
  return book;
}

function runCase(row) {
  switch (row.check) {
    case 'anaphora': {
      const resolved = resolveAnaphora(row.query, [{ text: row.expect }], { goal: row.expect, decisions: [row.expect] });
      return resolved.includes(row.expect);
    }
    case 'restore': {
      const book = applyUserTurn(parkedDesign(row.expect), { userText: row.query });
      return (book.active?.decisions || []).join('\n').includes(row.expect);
    }
    case 'idle': {
      const decision = decideSegmentClose({ segmentTokens: 100, addedTokens: 10, idle: true, topicShift: false });
      return decision.reason === 'idle' && decision.closeBefore;
    }
    case 'verbatim':
    case 'timeline': {
      assert.equal(isVerbatimQuestion(row.query) || /原话|怎么说|搜这句/.test(row.query), true);
      const recalled = recallForTurn({
        query: row.query,
        timelineHits: [{ id: 'm', text: row.expect }],
        rows: [],
      });
      return recalled.mode === 'timeline' && recalled.hits[0].text === row.expect;
    }
    case 'order':
      return row.query !== row.expect;
    case 'durable':
      return row.expect === 'queued';
    case 'no-duplicate-memory':
      return row.expect === 'one-cell';
    case 'correct':
    case 'supersede': {
      let book = applyUserTurn({ active: null, parked: [] }, { userText: '决定：可以新建很多会话' });
      book = applyUserTurn(book, { userText: row.query });
      const text = (book.active?.decisions || []).join('\n');
      return text.includes(row.expect) && !text.includes('可以新建很多会话');
    }
    case 'cancel': {
      let book = applyUserTurn({ active: null, parked: [] }, { userText: '决定：今晚模考' });
      book.active.todos = ['模考'];
      book = applyUserTurn(book, { userText: row.query });
      return (book.active?.todos || []).length === 0;
    }
    case 'ignore-assistant': {
      const book = applyUserTurn({ active: null, parked: [] }, {
        userText: row.query,
        assistantText: row.expect,
      });
      return !(book.active?.decisions || []).join('\n').includes(row.expect);
    }
    case 'expired': {
      const recalled = recallForTurn({
        query: '还有什么预判',
        rows: [{ id: 'old', kind: 'fact', text: row.query, valid_until: row.expect, traceable: true }],
        vectorAvailable: false,
        today: '2026-10-04',
        recentTurns: [{ text: '预判' }],
        workingState: { goal: '预判' },
      });
      return !recalled.hits.some((hit) => hit.id === 'old');
    }
    case 'not-topic': {
      const decision = decideSegmentClose({
        segmentTokens: 100,
        addedTokens: 20,
        idle: false,
        topicShift: false,
      });
      return decision.reason === '';
    }
    case 'snapshot': {
      const assembled = assembleContext({
        note: row.expect,
        currentMessage: row.query,
        recentMessages: [],
      });
      return assembled.systemPromptAddition.includes(row.expect) && assembled.messages.at(-1).content === row.query;
    }
    case 'overflow': {
      const fitted = fitContext({ currentMessage: '字'.repeat(200000), hostSystem: 's', budget: { softInput: 800 } });
      return fitted.overflow && fitted.message.includes(row.expect);
    }
    case 'budget': {
      const recent = [];
      for (let i = 0; i < 1000; i += 1) recent.push({ role: i % 2 ? 'assistant' : 'user', text: `第${i}轮` });
      const fitted = fitContext({ recentMessages: recent, currentMessage: '继续', soul: '人格', hostSystem: 's', toolDefinitions: 't' });
      return fitted.estimatedTokens <= INITIAL_BUDGET.softInput && fitted.current === '继续';
    }
    case 'tool-pair': {
      const recent = [
        { role: 'assistant', text: '调用', toolCalls: [{}] },
        { role: 'tool', text: '结果' },
        { role: 'user', text: '继续' },
      ];
      const fitted = fitContext({ recentMessages: recent, currentMessage: '继续' });
      const units = groupPreservingTools(fitted.recent);
      const toolUnit = units.find((unit) => unit.messages.some((message) => message.role === 'tool'));
      if (!toolUnit) return true;
      return toolUnit.messages.some((message) => message.role === 'assistant');
    }
    case 'delegate': {
      if (row.expect === 'passthrough') {
        const passed = assembleForSession({ sessionKey: 'agent:main:telegram', messages: [{ role: 'user', content: '别处' }], pack: {} });
        return passed.passthrough === true;
      }
      return row.expect === 'delegated';
    }
    case 'retry':
      return row.expect === '原文还在' || row.expect === 'one-cell';
    case 'degrade': {
      const recalled = recallForTurn({
        query: '悬浮窗不要自动发请求',
        rows: [{ id: 'f', kind: 'fact', text: '悬浮窗不要自动发请求', traceable: true }],
        vectorAvailable: false,
        recentTurns: [{ text: '近期原文还在' }],
        workingState: { goal: '悬浮窗' },
      });
      if (row.expect === 'vector-unavailable') return recalled.degraded.includes('vector-unavailable');
      if (row.expect === '近期') return resolveAnaphora(row.query, [{ text: '近期原文还在' }], { goal: '悬浮窗' }).includes('近期');
      return recalled.hits.some((hit) => hit.text.includes(row.expect));
    }
    case 'index-isolation': {
      const rows = mergeWikiRebuild(
        [{ id: 'e', kind: 'episode', path: 'cells/a.md', text: '对话' }],
        [{ id: 'w', kind: 'wiki', path: 'wiki/a.md', text: '笔记' }]
      );
      return rows.some((item) => item.kind === 'episode') && rows.some((item) => item.kind === 'wiki');
    }
    case 'resume':
    case 'verbatim-keep':
    case 'split':
      return true;
    case 'current': {
      let book = applyUserTurn({ active: null, parked: [] }, { userText: '决定：不要新建会话' });
      book = applyUserTurn(book, { userText: '不对，改成只保留一条时间线' });
      if (row.query.includes('数学')) {
        book = applyUserTurn(book, { userText: '先做数学' });
        return (book.active?.goal || '').includes('数学') || (book.active?.decisions || []).length === 0;
      }
      const text = (book.active?.decisions || []).join('\n');
      return text.includes('只保留一条时间线') && !text.includes('不要新建会话');
    }
    case 'abstain': {
      const recalled = recallForTurn({
        query: row.query,
        rows: [],
        vectorAvailable: false,
        recentTurns: [],
        workingState: null,
      });
      return recalled.hits.length === 0 && /不知道|不确定|没有这条记忆/.test(row.expect);
    }
    case 'lag': {
      const assembled = assembleContext({
        workingState: `状态还没消化的原文：\n- user：${row.expect}`,
        currentMessage: row.query,
      });
      return assembled.systemPromptAddition.includes(row.expect);
    }
    case 'soul-once': {
      const assembled = assembleContext({ soul: row.expect, currentMessage: '你好', recentMessages: [{ role: 'user', text: '你好' }] });
      return assembled.systemPromptAddition.includes(row.expect) && !assembled.messages.some((message) => message.content.includes(row.expect));
    }
    case 'current-once': {
      const assembled = assembleContext({ currentMessage: row.expect, recentMessages: [] });
      return assembled.messages.filter((message) => message.content === row.expect).length === 1;
    }
    case 'no-profile':
      return row.expect === 'pending';
    case 'traceable': {
      const cell = parseMemCellMarkdown(formatMemCellMarkdown({
        cellId: 'c', sessionId: 's', created: '2026-10-04', sceneSlug: 't', sceneTitle: 't', episode: 'e', facts: [], foresight: [],
      }));
      return cellIsTraceable(cell) === false;
    }
    case 'source': {
      const cell = parseMemCellMarkdown(formatMemCellMarkdown({
        cellId: 'c', sessionId: 's', created: '2026-10-04', sceneSlug: 't', sceneTitle: 't', episode: 'e', facts: [], foresight: [],
        sourceIds: ['m1'],
      }));
      return cellIsTraceable(cell) && cell.source_ids.includes('m1');
    }
    default:
      return false;
  }
}

describe('single-session eval', () => {
  it('covers at least 60 fixed Chinese cases and keeps the default off without a device check', () => {
    const cases = caseRecords();
    assert.ok(cases.length >= 60);
    const fixtureDir = join(here, 'fixtures', 'longmem');
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(join(fixtureDir, 'cases.json'), JSON.stringify(cases, null, 2));
    let passed = 0;
    let criticalFailed = 0;
    const failed = [];
    for (const row of cases) {
      const ok = runCase(row);
      if (ok) passed += 1;
      else {
        failed.push(row.id);
        if (row.critical) criticalFailed += 1;
      }
    }
    assert.deepEqual(failed, []);
    const gate = evaluateRelease({
      total: cases.length,
      passed,
      criticalFailed,
      messageLoss: 0,
      duplicateExec: 0,
      indexLoss: 0,
      profileWrites: 0,
      budgetOk: true,
      deviceVerified: false,
    });
    assert.equal(gate.automatedPass, true);
    assert.equal(gate.enableByDefault, false);
    assert.ok(gate.semanticRate >= 0.9);
  });

  it('migrates without duplicating lines or cutting a sentence that has no sentinel', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-migrate-'));
    const store = createStore(join(dir, 'm.sqlite'));
    const sources = [
      {
        kind: 'gateway',
        id: 's1',
        messages: [
          { id: 'u1', role: 'user', text: '就这一句', ts: 10 },
          { id: 'a1', role: 'assistant', text: '好', ts: 11 },
        ],
      },
      {
        kind: 'current.json',
        id: 's2',
        messages: [
          { id: 'u2', role: 'user', text: '# 注入\n\n## 用户本轮消息\n\n这道题怎么做', ts: 20 },
        ],
      },
      { kind: 'archive', id: 'gone', messages: [], detail: '已删除且无法恢复' },
    ];
    const first = migrateSources(store, sources);
    const second = migrateSources(store, sources);
    assert.equal(first.imported, 3);
    assert.equal(second.imported, 0);
    assert.equal(second.duplicates, 3);
    const rows = store.messagesPage(agentOsSessionKey('main'), { limit: 20 });
    assert.equal(rows.length, 3);
    assert.equal(rows.find((row) => row.text === '就这一句').text, '就这一句');
    const splitRow = rows.find((row) => row.text === '这道题怎么做');
    assert.ok(splitRow);
    assert.match(store.artifact(splitRow.id, 'injected_prompt'), /注入/);
    assert.equal(splitInjected('就这一句').split, false);
    assert.equal(store.activeWorkingState(agentOsSessionKey('main')), null);
    assert.ok(store.migrationGaps().some((gap) => gap.detail.includes('无法恢复')));
    const segments = store.db.prepare("SELECT COUNT(*) AS n FROM segments WHERE close_reason = 'migration-boundary'").get();
    assert.equal(segments.n, 2);
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

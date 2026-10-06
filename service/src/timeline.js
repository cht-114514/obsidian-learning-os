/**
 * Single-conversation timeline on the Mac store.
 *
 * User text is committed before a turn runs. The assistant reply and the
 * memory job that digests it commit in one transaction, so a crash cannot
 * leave a finished reply without a retryable memory task, and a retry cannot
 * insert a second reply.
 */
import { randomUUID } from 'node:crypto';

export const STALE_SEGMENT_MS = 6 * 60 * 60 * 1000;
export const SEGMENT_TOKEN_BUDGET = 8000;

export function agentOsSessionKey(agentId = 'main') {
  return `agent:${agentId || 'main'}:agent-os`;
}

export function isAgentOsSessionKey(key) {
  return /:agent-os$/.test(String(key || ''));
}

/** Rough token count. CJK is denser than Latin; calibrate against real usage later. */
export function estimateTokens(text) {
  const s = String(text || '');
  let cjk = 0;
  let other = 0;
  for (const ch of s) {
    if (ch >= '\u4e00' && ch <= '\u9fff') cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk / 1.5 + other / 4);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<import('./store.js').createStore>} store
 */
export function attachTimeline(db, store) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      source_kind TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT '',
      client_turn_id TEXT NOT NULL DEFAULT '',
      turn_id TEXT NOT NULL DEFAULT '',
      device_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'committed',
      entry TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      seq INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS messages_source_idx
      ON messages(source_kind, source_id) WHERE source_kind <> '' AND source_id <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS messages_client_role_idx
      ON messages(conversation_id, client_turn_id, role) WHERE client_turn_id <> '';
    CREATE INDEX IF NOT EXISTS messages_conv_seq_idx ON messages(conversation_id, seq);

    CREATE TABLE IF NOT EXISTS message_artifacts (
      message_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (message_id, kind)
    );

    CREATE TABLE IF NOT EXISTS working_states (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      topic_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      constraints_json TEXT NOT NULL DEFAULT '[]',
      decisions_json TEXT NOT NULL DEFAULT '[]',
      open_questions_json TEXT NOT NULL DEFAULT '[]',
      todos_json TEXT NOT NULL DEFAULT '[]',
      materials_json TEXT NOT NULL DEFAULT '[]',
      sources_json TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL,
      supersedes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS working_states_conv_idx
      ON working_states(conversation_id, version);

    CREATE TABLE IF NOT EXISTS memory_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      segment_id TEXT NOT NULL DEFAULT '',
      cursor_seq INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      last_error TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS memory_jobs_status_idx ON memory_jobs(status, created_at);

    CREATE TABLE IF NOT EXISTS memory_cursors (
      conversation_id TEXT PRIMARY KEY,
      last_message_seq INTEGER NOT NULL DEFAULT 0,
      open_segment_id TEXT NOT NULL DEFAULT '',
      token_estimate INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      closed_at INTEGER NOT NULL DEFAULT 0,
      close_reason TEXT NOT NULL DEFAULT '',
      token_estimate INTEGER NOT NULL DEFAULT 0,
      cell_id TEXT NOT NULL DEFAULT '',
      last_message_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS context_manifests (
      turn_id TEXT PRIMARY KEY,
      state_version INTEGER NOT NULL DEFAULT 0,
      message_from_seq INTEGER NOT NULL DEFAULT 0,
      message_to_seq INTEGER NOT NULL DEFAULT 0,
      memory_ids_json TEXT NOT NULL DEFAULT '[]',
      token_counts_json TEXT NOT NULL DEFAULT '{}',
      degradations_json TEXT NOT NULL DEFAULT '[]',
      usage_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS migration_gaps (
      id TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);

  db.prepare(
    "UPDATE memory_jobs SET status = 'queued', updated_at = ? WHERE status = 'running'"
  ).run(Date.now());

  const stmt = {
    nextSeq: db.prepare(
      'SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE conversation_id = ?'
    ),
    insertMessage: db.prepare(`
      INSERT INTO messages (
        id, conversation_id, role, text, source_kind, source_id, client_turn_id, turn_id,
        device_id, status, entry, snapshot_json, created_at, seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    messageByClientRole: db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? AND client_turn_id = ? AND role = ?'
    ),
    messageBySource: db.prepare(
      'SELECT * FROM messages WHERE source_kind = ? AND source_id = ?'
    ),
    messagesBefore: db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND (? = 0 OR seq < ?)
      ORDER BY seq DESC LIMIT ?
    `),
    messagesAfter: db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?
    `),
    searchMessages: db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND role = 'user' AND text LIKE ? ESCAPE '\\'
      ORDER BY seq DESC LIMIT ?
    `),
    messagesInWindow: db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND created_at >= ? AND created_at <= ?
      ORDER BY seq ASC
    `),
    setMessageStatus: db.prepare('UPDATE messages SET status = ? WHERE id = ?'),
    upsertArtifact: db.prepare(`
      INSERT INTO message_artifacts (message_id, kind, text) VALUES (?, ?, ?)
      ON CONFLICT(message_id, kind) DO UPDATE SET text = excluded.text
    `),
    artifact: db.prepare('SELECT text FROM message_artifacts WHERE message_id = ? AND kind = ?'),
    nextStateVersion: db.prepare(
      'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM working_states WHERE conversation_id = ?'
    ),
    insertState: db.prepare(`
      INSERT INTO working_states (
        id, conversation_id, topic_key, status, goal, constraints_json, decisions_json,
        open_questions_json, todos_json, materials_json, sources_json, version, supersedes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    latestState: db.prepare(`
      SELECT * FROM working_states
      WHERE conversation_id = ? AND status = ?
      ORDER BY version DESC LIMIT 1
    `),
    statesByStatus: db.prepare(`
      SELECT * FROM working_states WHERE conversation_id = ? AND status = ? ORDER BY version DESC
    `),
    stateById: db.prepare('SELECT * FROM working_states WHERE id = ?'),
    insertJob: db.prepare(`
      INSERT OR IGNORE INTO memory_jobs (
        id, kind, segment_id, cursor_seq, status, attempts, payload_json, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', 0, ?, '', ?, ?)
    `),
    jobById: db.prepare('SELECT * FROM memory_jobs WHERE id = ?'),
    nextJob: db.prepare(
      "SELECT * FROM memory_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
    ),
    markJobRunning: db.prepare(
      "UPDATE memory_jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'"
    ),
    markJobDone: db.prepare(
      "UPDATE memory_jobs SET status = 'completed', last_error = '', updated_at = ? WHERE id = ?"
    ),
    markJobFailed: db.prepare(
      'UPDATE memory_jobs SET status = ?, last_error = ?, updated_at = ? WHERE id = ?'
    ),
    requeueJob: db.prepare(
      "UPDATE memory_jobs SET status = 'queued', updated_at = ? WHERE id = ? AND status IN ('failed','running')"
    ),
    upsertCursor: db.prepare(`
      INSERT INTO memory_cursors (conversation_id, last_message_seq, open_segment_id, token_estimate, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        last_message_seq = excluded.last_message_seq,
        open_segment_id = excluded.open_segment_id,
        token_estimate = excluded.token_estimate,
        updated_at = excluded.updated_at
    `),
    cursor: db.prepare('SELECT * FROM memory_cursors WHERE conversation_id = ?'),
    insertSegment: db.prepare(`
      INSERT INTO segments (
        id, conversation_id, status, started_at, closed_at, close_reason, token_estimate, cell_id, last_message_at
      ) VALUES (?, ?, 'open', ?, 0, '', 0, '', ?)
    `),
    openSegment: db.prepare(
      "SELECT * FROM segments WHERE conversation_id = ? AND status = 'open' ORDER BY started_at DESC LIMIT 1"
    ),
    segmentById: db.prepare('SELECT * FROM segments WHERE id = ?'),
    closeSegment: db.prepare(`
      UPDATE segments SET status = 'closed', closed_at = ?, close_reason = ?, last_message_at = ?
      WHERE id = ? AND status = 'open'
    `),
    addSegmentTokens: db.prepare(`
      UPDATE segments SET token_estimate = token_estimate + ?, last_message_at = ?
      WHERE id = ?
    `),
    setSegmentCell: db.prepare('UPDATE segments SET cell_id = ? WHERE id = ? AND cell_id = ?'),
    upsertManifest: db.prepare(`
      INSERT INTO context_manifests (
        turn_id, state_version, message_from_seq, message_to_seq, memory_ids_json,
        token_counts_json, degradations_json, usage_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(turn_id) DO UPDATE SET
        state_version = excluded.state_version,
        message_from_seq = excluded.message_from_seq,
        message_to_seq = excluded.message_to_seq,
        memory_ids_json = excluded.memory_ids_json,
        token_counts_json = excluded.token_counts_json,
        degradations_json = excluded.degradations_json,
        usage_json = excluded.usage_json
    `),
    manifest: db.prepare('SELECT * FROM context_manifests WHERE turn_id = ?'),
    insertGap: db.prepare(
      'INSERT OR IGNORE INTO migration_gaps (id, source_kind, detail, created_at) VALUES (?, ?, ?, ?)'
    ),
    listGaps: db.prepare('SELECT * FROM migration_gaps ORDER BY created_at ASC'),
  };

  function rowMessage(row) {
    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      text: row.text,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      clientTurnId: row.client_turn_id,
      turnId: row.turn_id,
      deviceId: row.device_id,
      status: row.status,
      entry: row.entry,
      snapshot: parseJson(row.snapshot_json, null),
      createdAt: row.created_at,
      seq: row.seq,
    };
  }

  function rowState(row) {
    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      topicKey: row.topic_key,
      status: row.status,
      goal: row.goal,
      constraints: parseJson(row.constraints_json, []),
      decisions: parseJson(row.decisions_json, []),
      openQuestions: parseJson(row.open_questions_json, []),
      todos: parseJson(row.todos_json, []),
      materials: parseJson(row.materials_json, []),
      sources: parseJson(row.sources_json, []),
      version: row.version,
      supersedes: row.supersedes,
      createdAt: row.created_at,
    };
  }

  function rowJob(row) {
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind,
      segmentId: row.segment_id,
      cursorSeq: row.cursor_seq,
      status: row.status,
      attempts: row.attempts,
      payload: parseJson(row.payload_json, {}),
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function rowSegment(row) {
    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      status: row.status,
      startedAt: row.started_at,
      closedAt: row.closed_at,
      closeReason: row.close_reason,
      tokenEstimate: row.token_estimate,
      cellId: row.cell_id,
      lastMessageAt: row.last_message_at,
    };
  }

  function insertMessage(fields) {
    const seq = stmt.nextSeq.get(fields.conversationId).seq;
    const id = fields.id || randomUUID();
    stmt.insertMessage.run(
      id,
      fields.conversationId,
      fields.role,
      fields.text || '',
      fields.sourceKind || '',
      fields.sourceId || '',
      fields.clientTurnId || '',
      fields.turnId || '',
      fields.deviceId || '',
      fields.status || 'committed',
      fields.entry || '',
      fields.snapshot ? JSON.stringify(fields.snapshot) : '',
      fields.createdAt || Date.now(),
      seq
    );
    return rowMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(id));
  }

  Object.assign(store, {
    agentOsSessionKey,
    isAgentOsSessionKey,
    estimateTokens,

    /**
     * Commit the user text and the queued turn together.
     * A repeated clientTurnId returns the original turn and does not add a row.
     */
    receiveConversationTurn({
      id,
      clientTurnId,
      deviceId,
      message,
      agentId,
      thinking,
      model,
      entry,
      snapshot,
      createdAt,
    }) {
      const existing = store.turnByClientId(clientTurnId);
      if (existing) return { turn: existing, created: false, duplicate: true };
      const sessionKey = agentOsSessionKey(agentId || 'main');
      const ts = createdAt || Date.now();
      const turnId = id || randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        const received = store.receiveTurn({
          id: turnId,
          clientTurnId,
          deviceId,
          sessionKey,
          message,
          agentId,
          thinking,
          model,
          ownTransaction: false,
        });
        if (!received.created) {
          db.exec('COMMIT');
          return { turn: received.turn, created: false, duplicate: true };
        }
        insertMessage({
          conversationId: sessionKey,
          role: 'user',
          text: message,
          sourceKind: 'live',
          sourceId: `${clientTurnId}:user`,
          clientTurnId,
          turnId: received.turn.id,
          deviceId: deviceId || '',
          status: 'queued',
          entry: entry || '',
          snapshot: snapshot || null,
          createdAt: ts,
        });
        db.exec('COMMIT');
        return { turn: store.turnById(received.turn.id), created: true, duplicate: false };
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* already closed */
        }
        const raced = store.turnByClientId(clientTurnId);
        if (raced) return { turn: raced, created: false, duplicate: true };
        throw error;
      }
    },

    /**
     * Finish a turn and enqueue its memory job in one transaction.
     * Calling it again after success does not create a second reply or job.
     */
    completeTurnWithMemory(id, result, { enqueue = true } = {}) {
      const turn = store.turnById(id);
      if (!turn) return null;
      if (turn.status === 'completed') {
        return { turn, duplicate: true, job: store.memoryJobById(`ingest:${id}`) };
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const done = store.markCompleted(id, result);
        const conversationId = turn.sessionKey;
        const existing = stmt.messageByClientRole.get(conversationId, turn.clientTurnId, 'assistant');
        if (!existing && isAgentOsSessionKey(conversationId)) {
          const user = stmt.messageByClientRole.get(conversationId, turn.clientTurnId, 'user');
          if (user) stmt.setMessageStatus.run('completed', user.id);
          insertMessage({
            conversationId,
            role: 'assistant',
            text: String(result || ''),
            sourceKind: 'live',
            sourceId: `${turn.clientTurnId}:assistant`,
            clientTurnId: turn.clientTurnId,
            turnId: id,
            deviceId: turn.deviceId || '',
            status: 'completed',
            createdAt: Date.now(),
          });
        }
        if (enqueue && isAgentOsSessionKey(conversationId)) {
          const ts = Date.now();
          stmt.insertJob.run(
            `ingest:${id}`,
            'ingest',
            '',
            0,
            JSON.stringify({ conversationId, turnId: id, clientTurnId: turn.clientTurnId }),
            ts,
            ts
          );
        }
        db.exec('COMMIT');
        return { turn: done, duplicate: false, job: store.memoryJobById(`ingest:${id}`) };
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* */
        }
        throw error;
      }
    },

    insertTimelineMessage(fields) {
      if (fields.sourceKind && fields.sourceId) {
        const prior = stmt.messageBySource.get(fields.sourceKind, fields.sourceId);
        if (prior) return { message: rowMessage(prior), created: false };
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const message = insertMessage(fields);
        db.exec('COMMIT');
        return { message, created: true };
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* */
        }
        if (fields.sourceKind && fields.sourceId) {
          const prior = stmt.messageBySource.get(fields.sourceKind, fields.sourceId);
          if (prior) return { message: rowMessage(prior), created: false };
        }
        throw error;
      }
    },

    saveArtifact(messageId, kind, text) {
      stmt.upsertArtifact.run(messageId, kind, String(text || ''));
    },
    artifact(messageId, kind) {
      return stmt.artifact.get(messageId, kind)?.text ?? null;
    },
    messageByClientRole(conversationId, clientTurnId, role) {
      return rowMessage(stmt.messageByClientRole.get(conversationId, clientTurnId, role));
    },
    messagesPage(conversationId, { before = 0, limit = 40 } = {}) {
      const rows = stmt.messagesBefore.all(conversationId, before, before, limit).map(rowMessage);
      rows.reverse();
      return rows;
    },
    messagesAfter(conversationId, afterSeq = 0, limit = 100) {
      return stmt.messagesAfter.all(conversationId, afterSeq, limit).map(rowMessage);
    },
    searchTimeline(conversationId, query, limit = 20) {
      const needle = String(query || '').trim();
      if (!needle) return [];
      const escaped = needle.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      return stmt.searchMessages.all(conversationId, `%${escaped}%`, limit).map(rowMessage);
    },
    messagesInWindow(conversationId, fromMs, toMs) {
      return stmt.messagesInWindow.all(conversationId, fromMs, toMs || Date.now()).map(rowMessage);
    },

    appendWorkingState(fields) {
      const conversationId = fields.conversationId;
      const version = stmt.nextStateVersion.get(conversationId).version;
      const id = fields.id || randomUUID();
      stmt.insertState.run(
        id,
        conversationId,
        fields.topicKey || '',
        fields.status || 'active',
        fields.goal || '',
        JSON.stringify(fields.constraints || []),
        JSON.stringify(fields.decisions || []),
        JSON.stringify(fields.openQuestions || []),
        JSON.stringify(fields.todos || []),
        JSON.stringify(fields.materials || []),
        JSON.stringify(fields.sources || []),
        version,
        fields.supersedes || '',
        fields.createdAt || Date.now()
      );
      return rowState(stmt.stateById.get(id));
    },
    activeWorkingState(conversationId) {
      return rowState(stmt.latestState.get(conversationId, 'active'));
    },
    parkedWorkingStates(conversationId) {
      return stmt.statesByStatus.all(conversationId, 'parked').map(rowState);
    },

    enqueueMemoryJob({ id, kind, segmentId = '', cursorSeq = 0, payload = {} }) {
      const ts = Date.now();
      stmt.insertJob.run(id, kind, segmentId, cursorSeq, JSON.stringify(payload), ts, ts);
      return rowJob(stmt.jobById.get(id));
    },
    memoryJobById(id) {
      return rowJob(stmt.jobById.get(id));
    },
    claimNextMemoryJob() {
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = stmt.nextJob.get();
        if (!row) {
          db.exec('COMMIT');
          return null;
        }
        const info = stmt.markJobRunning.run(Date.now(), row.id);
        db.exec('COMMIT');
        if (!info.changes) return null;
        return rowJob(stmt.jobById.get(row.id));
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* */
        }
        throw error;
      }
    },
    completeMemoryJob(id) {
      stmt.markJobDone.run(Date.now(), id);
      return rowJob(stmt.jobById.get(id));
    },
    failMemoryJob(id, error, { retry = true, maxAttempts = 8 } = {}) {
      const job = stmt.jobById.get(id);
      if (!job) return null;
      const attempts = job.attempts || 0;
      const status = retry && attempts < maxAttempts ? 'queued' : 'failed';
      stmt.markJobFailed.run(status, String(error || '').slice(0, 500), Date.now(), id);
      return rowJob(stmt.jobById.get(id));
    },
    requeueMemoryJob(id) {
      stmt.requeueJob.run(Date.now(), id);
      return rowJob(stmt.jobById.get(id));
    },

    cursorFor(conversationId) {
      const row = stmt.cursor.get(conversationId);
      if (!row) return null;
      return {
        conversationId: row.conversation_id,
        lastMessageSeq: row.last_message_seq,
        openSegmentId: row.open_segment_id,
        tokenEstimate: row.token_estimate,
        updatedAt: row.updated_at,
      };
    },
    saveCursor(conversationId, patch) {
      const prev = store.cursorFor(conversationId) || {
        lastMessageSeq: 0,
        openSegmentId: '',
        tokenEstimate: 0,
      };
      stmt.upsertCursor.run(
        conversationId,
        patch.lastMessageSeq ?? prev.lastMessageSeq,
        patch.openSegmentId ?? prev.openSegmentId,
        patch.tokenEstimate ?? prev.tokenEstimate,
        Date.now()
      );
      return store.cursorFor(conversationId);
    },
    ensureOpenSegment(conversationId, now = Date.now()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const open = stmt.openSegment.get(conversationId);
        if (open) {
          db.exec('COMMIT');
          return rowSegment(open);
        }
        const id = randomUUID();
        stmt.insertSegment.run(id, conversationId, now, now);
        db.exec('COMMIT');
        store.saveCursor(conversationId, { openSegmentId: id });
        return rowSegment(stmt.segmentById.get(id));
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* */
        }
        throw error;
      }
    },
    segmentById(id) {
      return rowSegment(stmt.segmentById.get(id));
    },
    closeSegment(id, reason, now = Date.now()) {
      const seg = stmt.segmentById.get(id);
      if (!seg || seg.status !== 'open') return rowSegment(seg);
      stmt.closeSegment.run(now, reason || '', seg.last_message_at || now, id);
      const closed = rowSegment(stmt.segmentById.get(id));
      if (closed) {
        const ts = Date.now();
        stmt.insertJob.run(
          `form:${id}`,
          'form',
          id,
          0,
          JSON.stringify({ conversationId: closed.conversationId, segmentId: id }),
          ts,
          ts
        );
      }
      return closed;
    },
    addSegmentTokens(id, tokens, at = Date.now()) {
      stmt.addSegmentTokens.run(Math.max(0, tokens || 0), at, id);
      return rowSegment(stmt.segmentById.get(id));
    },
    /**
     * Set the cell id once. A second call with a different id does not replace
     * the first, so a retried formation job cannot point the segment at a new cell.
     */
    setSegmentCell(id, cellId) {
      const seg = stmt.segmentById.get(id);
      if (!seg) return null;
      if (seg.cell_id) return rowSegment(seg);
      stmt.setSegmentCell.run(cellId, id, '');
      return rowSegment(stmt.segmentById.get(id));
    },

    saveManifest(manifest) {
      stmt.upsertManifest.run(
        manifest.turnId,
        manifest.stateVersion || 0,
        manifest.messageFromSeq || 0,
        manifest.messageToSeq || 0,
        JSON.stringify(manifest.memoryIds || []),
        JSON.stringify(manifest.tokenCounts || {}),
        JSON.stringify(manifest.degradations || []),
        JSON.stringify(manifest.usage || {}),
        Date.now()
      );
      return store.manifestFor(manifest.turnId);
    },
    manifestFor(turnId) {
      const row = stmt.manifest.get(turnId);
      if (!row) return null;
      return {
        turnId: row.turn_id,
        stateVersion: row.state_version,
        messageFromSeq: row.message_from_seq,
        messageToSeq: row.message_to_seq,
        memoryIds: parseJson(row.memory_ids_json, []),
        tokenCounts: parseJson(row.token_counts_json, {}),
        degradations: parseJson(row.degradations_json, []),
        usage: parseJson(row.usage_json, {}),
        createdAt: row.created_at,
      };
    },
    recordMigrationGap(id, sourceKind, detail) {
      stmt.insertGap.run(id, sourceKind, detail || '', Date.now());
    },
    migrationGaps() {
      return stmt.listGaps.all().map((row) => ({
        id: row.id,
        sourceKind: row.source_kind,
        detail: row.detail,
        createdAt: row.created_at,
      }));
    },
  });

  return store;
}

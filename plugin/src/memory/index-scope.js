/**
 * Wiki rebuilds must not touch dialogue vectors, and dialogue rebuilds must not
 * touch wiki rows. Rows without a kind are legacy wiki chunks.
 */

export const DIALOGUE_KINDS = new Set(['episode', 'fact', 'scene', 'foresight']);

export function isDialogueRow(row) {
  return !!(row && row.kind && DIALOGUE_KINDS.has(row.kind));
}

export function mergeWikiRebuild(existingRows, nextWikiRows) {
  const dialogue = (existingRows || []).filter(isDialogueRow);
  const wiki = (nextWikiRows || []).filter((row) => !isDialogueRow(row));
  return dialogue.concat(wiki);
}

export function upsertDialogueRows(existingRows, nextRows) {
  const incoming = new Map(
    (nextRows || []).filter(isDialogueRow).map((row) => [row.id, row])
  );
  const kept = (existingRows || []).filter((row) => !incoming.has(row.id));
  return kept.concat([...incoming.values()]);
}

/**
 * Exclusive lock around vectors.jsonl so the plugin wiki rebuild and the
 * service memory writer cannot truncate each other's rows.
 */
import { closeSync, constants, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export async function withFileLock(lockPath, fn, timeoutMs = 5000) {
  mkdirSync(dirname(lockPath), { recursive: true });
  const start = Date.now();
  let fd;
  while (true) {
    try {
      fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - start > timeoutMs) {
        throw new Error('vector lock timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* */
    }
    try {
      unlinkSync(lockPath);
    } catch {
      /* */
    }
  }
}

/**
 * @param {string} filePath
 * @param {(rows: object[]) => object[]} mutator
 * @param {{ parse: (text: string) => object[], serialize: (rows: object[]) => string }} codec
 */
export async function updateJsonl(filePath, mutator, codec) {
  return withFileLock(`${filePath}.lock`, async () => {
    const raw = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
    const next = mutator(codec.parse(raw));
    mkdirSync(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmp, codec.serialize(next));
    renameSync(tmp, filePath);
    return next;
  });
}

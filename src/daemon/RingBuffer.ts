import { writeFile, rename, unlink, appendFile, stat } from 'node:fs/promises';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Pattern that identifies temporary buffer files produced by
// dumpToFile / dumpToFileSyncAtomic. Recovery / dump-readers must skip
// these; they may exist briefly between the tmp write and the rename.
const TMP_SUFFIX_RE = /\.tmp\.[0-9a-f]+$/;

// Windows-only: an antivirus real-time scan or a concurrent reader can hold a
// transient handle on the destination `.buf`, making the final rename fail
// EPERM / EACCES / EBUSY. The lock releases within tens of ms, so a bounded
// backoff retry clears it instead of leaving the session dirty (which would
// re-dump the full multi-MB ring every 30 s tick — pure churn). POSIX rename is
// atomic and never hits this, so the retry is gated on win32.
const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_RETRY_BACKOFFS_MS = [20, 50, 100, 200]; // ≤ +370 ms, trivial vs the 30 s tick

// Per-DESTINATION serialization for the ASYNC dumps (codex #4). The rename
// retry widens a pre-existing race: the async call sites — the 30 s snapshot
// tick, the interrupted-session dump, and the async shutdown dump — can each
// dump the SAME session path, and a retry-delayed older dump could otherwise
// rename AFTER a newer one and restore stale scrollback. Atomic rename
// guarantees integrity, not freshness. Chaining dumps to the same path (keyed
// by the destination, the actual shared resource) makes the newest-enqueued
// dump land last. The map entry is deleted once the chain tail resolves, so it
// never grows unbounded.
//
// The SYNC exit path (dumpToFileSyncAtomic) is deliberately NOT chained: it is
// the terminal last-word write in the Windows process.on('exit') handler, where
// no event loop is left to await a chain, and it runs after the async shutdown
// body has settled — so it is already the freshest, final write by construction
// (GLM P3: this is a doc clarification, not a gap).
const dumpChains = new Map<string, Promise<void>>();

// How far the dump file may grow past the ring's capacity before it is
// compacted back down. The dump is append-first (see doDumpToFile): only the
// bytes produced since the previous dump are written, so a tick that produced
// 30 KB costs 30 KB instead of rewriting the whole multi-MB ring.
//
// Amplification works out to F/(F-1) of the output: at F = 2 the file grows by
// one capacity worth of appends and is then rewritten once, so ~2 bytes on disk
// per byse of terminal output. The full-rewrite-every-tick behaviour this
// replaces cost capacity/output per tick — measured at ~112x on this repo's own
// panes (30 s tick, 4 MiB ring, ~2.8 KB/s of actual output).
//
// Raising F lowers amplification further but leaves a larger file for recovery
// to read back; 2 keeps the worst case at 8 MiB for the default 4 MiB ring.
const DUMP_COMPACT_FACTOR = 2;

/**
 * Fixed-size circular byte buffer for storing ConPTY output per session.
 * Preserves raw bytes including ANSI escape sequences without any filtering.
 * When the buffer is full, the oldest data is overwritten.
 */
/**
 * Initial physical allocation for a new buffer. The ring grows from here by
 * doubling, up to its configured ceiling, so an idle session that prints
 * little holds only ~64 KB instead of the full multi-MB ceiling (the default
 * is 8 MB/session). Buffers whose ceiling is already ≤ this value allocate
 * their ceiling outright and behave as a classic fixed ring.
 */
const INITIAL_PHYSICAL_BYTES = 64 * 1024;

export class RingBuffer {
  private buffer: Buffer;
  private readonly capacity: number;  // logical ceiling — the max this ring will ever hold
  private physical: number;           // bytes currently allocated (<= capacity), grown on demand
  private writePos: number;   // next write position (0..physical-1)
  private length: number;     // bytes currently stored (<= physical)
  private totalWritten: number; // monotonic lifetime count (used as byte offset for PromptEventLog)

  // ── incremental dump bookkeeping ──────────────────────────────────────────
  // Valid only for `dumpState.path`; any other destination, a clear(), or an
  // on-disk size that no longer matches forces the next dump back to a full
  // rewrite. Keeping the guard conservative matters more than keeping the
  // append streak alive: this file is the crash-recovery substrate, and a
  // wrong append silently corrupts scrollback whereas a needless rewrite only
  // costs what the old code paid every tick anyway.
  private dumpState: { path: string; totalWritten: number; fileBytes: number } | null = null;

  constructor(capacityBytes: number) {
    if (capacityBytes <= 0 || !Number.isInteger(capacityBytes)) {
      throw new Error('capacityBytes must be a positive integer');
    }
    this.capacity = capacityBytes;
    this.physical = Math.min(INITIAL_PHYSICAL_BYTES, capacityBytes);
    this.buffer = Buffer.alloc(this.physical);
    this.writePos = 0;
    this.length = 0;
    this.totalWritten = 0;
  }

  /**
   * Grow the physical allocation so it can hold at least `needed` bytes
   * linearly, doubling each step and clamping at the ceiling. No-op once the
   * allocation already covers `needed` or has reached the ceiling. Existing
   * contents are copied in logical order (oldest→newest) into the new buffer,
   * which also un-wraps the ring (writePos = length) — safe because after a
   * grow the stored length is strictly below the new physical size.
   */
  private ensureCapacity(needed: number): void {
    if (this.physical >= this.capacity || needed <= this.physical) return;
    let next = this.physical;
    while (next < needed && next < this.capacity) next *= 2;
    next = Math.min(next, this.capacity);
    if (next === this.physical) return;

    const existing = this.readAll(); // oldest→newest, exactly `length` bytes
    const grown = Buffer.alloc(next);
    existing.copy(grown, 0);
    this.buffer = grown;
    this.physical = next;
    this.writePos = existing.length; // length < next, so no wrap
    this.length = existing.length;
  }

  /**
   * Write data into the ring buffer.
   * If data exceeds capacity, only the last `capacity` bytes are preserved.
   */
  write(data: Buffer): void {
    const dataLen = data.length;
    if (dataLen === 0) return;

    this.totalWritten += dataLen;

    // Grow toward the ceiling so this write lands without prematurely
    // overwriting still-young data. Once at the ceiling the ring wraps.
    this.ensureCapacity(this.length + dataLen);

    // If incoming data is larger than the current allocation, only keep the tail
    if (dataLen >= this.physical) {
      const offset = dataLen - this.physical;
      data.copy(this.buffer, 0, offset, dataLen);
      this.writePos = 0;
      this.length = this.physical;
      return;
    }

    // How much space from writePos to end of buffer
    const spaceToEnd = this.physical - this.writePos;

    if (dataLen <= spaceToEnd) {
      // Fits without wrapping
      data.copy(this.buffer, this.writePos);
    } else {
      // Wraps around
      data.copy(this.buffer, this.writePos, 0, spaceToEnd);
      data.copy(this.buffer, 0, spaceToEnd, dataLen);
    }

    this.writePos = (this.writePos + dataLen) % this.physical;
    this.length = Math.min(this.length + dataLen, this.physical);
  }

  /**
   * Total bytes ever written to this buffer over its lifetime (monotonic).
   * Used by PromptEventLog as a stable offset even after the ring wraps.
   */
  get totalBytesWritten(): number {
    return this.totalWritten;
  }

  /**
   * Read all stored data in order (oldest first, newest last).
   * Returns a new Buffer copy; the internal buffer is not modified.
   */
  readAll(): Buffer {
    if (this.length === 0) {
      return Buffer.alloc(0);
    }

    if (this.length < this.physical) {
      // Buffer has not wrapped yet; data is at [0..length)
      return Buffer.from(this.buffer.subarray(0, this.length));
    }

    // Buffer is full and has wrapped.
    // writePos points to the oldest byte (it's where the next write will go).
    // Order: [writePos..physical) + [0..writePos)
    const tail = this.buffer.subarray(this.writePos, this.physical);
    const head = this.buffer.subarray(0, this.writePos);
    return Buffer.concat([tail, head]);
  }

  /**
   * Read the newest `n` stored bytes (oldest→newest within that slice).
   *
   * The incremental dump needs only the bytes produced since the last dump.
   * Going through readAll() for that would copy the entire ring — which is the
   * very cost this exists to avoid — so this walks the ring directly and
   * copies just the tail.
   */
  readLast(n: number): Buffer {
    const want = Math.min(n, this.length);
    if (want <= 0) return Buffer.alloc(0);
    if (this.length < this.physical) {
      // Not wrapped: data lives at [0..length)
      return Buffer.from(this.buffer.subarray(this.length - want, this.length));
    }
    // Wrapped: the newest byte sits just before writePos.
    const start = (this.writePos - want + this.physical) % this.physical;
    if (start + want <= this.physical) {
      return Buffer.from(this.buffer.subarray(start, start + want));
    }
    const first = this.buffer.subarray(start, this.physical);
    const second = this.buffer.subarray(0, want - first.length);
    return Buffer.concat([first, second]);
  }

  /** Clear the buffer, resetting all pointers and zeroing sensitive data. */
  clear(): void {
    this.buffer.fill(0);
    this.writePos = 0;
    this.length = 0;
    // The dump file still holds the discarded history, so an append after a
    // clear would concatenate two unrelated streams. Force a rewrite.
    this.dumpState = null;
    // totalWritten is intentionally NOT reset — it represents the stream's
    // lifetime byte count, which PromptEventLog consumers may still hold
    // references to.
  }

  /** Number of bytes currently stored. */
  get size(): number {
    return this.length;
  }

  /** Logical ceiling in bytes — the most this ring will ever store. */
  get totalCapacity(): number {
    return this.capacity;
  }

  /** Bytes currently committed for backing storage (grows on demand toward the ceiling). */
  get allocatedBytes(): number {
    return this.physical;
  }

  /**
   * Dump the buffer contents to a file atomically (write to tmp + rename).
   *
   * Phase A — A4. Writing the .buf directly is not safe across a crash:
   * a reader that races a half-written buffer would see a truncated file
   * and either fail to parse or restore a scrollback that abruptly cuts
   * off mid-frame. tmp + rename keeps readers from ever observing a
   * partial state — the rename either has happened or has not.
   *
   * The tmp file lives in the SAME parent directory as the destination
   * so rename is always intra-FS (cross-device renames fail with EXDEV).
   * On failure, the tmp file is best-effort cleaned up; recovery code
   * also sweeps stale tmps via {@link cleanupStaleTmpFiles}.
   */
  async dumpToFile(filePath: string): Promise<void> {
    // Serialize on the destination path so a retry-delayed older dump can never
    // rename after a newer one (codex #4). A prior dump's rejection must NOT
    // skip this dump, so we chain off a swallowed copy of the previous promise.
    const prev = dumpChains.get(filePath) ?? Promise.resolve();
    const run = prev
      .catch(() => { /* a prior dump's failure must not skip this one */ })
      .then(() => this.doDumpToFile(filePath));
    dumpChains.set(filePath, run);
    try {
      await run;
    } finally {
      // Only clear when we are still the chain tail — a dump enqueued after us
      // owns the entry now, and deleting it would break its serialization.
      if (dumpChains.get(filePath) === run) dumpChains.delete(filePath);
    }
  }

  /**
   * Append-first dump, run inside the per-path chain.
   *
   * The whole ring used to be rewritten on every snapshot tick. For a session
   * at the ring ceiling that meant multi-MB of disk writes to persist a few KB
   * of new output — measured at ~112x amplification on this repo's own panes,
   * ~27 GB/day across eleven live PTYs, and it is also what the Windows AV
   * handle-lock retry above exists to survive.
   *
   * So: write only what is new, and rewrite in full only when appending would
   * be wrong or when the file has grown past DUMP_COMPACT_FACTOR x capacity.
   *
   * Appending is CORRECT because the dump file is only ever consumed as "the
   * newest bytes of this stream": loadFromFile() feeds it straight into
   * write(), which already keeps just the trailing `capacity` bytes when given
   * more than it can hold. A file carrying extra history is therefore not a
   * format change — it restores identically, and the surplus is bounded.
   *
   * Appending is SAFER than it looks against the crash that motivated tmp +
   * rename. That guard protects readers from a partial FULL rewrite, where a
   * tear can land anywhere and take the whole file with it. A torn append can
   * only damage the bytes of the tick that was in flight, and the rest of the
   * file — the entire prior scrollback — is already durable. The full-rewrite
   * path keeps tmp + rename unchanged for the case where the whole file really
   * is being replaced.
   */
  private async doDumpToFile(filePath: string): Promise<void> {
    const totalNow = this.totalWritten;
    const st = this.dumpState;

    if (st && st.path === filePath && totalNow > st.totalWritten) {
      const delta = totalNow - st.totalWritten;
      // delta > length: the ring dropped bytes we never dumped, so the tail no
      // longer reconstructs the gap. Only a full rewrite is correct.
      // fileBytes + delta over the ceiling: time to compact.
      if (delta <= this.length &&
          st.fileBytes + delta <= this.capacity * DUMP_COMPACT_FACTOR) {
        // The file must still be exactly what we left behind. If anything else
        // truncated, rotated or replaced it, appending would splice our bytes
        // onto a stranger's — cheaper to check than to corrupt.
        let onDisk = -1;
        try {
          onDisk = (await stat(filePath)).size;
        } catch { /* missing/unreadable -> fall through to full rewrite */ }
        if (onDisk === st.fileBytes) {
          await appendFile(filePath, this.readLast(delta), { mode: 0o600 });
          this.dumpState = {
            path: filePath,
            totalWritten: totalNow,
            fileBytes: st.fileBytes + delta,
          };
          return;
        }
      }
    }

    // ── full rewrite (first dump, post-clear, gap, compaction, or a file that
    // changed underneath us). Unchanged tmp + atomic rename semantics.
    //
    // Captured here (inside the chain) rather than at enqueue time: a slightly
    // fresher snapshot is never wrong for recovery, and the snapshotRunner's
    // dirty-tracking captures totalBytesWritten BEFORE calling us, so a fresher
    // readAll at worst leaves the session marked dirty for one extra tick.
    const data = this.readAll();
    const tmpPath = `${filePath}.tmp.${crypto.randomBytes(6).toString('hex')}`;
    try {
      // mode is a no-op on Windows; use icacls for NTFS ACLs.
      await writeFile(tmpPath, data, { mode: 0o600 });
      await RingBuffer.renameWithRetry(tmpPath, filePath);
    } catch (err) {
      try { await unlink(tmpPath); } catch { /* tmp may already be gone */ }
      // A failed rewrite leaves the destination in an unknown state — the old
      // file may still be there, or the rename may have half-happened on a
      // hostile FS. Drop the bookkeeping so the next dump cannot append onto
      // an assumption we no longer hold.
      this.dumpState = null;
      throw err;
    }
    this.dumpState = { path: filePath, totalWritten: totalNow, fileBytes: data.length };
  }

  /**
   * rename with a bounded win32-only backoff retry for transient handle-lock
   * failures (AV scan / concurrent reader). Non-win32, non-transient codes, and
   * exhausted retries all throw exactly as a bare rename would — the caller's
   * catch still runs (tmp cleanup + rethrow), so the dirty-retry contract holds.
   */
  private static async renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(from, to);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code ?? '';
        if (
          process.platform === 'win32' &&
          RENAME_RETRY_CODES.has(code) &&
          attempt < RENAME_RETRY_BACKOFFS_MS.length
        ) {
          await new Promise((r) => setTimeout(r, RENAME_RETRY_BACKOFFS_MS[attempt]));
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Synchronous atomic dump. Used by the Windows process.on('exit')
   * handler as a last-resort save when the daemon has no time to await
   * the async path. Same tmp + rename invariants as {@link dumpToFile}.
   */
  dumpToFileSyncAtomic(filePath: string): void {
    const totalNow = this.totalWritten;
    const data = this.readAll();
    const tmpPath = `${filePath}.tmp.${crypto.randomBytes(6).toString('hex')}`;
    try {
      writeFileSync(tmpPath, data, { mode: 0o600 });
      renameSync(tmpPath, filePath);
    } catch (err) {
      try { unlinkSync(tmpPath); } catch { /* tmp may already be gone */ }
      this.dumpState = null;
      throw err;
    }
    // This path deliberately stays a full rewrite — it is the last-word write
    // from the exit handler. Record the resulting state anyway so a daemon that
    // somehow continues (a non-terminal exit hook, a test) appends from the
    // right offset instead of silently splicing onto a stale length.
    this.dumpState = { path: filePath, totalWritten: totalNow, fileBytes: data.length };
  }

  /** Create a RingBuffer pre-filled with data loaded from a file. */
  static loadFromFile(filePath: string, capacityBytes: number): RingBuffer {
    const data = readFileSync(filePath);
    const rb = new RingBuffer(capacityBytes);
    if (data.length > 0) {
      rb.write(data);
    }
    return rb;
  }

  /**
   * Best-effort cleanup of stale `.tmp.<hex>` files in the buffer directory.
   *
   * tmp files only exist between the write and rename steps of an atomic
   * dump. Under normal operation rename either succeeds (no tmp left) or
   * the catch handler unlinks the tmp. A power loss or SIGKILL between
   * the two steps can leave a tmp behind. Recovery + dump-readers must
   * ignore them (test the filename against {@link TMP_SUFFIX_RE}); this
   * helper unlinks them so the buffer directory does not accumulate
   * orphans. Errors are swallowed — cleanup is best-effort.
   */
  static cleanupStaleTmpFiles(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // dir does not exist yet — nothing to clean.
    }
    for (const name of entries) {
      if (TMP_SUFFIX_RE.test(name)) {
        try {
          unlinkSync(path.join(dir, name));
        } catch {
          // file may have been removed by another process; ignore.
        }
      }
    }
  }

  /** True if the filename is a tmp companion of an atomic dump. */
  static isTmpFile(name: string): boolean {
    return TMP_SUFFIX_RE.test(name);
  }
}

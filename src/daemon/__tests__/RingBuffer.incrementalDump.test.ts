import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RingBuffer } from '../RingBuffer';

// Incremental (append-first) dump.
//
// The dump used to rewrite the whole ring on every snapshot tick, so a session
// sitting at the ring ceiling paid multi-MB of disk writes to persist a few KB
// of new output — ~112x amplification measured on this repo's own panes, and
// the same writes the Windows AV handle-lock retry exists to survive. Now only
// the bytes produced since the previous dump are written, with a full rewrite
// reserved for the cases where appending would be WRONG.
//
// Every test below is written so that append and full-rewrite produce DIFFERENT
// observable results — otherwise it would pass against the old code and lock
// nothing. The discriminator is the wrapped ring: a full rewrite can never
// leave more than `capacity` bytes on disk, an append can.
describe('RingBuffer incremental dump', () => {
  let tmpDir: string;
  let dst: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wmux-incdump-'));
    dst = path.join(tmpDir, 'session.buf');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const read = () => fs.readFileSync(dst).toString();
  const size = () => fs.statSync(dst).size;

  it('appends only the new bytes instead of rewriting the ring', async () => {
    const rb = new RingBuffer(100);
    rb.write(Buffer.from('A'.repeat(80)));
    await rb.dumpToFile(dst);
    expect(size()).toBe(80);

    // Overflows the ring: it now holds 20 A's + 60 B's, i.e. 100 bytes.
    rb.write(Buffer.from('B'.repeat(60)));
    await rb.dumpToFile(dst);

    // A full rewrite could only have produced the ring's 100 bytes. 140 proves
    // the second dump wrote 60 and left the first 80 alone.
    expect(size()).toBe(140);
    expect(read()).toBe('A'.repeat(80) + 'B'.repeat(60));
  });

  it('restores to exactly the ring contents even though the file is longer', async () => {
    const rb = new RingBuffer(100);
    rb.write(Buffer.from('A'.repeat(80)));
    await rb.dumpToFile(dst);
    rb.write(Buffer.from('B'.repeat(60)));
    await rb.dumpToFile(dst);
    expect(size()).toBeGreaterThan(100);

    // The surplus history is not a format change: write() keeps the trailing
    // capacity bytes, so the restored ring is byte-identical to the live one.
    const restored = RingBuffer.loadFromFile(dst, 100);
    expect(restored.readAll().equals(rb.readAll())).toBe(true);
    // 140 bytes went through a 100-byte ring, so both hold stream[40..140).
    expect(restored.readAll().toString()).toBe('A'.repeat(40) + 'B'.repeat(60));
  });

  it('compacts once the file passes the growth ceiling', async () => {
    const rb = new RingBuffer(100); // ceiling = 100 * 2 = 200
    for (const [ch, n] of [['A', 80], ['B', 60], ['C', 50]] as const) {
      rb.write(Buffer.from(ch.repeat(n)));
      await rb.dumpToFile(dst);
    }
    expect(size()).toBe(190); // still under the ceiling — appended

    rb.write(Buffer.from('D'.repeat(50))); // 190 + 50 = 240 > 200 -> compact
    await rb.dumpToFile(dst);

    expect(size()).toBe(100);
    expect(read()).toBe('C'.repeat(50) + 'D'.repeat(50));
    expect(read()).toBe(rb.readAll().toString());
  });

  it('rewrites when more arrived than the ring can hold (the gap case)', async () => {
    const rb = new RingBuffer(100);
    rb.write(Buffer.from('A'.repeat(80)));
    await rb.dumpToFile(dst);

    // 300 bytes through a 100-byte ring: the middle is gone, so appending the
    // tail would splice a hole into the stream.
    rb.write(Buffer.from('X'.repeat(300)));
    await rb.dumpToFile(dst);

    expect(size()).toBe(100);
    expect(read()).toBe('X'.repeat(100));
  });

  it('rewrites after clear() rather than concatenating two streams', async () => {
    const rb = new RingBuffer(100);
    rb.write(Buffer.from('first'));
    await rb.dumpToFile(dst);

    rb.clear();
    rb.write(Buffer.from('second'));
    await rb.dumpToFile(dst);

    expect(read()).toBe('second');
  });

  it('rewrites when the file changed underneath us', async () => {
    const rb = new RingBuffer(100);
    rb.write(Buffer.from('A'.repeat(50)));
    await rb.dumpToFile(dst);

    fs.writeFileSync(dst, 'tampered'); // size no longer matches our bookkeeping
    rb.write(Buffer.from('B'.repeat(10)));
    await rb.dumpToFile(dst);

    expect(read()).toBe(rb.readAll().toString());
    expect(read()).toBe('A'.repeat(50) + 'B'.repeat(10));
  });

  it('rewrites when the destination changes', async () => {
    const rb = new RingBuffer(100);
    rb.write(Buffer.from('A'.repeat(50)));
    await rb.dumpToFile(dst);

    const other = path.join(tmpDir, 'other.buf');
    rb.write(Buffer.from('B'.repeat(10)));
    await rb.dumpToFile(other);

    // The new file must be whole, not just the 10-byte delta.
    expect(fs.readFileSync(other).toString()).toBe('A'.repeat(50) + 'B'.repeat(10));
  });

  it('drops the bookkeeping when a dump fails, so the next one cannot append blindly', async () => {
    const rb = new RingBuffer(100);
    rb.write(Buffer.from('A'.repeat(50)));
    await rb.dumpToFile(dst);

    await expect(
      rb.dumpToFile(path.join(tmpDir, 'no-such-dir', 'x.buf')),
    ).rejects.toThrow();

    rb.write(Buffer.from('B'.repeat(10)));
    await rb.dumpToFile(dst);
    expect(read()).toBe(rb.readAll().toString());
  });

  it('the sync exit dump stays a full rewrite', () => {
    const rb = new RingBuffer(100);
    rb.write(Buffer.from('A'.repeat(80)));
    rb.dumpToFileSyncAtomic(dst);
    rb.write(Buffer.from('B'.repeat(60)));
    rb.dumpToFileSyncAtomic(dst);

    expect(size()).toBe(100);
    expect(read()).toBe(rb.readAll().toString());
  });

  describe('readLast', () => {
    it('returns the newest bytes before the ring wraps', () => {
      const rb = new RingBuffer(100);
      rb.write(Buffer.from('abcdefghij'));
      expect(rb.readLast(4).toString()).toBe('ghij');
      expect(rb.readLast(0).toString()).toBe('');
      // asking for more than is stored yields everything
      expect(rb.readLast(999).toString()).toBe('abcdefghij');
    });

    it('returns the newest bytes across a wrap', () => {
      const rb = new RingBuffer(10);
      rb.write(Buffer.from('0123456789')); // exactly full
      rb.write(Buffer.from('AB'));         // wraps: ring = 23456789AB
      expect(rb.readAll().toString()).toBe('23456789AB');
      expect(rb.readLast(4).toString()).toBe('89AB');
      // a slice that itself straddles the physical seam
      expect(rb.readLast(6).toString()).toBe('6789AB');
    });

    it('agrees with readAll for every suffix length', () => {
      const rb = new RingBuffer(16);
      rb.write(Buffer.from('the quick brown fox jumps'));
      const all = rb.readAll().toString();
      for (let n = 0; n <= all.length; n++) {
        expect(rb.readLast(n).toString()).toBe(all.slice(all.length - n));
      }
    });
  });
});

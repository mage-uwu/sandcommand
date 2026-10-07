/** Growable little-endian binary writer. Reused across ticks to avoid garbage. */
export class Writer {
  buf: Uint8Array<ArrayBuffer>;
  view: DataView;
  pos = 0;

  constructor(initial = 4096) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  reset(): this {
    this.pos = 0;
    return this;
  }

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.ensure(1);
    this.buf[this.pos++] = v;
  }
  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
  }
  i16(v: number): void {
    this.ensure(2);
    this.view.setInt16(this.pos, v, true);
    this.pos += 2;
  }
  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v, true);
    this.pos += 4;
  }
  f32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
  }
  f64(v: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, v, true);
    this.pos += 8;
  }
  varuint(v: number): void {
    this.ensure(5);
    while (v >= 0x80) {
      this.buf[this.pos++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    this.buf[this.pos++] = v;
  }
  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }
  str(s: string): void {
    const enc = new TextEncoder().encode(s);
    this.varuint(enc.length);
    this.bytes(enc);
  }
  /** Copy of the written bytes. */
  finish(): Uint8Array<ArrayBuffer> {
    return this.buf.slice(0, this.pos);
  }
}

export class Reader {
  view: DataView;
  pos = 0;

  constructor(public buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }
  u8(): number {
    if (this.pos >= this.buf.length) throw new RangeError('read past end');
    return this.buf[this.pos++];
  }
  u16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  f32(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
  f64(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }
  varuint(): number {
    let v = 0;
    let shift = 0;
    for (;;) {
      const b = this.u8();
      v += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return v;
      shift += 7;
      if (shift > 35) throw new RangeError('varuint too long');
    }
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.buf.length) throw new RangeError('read past end');
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
  str(): string {
    const n = this.varuint();
    return new TextDecoder().decode(this.bytes(n));
  }
}

/** Run-length encode a chunk's material bytes: (varuint run, u8 mat)*. */
export function rleEncode(w: Writer, data: Uint8Array): void {
  let i = 0;
  while (i < data.length) {
    const v = data[i];
    let j = i + 1;
    while (j < data.length && data[j] === v) j++;
    w.varuint(j - i);
    w.u8(v);
    i = j;
  }
}

export function rleDecode(r: Reader, out: Uint8Array): void {
  let i = 0;
  while (i < out.length) {
    const run = r.varuint();
    const v = r.u8();
    if (run === 0 || i + run > out.length) throw new RangeError('bad rle run');
    out.fill(v, i, i + run);
    i += run;
  }
}

// Run-length encoding for layer data: [value, count, value, count, ...]
export function rleEncode(data: ArrayLike<number>): number[] {
  const out: number[] = [];
  if (data.length === 0) return out;
  let prev = data[0];
  let count = 1;
  for (let i = 1; i < data.length; i++) {
    const v = data[i];
    if (v === prev) {
      count++;
    } else {
      out.push(prev, count);
      prev = v;
      count = 1;
    }
  }
  out.push(prev, count);
  return out;
}

export function rleDecode<T extends Uint32Array | Uint8Array>(rle: number[], target: T): T {
  let i = 0;
  for (let r = 0; r + 1 < rle.length; r += 2) {
    const v = rle[r];
    const n = rle[r + 1];
    target.fill(v, i, Math.min(i + n, target.length));
    i += n;
  }
  return target;
}

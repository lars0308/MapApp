import type { RigRegion, SpriteKind } from './types';

// "Automatisch zerlegen": finds legs, arms, antennae … in an own picture (or one the image model
// painted) so an animal walks instead of sliding as one block.
// The thick body survives when the picture is thinned (pixels far from the edge); limbs are the thin
// parts sticking out of it. Limbs reaching the ground are legs, the others arms; neighbouring legs
// swing against each other (walking gait).

export interface RigPart {
  pixels: number[];
  region: RigRegion;
  swing: number;
  name: string;
}

/** distance (in pixels, 8-neighbourhood) of every solid pixel to the nearest empty one */
function distances(solid: Uint8Array, n: number): Uint16Array {
  const d = new Uint16Array(n * n).fill(0xffff);
  const q: number[] = [];
  for (let i = 0; i < n * n; i++) if (!solid[i]) (d[i] = 0), q.push(i);
  // the canvas border counts as empty too
  for (let x = 0; x < n; x++)
    for (const y of [0, n - 1]) {
      const i = y * n + x;
      if (solid[i] && d[i] > 1) (d[i] = 1), q.push(i);
    }
  for (let y = 0; y < n; y++)
    for (const x of [0, n - 1]) {
      const i = y * n + x;
      if (solid[i] && d[i] > 1) (d[i] = 1), q.push(i);
    }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % n;
    const y = (i - x) / n;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const j = yy * n + xx;
        if (d[j] > d[i] + 1) (d[j] = d[i] + 1), q.push(j);
      }
  }
  return d;
}

/** thin parts of the picture that stick out of the body, sorted into legs and arms */
export function findLimbs(data: Uint8ClampedArray, n: number, kind: SpriteKind): RigPart[] {
  const solid = new Uint8Array(n * n);
  let count = 0;
  let top = n,
    bottom = -1;
  for (let i = 0; i < n * n; i++)
    if (data[i * 4 + 3] > 40) {
      solid[i] = 1;
      count++;
      const y = Math.floor(i / n);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  if (count < 20) return [];
  const dist = distances(solid, n);
  // body core: as thick as the thickest part allows, at least 3 px (legs are 1–3 px wide)
  const maxD = Math.max(...Array.from(dist).filter((v) => v !== 0xffff));
  const core = Math.max(2, Math.min(4, Math.floor(maxD * 0.5)));
  // grow the core back to the body's outline (a limb stays out: it is thinner than the core)
  const body = new Uint8Array(n * n);
  const q: number[] = [];
  for (let i = 0; i < n * n; i++) if (solid[i] && dist[i] >= core) (body[i] = 1), q.push(i);
  if (!q.length) return [];
  for (let step = 0; step < core; step++) {
    const next: number[] = [];
    for (const i of q) {
      const x = i % n;
      const y = (i - x) / n;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const j = yy * n + xx;
          if (solid[j] && !body[j]) (body[j] = 1), next.push(j);
        }
    }
    q.length = 0;
    q.push(...next);
  }
  // the biggest body blob is the body; everything solid outside it is a limb candidate
  const limb = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) if (solid[i] && !body[i]) limb[i] = 1;
  const seen = new Uint8Array(n * n);
  const comps: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    if (!limb[i] || seen[i]) continue;
    const c: number[] = [];
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const j = st.pop()!;
      c.push(j);
      const x = j % n;
      const y = (j - x) / n;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const k = yy * n + xx;
          if (limb[k] && !seen[k]) (seen[k] = 1), st.push(k);
        }
    }
    comps.push(c);
  }
  const H = bottom - top + 1;
  const min = Math.max(4, Math.round(count * 0.01));
  const parts = comps
    .filter((c) => c.length >= min)
    .map((c) => {
      const xs = c.map((i) => i % n);
      const ys = c.map((i) => Math.floor(i / n));
      return { c, cx: xs.reduce((a, b) => a + b, 0) / c.length, y0: Math.min(...ys), y1: Math.max(...ys) };
    });
  // body centre (for left / right)
  let bx = 0;
  let bn = 0;
  for (let i = 0; i < n * n; i++) if (body[i]) (bx += i % n), bn++;
  const cx = bn ? bx / bn : n / 2;
  const legs = parts.filter((p) => p.y1 >= bottom - Math.max(1, Math.round(H * 0.08))).sort((a, b) => a.cx - b.cx);
  const arms = parts.filter((p) => !legs.includes(p)).sort((a, b) => a.cx - b.cx);
  const out: RigPart[] = [];
  legs.forEach((p, k) => {
    // characters walk with legL / legR (opposite phases), creatures crawl with their side limbs;
    // every second pair swings the other way, so neighbouring legs never move together
    const region: RigRegion = kind === 'character' ? (k % 2 ? 'legL' : 'legR') : p.cx < cx ? 'armL' : 'armR';
    const swing = kind === 'character' ? (Math.floor(k / 2) % 2 ? -1 : 1) : k % 2 ? -1 : 1;
    out.push({ pixels: p.c, region, swing, name: `Bein ${k + 1}` });
  });
  arms.forEach((p, k) => {
    const front = k === arms.length - 1; // side view facing right: the rightmost is in front
    const region: RigRegion = kind === 'character' ? (front ? 'armR' : 'armL') : p.cx < cx ? 'armL' : 'armR';
    out.push({ pixels: p.c, region, swing: k % 2 ? -0.7 : 1, name: kind === 'creature' && p.y1 < top + H * 0.35 ? `Fühler ${k + 1}` : `Arm ${k + 1}` });
  });
  return out;
}

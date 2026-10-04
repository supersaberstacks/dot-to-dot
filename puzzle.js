// Turns line art into a numbered dot-to-dot. Shared by index.html and
// tools/preview.html.
//
//   strokes (lineart.js) -> page millimetres -> a graph of lines meeting at
//   junctions -> runs the pencil can follow without lifting -> dots -> numbers
//
// What makes a dot-to-dot hard to guess is not the number of dots, it is how
// little the dots look like the picture before they are joined. An outline
// dotted at even spacing is a dotted outline: you can read the subject off it
// at a glance. So dots go where the drawing needs them - corners, junctions,
// and as many as a curve needs to stay a curve - and straight runs get a dot
// at each end and nothing in between. The interior lines carry dots too, which
// fills in the silhouette with the same scatter as everything else.
(() => {
  "use strict";

  // level: which layers of the art take part (lineart.js).
  // tol: the range, in mm, that a joined line may stray from the drawn curve.
  //   This is what decides how many dots a curve gets. Within the range the
  //   tolerance is chosen to bring the count near target; outside it, never.
  //   Coarser than the range and the answer stops looking like the drawing.
  //   Finer, and a curve is dotted so densely you can see it before you join
  //   it - which is exactly what gives a picture away. A harder puzzle earns
  //   most of its extra dots from the extra detail in the art.
  // dots: the cap. Over it, the tolerance is loosened until the count fits.
  // minGap: closest two consecutive dots may be, in mm, for the numbers to fit.
  // maxGap: longest jump allowed before a straight line is split, so the next
  //   number is never a hunt across the whole page.
  const PRESETS = {
    medium: { level: 1, tol: [0.6, 1.2],  target: 95,  dots: 110, minGap: 4.6, maxGap: 34, num: 2.8, dot: 0.55 },
    hard:   { level: 2, tol: [0.4, 0.9],  target: 165, dots: 190, minGap: 3.6, maxGap: 28, num: 2.4, dot: 0.5 },
    epic:   { level: 3, tol: [0.28, 0.65], target: 260, dots: 300, minGap: 2.9, maxGap: 22, num: 2.0, dot: 0.42 }
  };

  const MARGIN = 8;      // mm kept clear round the drawing for the numbers
  const SNAP = 0.7;      // mm: line ends this close are the same junction

  // ------------------------------------------------------------------- rng
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // -------------------------------------------------------------- geometry
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function bboxOf(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) for (const [x, y] of s.pts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  // Never turned on its side to fill the paper better: a tractor on its back
  // is much harder to recognise, and recognising it is the point. Wide subjects
  // get landscape paper instead. Every stroke shares the one transform.
  function fit(strokes, areaW, areaH, angle, mirror) {
    const co = Math.cos(angle), si = Math.sin(angle);
    const turned = strokes.map(s => ({
      closed: s.closed,
      pts: s.pts.map(([x, y]) => { if (mirror) x = -x; return [x * co - y * si, x * si + y * co]; })
    }));
    const b = bboxOf(turned);
    const k = Math.min((areaW - MARGIN * 2) / b.w, (areaH - MARGIN * 2) / b.h);
    const ox = (areaW - b.w * k) / 2 - b.x0 * k, oy = (areaH - b.h * k) / 2 - b.y0 * k;
    return turned.map(s => ({ closed: s.closed, pts: s.pts.map(([x, y]) => [x * k + ox, y * k + oy]) }));
  }

  function nearestOn(pts, closed, p) {
    let best = Infinity, bi = -1, bt = 0;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const L = vx * vx + vy * vy;
      let t = L > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1]);
      if (d < best) { best = d; bi = i; bt = t; }
    }
    return { d: best, i: bi, t: bt };
  }

  // ----------------------------------------------------------------- graph
  // Lines meet. Where a leg disappears behind a body, the body's outline ends
  // exactly on the leg's edge; where an ear covers a head, the head's outline
  // ends partway along the ear. Each such meeting has to be one dot shared by
  // both lines - two dots a millimetre apart cannot both be numbered legibly,
  // and the solver could not tell which is which.
  function graph(strokes) {
    const boxes = strokes.map(s => bboxOf([s]));

    // A line ending on another line splits that line there.
    const cuts = strokes.map(() => []);
    strokes.forEach((a, ai) => {
      if (a.closed) return;
      for (const E of [a.pts[0], a.pts[a.pts.length - 1]]) {
        strokes.forEach((b, bi) => {
          if (bi === ai) return;
          const bb = boxes[bi];
          if (E[0] < bb.x0 - SNAP || E[0] > bb.x1 + SNAP || E[1] < bb.y0 - SNAP || E[1] > bb.y1 + SNAP) return;
          const hit = nearestOn(b.pts, b.closed, E);
          if (hit.d > SNAP) return;
          if (!b.closed && (dist(E, b.pts[0]) < SNAP * 2 || dist(E, b.pts[b.pts.length - 1]) < SNAP * 2)) return;
          cuts[bi].push({ i: hit.i, t: hit.t, p: E.slice() });
        });
      }
    });

    // Cut each stroke into pieces at its junctions.
    const pieces = [];
    strokes.forEach((s, si) => {
      const cs = cuts[si].sort((p, q) => p.i - q.i || p.t - q.t);
      if (!cs.length) { pieces.push({ pts: s.pts, closed: s.closed }); return; }
      const n = s.pts.length;
      // Walk the polyline, emitting a piece at each cut.
      const walk = [];
      let ci = 0;
      const segs = s.closed ? n : n - 1;
      let cur = s.closed ? null : [s.pts[0]];
      for (let i = 0; i < segs; i++) {
        while (ci < cs.length && cs[ci].i === i) {
          const c = cs[ci++];
          if (cur) { cur.push(c.p); walk.push(cur); }
          cur = [c.p];
        }
        if (cur) cur.push(s.pts[(i + 1) % n]);
      }
      if (s.closed) {
        // The stretch before the first cut belongs to the end of the last piece.
        const lead = [];
        for (let i = 0; i <= cs[0].i; i++) lead.push(s.pts[i]);
        lead.push(cs[0].p);
        cur.pop();   // the wrap-around repeat of pts[0]
        walk.push(cur.concat(lead));
      } else walk.push(cur);
      for (const w of walk) {
        const clean = [w[0]];
        for (let k = 1; k < w.length; k++) if (dist(w[k], clean[clean.length - 1]) > 1e-6) clean.push(w[k]);
        if (clean.length > 1) pieces.push({ pts: clean, closed: false });
      }
    });

    // Cluster the ends of open pieces into nodes.
    const ends = [];
    pieces.forEach((p, pi) => {
      if (p.closed) return;
      ends.push({ pi, end: 0, p: p.pts[0] }, { pi, end: 1, p: p.pts[p.pts.length - 1] });
    });
    const parent = ends.map((_, i) => i);
    const root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
    for (let i = 0; i < ends.length; i++)
      for (let j = i + 1; j < ends.length; j++)
        if (dist(ends[i].p, ends[j].p) < SNAP) parent[root(i)] = root(j);

    const nodeOf = new Map(), nodes = [];
    ends.forEach((e, i) => {
      const r = root(i);
      if (!nodeOf.has(r)) { nodeOf.set(r, nodes.length); nodes.push({ sum: [0, 0], n: 0, edges: [] }); }
      const nd = nodes[nodeOf.get(r)];
      nd.sum[0] += e.p[0]; nd.sum[1] += e.p[1]; nd.n++;
      e.node = nodeOf.get(r);
    });
    for (const nd of nodes) nd.p = [nd.sum[0] / nd.n, nd.sum[1] / nd.n];

    const edges = [], cycles = [];
    pieces.forEach((p, pi) => {
      if (p.closed) { cycles.push(p.pts); return; }
      const a = ends.find(e => e.pi === pi && e.end === 0).node;
      const b = ends.find(e => e.pi === pi && e.end === 1).node;
      const pts = p.pts.slice();
      pts[0] = nodes[a].p; pts[pts.length - 1] = nodes[b].p;
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += dist(pts[k], pts[k - 1]);
      if (len < 0.3) return;
      const id = edges.length;
      edges.push({ a, b, pts, len });
      nodes[a].edges.push(id);
      if (b !== a) nodes[b].edges.push(id); else nodes[a].edges.push(id);
    });
    return { nodes, edges, cycles };
  }

  // ------------------------------------------------------------------ runs
  // A run is what the solver draws without lifting the pencil. Runs are found
  // greedily: start at a loose end where possible, and at every junction carry
  // on along whichever line turns least, the way you would draw it by hand.
  function runs(G, rand) {
    const used = new Uint8Array(G.edges.length);
    const free = n => G.nodes[n].edges.filter(e => !used[e]);
    const out = [];
    const cyclesLeft = G.cycles.map((pts, i) => i);
    let pen = null;

    const dirAtEnd = pts => {
      const a = pts[pts.length - 1];
      for (let k = pts.length - 2; k >= 0; k--) if (dist(pts[k], a) > 1.5) return [a[0] - pts[k][0], a[1] - pts[k][1]];
      return [a[0] - pts[0][0], a[1] - pts[0][1]];
    };
    const dirAtStart = pts => {
      const a = pts[0];
      for (let k = 1; k < pts.length; k++) if (dist(pts[k], a) > 1.5) return [pts[k][0] - a[0], pts[k][1] - a[1]];
      return [pts[pts.length - 1][0] - a[0], pts[pts.length - 1][1] - a[1]];
    };

    for (;;) {
      // Next start: loose ends first (an odd number of free lines means a
      // run has to start or finish here anyway), then any junction with free
      // lines, then the closed loops. Nearest to where the pencil is.
      let best = null, bestScore = Infinity;
      G.nodes.forEach((nd, ni) => {
        const f = free(ni).length;
        if (!f) return;
        const odd = f % 2 === 1;
        const d = pen ? dist(pen, nd.p) : rand() * 1000;
        const score = d + (odd ? 0 : 400);
        if (score < bestScore) { bestScore = score; best = { node: ni }; }
      });
      for (const ci of cyclesLeft) {
        const pts = G.cycles[ci];
        const d = pen ? Math.min(...pts.filter((_, k) => k % 8 === 0).map(p => dist(pen, p))) : rand() * 1000;
        if (d + 400 < bestScore) { bestScore = d + 400; best = { cycle: ci }; }
      }
      if (!best) break;

      if (best.cycle !== undefined) {
        cyclesLeft.splice(cyclesLeft.indexOf(best.cycle), 1);
        const pts = G.cycles[best.cycle];
        // Start a loop wherever the seed says, then close it back to that dot.
        const s = Math.floor(rand() * pts.length);
        let loop = pts.slice(s).concat(pts.slice(0, s));
        if (rand() < 0.5) loop = [loop[0]].concat(loop.slice(1).reverse());
        loop.push(loop[0]);
        out.push({ pts: loop, marks: [{ at: 0, node: "c" + best.cycle }, { at: loop.length - 1, node: "c" + best.cycle }] });
        pen = loop[0];
        continue;
      }

      let n = best.node;
      const pts = [G.nodes[n].p];
      const marks = [{ at: 0, node: n }];
      let dir = null;
      for (;;) {
        const f = free(n);
        if (!f.length) break;
        let pick = f[0];
        if (dir) {
          let bestTurn = -Infinity;
          for (const e of f) {
            const E = G.edges[e];
            const path = E.a === n ? E.pts : E.pts.slice().reverse();
            const d2 = dirAtStart(path);
            const c = (dir[0] * d2[0] + dir[1] * d2[1]) / (Math.hypot(...dir) * Math.hypot(...d2) || 1);
            if (c > bestTurn) { bestTurn = c; pick = e; }
          }
        } else pick = f[Math.floor(rand() * f.length)];
        used[pick] = 1;
        const E = G.edges[pick];
        const path = E.a === n ? E.pts : E.pts.slice().reverse();
        for (let k = 1; k < path.length; k++) pts.push(path[k]);
        n = E.a === n ? E.b : E.a;
        marks.push({ at: pts.length - 1, node: n });
        dir = dirAtEnd(path);
      }
      out.push({ pts, marks });
      pen = pts[pts.length - 1];
    }
    return out;
  }

  // ------------------------------------------------------------------ dots
  function arcLengths(pts) {
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + dist(pts[i], pts[i - 1]));
    return s;
  }

  // Indices where the line turns sharply. A corner always gets a dot: cut it
  // and the picture loses exactly the feature that made it recognisable.
  function corners(pts, s) {
    const W = 1.2, out = [];
    const turn = new Float32Array(pts.length);
    let j = 0, k = 0;
    for (let i = 0; i < pts.length; i++) {
      while (j < i && s[i] - s[j + 1] >= W) j++;
      if (k < i) k = i;
      while (k < pts.length - 1 && s[k] - s[i] < W) k++;
      if (j >= i || k <= i || s[i] - s[j] < W * 0.6 || s[k] - s[i] < W * 0.6) continue;
      const ax = pts[i][0] - pts[j][0], ay = pts[i][1] - pts[j][1];
      const bx = pts[k][0] - pts[i][0], by = pts[k][1] - pts[i][1];
      const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
      turn[i] = Math.acos(Math.max(-1, Math.min(1, c)));
    }
    const MIN = 0.62;   // about 35 degrees
    for (let i = 0; i < pts.length; i++) {
      if (turn[i] < MIN) continue;
      let peak = true;
      for (let q = i - 1; q >= 0 && s[i] - s[q] < 1.6 && peak; q--) if (turn[q] > turn[i]) peak = false;
      for (let q = i + 1; q < pts.length && s[q] - s[i] < 1.6 && peak; q++) if (turn[q] >= turn[i]) peak = false;
      if (peak) out.push(i);
    }
    return out;
  }

  function rdp(pts, a, b, eps, keep) {
    const stack = [[a, b]];
    while (stack.length) {
      const [p, q] = stack.pop();
      if (q - p < 2) continue;
      const [ax, ay] = pts[p], [bx, by] = pts[q];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      let dmax = 0, idx = -1;
      for (let i = p + 1; i < q; i++) {
        const d = len > 1e-9
          ? Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len
          : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
        if (d > dmax) { dmax = d; idx = i; }
      }
      if (dmax > eps) { keep[idx] = 1; stack.push([p, idx], [idx, q]); }
    }
  }

  // Dots for one run at curve tolerance eps. Returns indices into run.pts.
  function place(run, eps, P) {
    const pts = run.pts, s = run.s, n = pts.length;
    const keep = new Uint8Array(n), must = new Uint8Array(n);
    for (const m of run.marks) must[m.at] = keep[m.at] = 1;
    for (const c of run.corners) must[c] = keep[c] = 1;

    // A closed loop with nothing on it but its start: give RDP a second anchor
    // opposite, or it measures everything against a zero-length chord.
    if (run.loop) {
      let far = 0;
      for (let i = 0; i < n; i++) if (dist(pts[i], pts[0]) > dist(pts[far], pts[0])) far = i;
      keep[far] = 1;
    }

    let prev = 0;
    for (let i = 1; i < n; i++) if (keep[i]) {
      rdp(pts, prev, i, eps, keep);
      prev = i;
    }

    // Long straight stretches: split, so the next number is never a hunt.
    let idx = [];
    for (let i = 0; i < n; i++) if (keep[i]) idx.push(i);
    const split = [idx[0]];
    for (let q = 1; q < idx.length; q++) {
      const a = idx[q - 1], b = idx[q];
      const L = s[b] - s[a];
      const parts = Math.ceil(L / P.maxGap);
      for (let k = 1; k < parts; k++) {
        const want = s[a] + (L * k) / parts;
        let i = a;
        while (i < b && s[i] < want) i++;
        split.push(i);
      }
      split.push(b);
    }
    idx = split;

    // Loops need enough dots to read as round, not as a triangle. Count them
    // by chord, which is what the gap filter below measures: spacing them by
    // arc length put neighbours a hair under the gap, and the filter then
    // culled every other one.
    if (run.loop) {
      const len = s[n - 1], r = len / (2 * Math.PI);
      const fits = P.minGap >= 2 * r ? 3 : Math.floor(Math.PI / Math.asin(P.minGap / (2 * r)) + 1e-9);
      const wantN = Math.min(9, fits);
      if (idx.length - 1 < wantN) {
        idx = [];
        for (let k = 0; k <= wantN; k++) {
          const want = (len * k) / wantN;
          let i = 0;
          while (i < n - 1 && s[i] < want) i++;
          idx.push(k === wantN ? n - 1 : i);
        }
        for (const m of run.marks) must[m.at] = 1;
      }
    }

    // Too close to number legibly: drop the dot that is not load-bearing.
    const out = [idx[0]];
    for (let q = 1; q < idx.length; q++) {
      const i = idx[q];
      const last = out[out.length - 1];
      if (dist(pts[i], pts[last]) >= P.minGap * (must[i] && must[last] ? 0.35 : 1)) { out.push(i); continue; }
      if (must[i] && !must[last] && out.length > 1) { out[out.length - 1] = i; continue; }
      if (must[i]) out.push(i);   // two load-bearing dots, very close: keep both
    }
    return out;
  }

  function prepareRuns(rs) {
    for (const r of rs) {
      r.s = arcLengths(r.pts);
      r.corners = corners(r.pts, r.s);
      r.loop = typeof r.marks[0].node === "string";
    }
  }

  // Dots for every run at tolerance eps, shared at junctions.
  function dotsAt(rs, eps, P) {
    const dots = [], byNode = new Map();
    const seq = [];
    for (const r of rs) {
      const idx = place(r, eps, P);
      const nodeAt = new Map(r.marks.map(m => [m.at, m.node]));
      const len = r.s[r.s.length - 1];
      // Too small to dot at this spacing: a loop that would come out as a
      // triangle, or a tick shorter than the gap between two numbers.
      if (r.loop ? idx.length - 1 < 4 : (len < P.minGap * 1.2 || idx.length < 2)) continue;
      const ids = [], before = dots.length, added = [];
      for (const i of idx) {
        const node = nodeAt.get(i);
        let id;
        if (node !== undefined && byNode.has(node)) id = byNode.get(node);
        else {
          dots.push({ p: r.pts[i], labels: [], dirs: [] });
          id = dots.length - 1;
          if (node !== undefined) { byNode.set(node, id); added.push(node); }
        }
        // A tiny stroke between two junctions can collapse onto one dot,
        // which would print as two consecutive numbers on the same spot.
        if (id !== ids[ids.length - 1]) ids.push(id);
      }
      if (ids.length > 1) seq.push(ids);
      else { dots.length = before; for (const node of added) byNode.delete(node); }
    }
    return { dots, seq };
  }

  // ----------------------------------------------------------------- build
  function build(subject, preset, areaW, areaH, rand) {
    const prep = LineArt.prepare(subject);
    const art = LineArt.strokes(prep, preset.level);

    const angle = (rand() * 2 - 1) * 0.1;   // +/- ~6 degrees
    const mirror = rand() < 0.5;
    const strokes = fit(art, areaW, areaH, angle, mirror);

    const G = graph(strokes);
    const rs = runs(G, rand);
    prepareRuns(rs);

    // The count falls as the tolerance rises. Find the finest tolerance in
    // range that stays within target; past the coarse end of the range, only
    // the cap may push it further.
    const [tFine, tCoarse] = preset.tol;
    const search = (lo, hi, limit) => {
      lo = Math.log(lo); hi = Math.log(hi);
      for (let k = 0; k < 16; k++) {
        const mid = (lo + hi) / 2;
        if (dotsAt(rs, Math.exp(mid), preset).dots.length > limit) lo = mid; else hi = mid;
      }
      return dotsAt(rs, Math.exp(hi), preset);
    };
    let best = dotsAt(rs, tCoarse, preset);
    if (best.dots.length > preset.dots) best = search(tCoarse, 12, preset.dots);
    else if (best.dots.length < preset.target) {
      const fine = dotsAt(rs, tFine, preset);
      best = fine.dots.length <= preset.target ? fine : search(tFine, tCoarse, preset.target);
    }

    // Number continuously along the runs. A run that comes back to where it
    // started gives that dot a second number, which is how a closed shape
    // tells you to close it.
    const { dots, seq } = best;
    let n = 0;
    for (const ids of seq) {
      ids.forEach((id, k) => {
        dots[id].labels.push({ n: ++n, start: k === 0 });
        if (k > 0) dots[id].dirs.push(sub(dots[ids[k - 1]].p, dots[id].p));
        if (k < ids.length - 1) dots[id].dirs.push(sub(dots[ids[k + 1]].p, dots[id].p));
      });
    }
    return { dots, seq, count: dots.length, lines: seq.length, numbers: n };
  }

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];

  // ---------------------------------------------------------------- layout
  // Where each number sits. A number has to read as belonging to its dot and
  // no other, and four things break that: another number in the way, a
  // different dot nearer to the number than its own, the number printed over
  // a dot, and the number printed where a line is about to be drawn through
  // it. All four are priced in millimetres, with how far the number strayed
  // from its best spot, and the cheapest candidate wins.
  const W = { clash: 4, steal: 2.2, cover: 1.6, line: 1.1, reach: 0.45, turn: 0.5, edge: 2 };
  const CLEAR = 0.6;              // mm a rival dot must be further away than our own
  const GAPS = [0.35, 0.8, 1.3, 1.9];    // dot edge to number box, in font sizes
  const DIRS = Array.from({ length: 16 }, (_, k) => [Math.cos(k * Math.PI / 8), Math.sin(k * Math.PI / 8)]);
  const REFINE_PASSES = 2;

  function labelText(d) { return d.labels.map(l => l.n).join("/"); }

  function layout(model, preset, areaW, areaH) {
    const fs = preset.num, dotR = preset.dot;
    const dots = model.dots;
    const segs = [];
    for (const ids of model.seq)
      for (let k = 1; k < ids.length; k++) segs.push([dots[ids[k - 1]].p, dots[ids[k]].p]);

    const marks = dots.map(d => {
      const text = labelText(d);
      let w = 0;
      for (const ch of text) w += ch === "/" ? 0.36 : 0.58;
      // The best direction is down the middle of the widest gap between the
      // lines leaving this dot, which is the spot furthest from all of them.
      const angs = d.dirs.map(v => Math.atan2(v[1], v[0])).sort((a, b) => a - b);
      let pref = [0, -1];
      if (angs.length === 1) pref = [-Math.cos(angs[0]), -Math.sin(angs[0])];
      else if (angs.length > 1) {
        let gap = -1, mid = 0;
        for (let i = 0; i < angs.length; i++) {
          const a = angs[i], b = i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI;
          if (b - a > gap) { gap = b - a; mid = (a + b) / 2; }
        }
        pref = [Math.cos(mid), Math.sin(mid)];
      }
      return { x: d.p[0], y: d.p[1], text, labels: d.labels, hw: (w * fs) / 2 + 0.15, hh: fs * 0.4,
               pref, lx: d.p[0], ly: d.p[1], set: false };
    });

    // Everything a number can collide with is near its own dot.
    const R = 2 * fs * (GAPS[GAPS.length - 1] + 2.5) + 4;
    const near = dots.map(() => []);
    for (let i = 0; i < dots.length; i++)
      for (let j = i + 1; j < dots.length; j++)
        if (dist(dots[i].p, dots[j].p) < R) { near[i].push(j); near[j].push(i); }
    const nearSegs = dots.map(d => segs.filter(([a, b]) => {
      const x0 = Math.min(a[0], b[0]) - R, x1 = Math.max(a[0], b[0]) + R;
      const y0 = Math.min(a[1], b[1]) - R, y1 = Math.max(a[1], b[1]) + R;
      return d.p[0] > x0 && d.p[0] < x1 && d.p[1] > y0 && d.p[1] < y1;
    }));

    const boxDist = (px, py, cx, cy, hw, hh) =>
      Math.hypot(Math.max(0, Math.abs(px - cx) - hw), Math.max(0, Math.abs(py - cy) - hh));

    // Length of segment ab inside the box, by Liang-Barsky clipping.
    const inBox = (a, b, cx, cy, hw, hh) => {
      let t0 = 0, t1 = 1;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const clip = (p, q) => {
        if (Math.abs(p) < 1e-12) return q >= 0;
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
        return true;
      };
      if (clip(-dx, a[0] - (cx - hw)) && clip(dx, (cx + hw) - a[0]) &&
          clip(-dy, a[1] - (cy - hh)) && clip(dy, (cy + hh) - a[1]))
        return (t1 - t0) * Math.hypot(dx, dy);
      return 0;
    };

    const cost = (gi, px, py, gapCost, turnCost) => {
      const m = marks[gi];
      const own = boxDist(m.x, m.y, px, py, m.hw, m.hh);
      let clash = 0, steal = 0, cover = 0, line = 0;
      for (const k of near[gi]) {
        const r = marks[k];
        const rd = boxDist(r.x, r.y, px, py, m.hw, m.hh);
        if (own + CLEAR - rd > steal) steal = own + CLEAR - rd;
        if (rd < dotR + 0.25) cover = Math.max(cover, dotR + 0.25 - rd);
        if (!r.set) continue;
        const ox = (r.hw + m.hw + 0.3) - Math.abs(r.lx - px);
        const oy = (r.hh + m.hh + 0.3) - Math.abs(r.ly - py);
        if (ox > 0 && oy > 0) clash = Math.max(clash, Math.min(ox, oy));
      }
      for (const [a, b] of nearSegs[gi]) line += inBox(a, b, px, py, m.hw + 0.25, m.hh + 0.2);
      const edge = Math.max(0, m.hw - px, px + m.hw - areaW, m.hh - py, py + m.hh - areaH);
      return clash * W.clash + steal * W.steal + cover * W.cover + line * W.line +
             gapCost * W.reach + turnCost * W.turn + edge * W.edge;
    };

    const choose = gi => {
      const m = marks[gi];
      let best = Infinity, bx = m.lx, by = m.ly;
      for (const g of GAPS) {
        for (const [c, s] of DIRS) {
          const reachOut = dotR + g * fs + Math.abs(c) * m.hw + Math.abs(s) * m.hh;
          const px = m.x + c * reachOut, py = m.y + s * reachOut;
          const turn = (1 - (c * m.pref[0] + s * m.pref[1])) * fs;
          const score = cost(gi, px, py, (g - GAPS[0]) * fs, turn);
          if (score < best) { best = score; bx = px; by = py; }
        }
      }
      m.lx = Math.min(Math.max(bx, m.hw), areaW - m.hw);
      m.ly = Math.min(Math.max(by, m.hh), areaH - m.hh);
      m.set = true;
    };

    for (let gi = 0; gi < marks.length; gi++) choose(gi);
    for (let pass = 0; pass < REFINE_PASSES; pass++)
      for (let gi = 0; gi < marks.length; gi++) choose(gi);
    return marks;
  }

  // ---------------------------------------------------------------- render
  const f2 = v => v.toFixed(2);
  const svgWrap = (inner, w, h) =>
    `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" ` +
    `xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

  function renderPuzzle(model, preset, areaW, areaH) {
    const fs = preset.num;
    const marks = layout(model, preset, areaW, areaH);
    let dotsSvg = "", text = "";
    for (const m of marks) {
      dotsSvg += `<circle cx="${f2(m.x)}" cy="${f2(m.y)}" r="${preset.dot}"/>`;
      // A dot where a new line starts is ringed, and that number is bold:
      // lift the pencil, find it, and carry on from there.
      if (m.labels.some(l => l.start))
        dotsSvg += `<circle cx="${f2(m.x)}" cy="${f2(m.y)}" r="${f2(preset.dot * 3)}" fill="none" stroke="#000" stroke-width="0.28"/>`;
      const spans = m.labels.map((l, i) =>
        (i ? "/" : "") + (l.start ? `<tspan font-weight="700">${l.n}</tspan>` : l.n)).join("");
      text += `<text x="${f2(m.lx)}" y="${f2(m.ly)}">${spans}</text>`;
    }
    return svgWrap(
      `<g fill="#000">${dotsSvg}</g>` +
      `<g font-size="${fs}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="ui-sans-serif, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" fill="#000">${text}</g>`,
      areaW, areaH);
  }

  function renderAnswer(model, areaW, areaH) {
    const d = model.seq.map(ids =>
      ids.map((id, k) => `${k ? "L" : "M"}${f2(model.dots[id].p[0])} ${f2(model.dots[id].p[1])}`).join("")).join("");
    return svgWrap(`<path d="${d}" fill="none" stroke="#111" stroke-width="0.6" ` +
                   `stroke-linejoin="round" stroke-linecap="round"/>`, areaW, areaH);
  }

  // Aspect ratio of the drawing as it appears at this difficulty, to choose
  // the paper.
  function aspectOf(subject, preset) {
    const b = bboxOf(LineArt.strokes(LineArt.prepare(subject), preset.level));
    return b.w / b.h;
  }

  window.Puzzle = { PRESETS, hashSeed, mulberry32, build, renderPuzzle, renderAnswer, aspectOf, layout };
})();

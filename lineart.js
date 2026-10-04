// Line-art engine. Turns a subject from art.js into the strokes a solver
// draws, for one difficulty level. Shared by index.html and tools/preview.html.
//
// A subject is a stack of layers painted back to front, the way an illustrator
// inks a cartoon: a filled shape hides whatever was drawn behind it, and only
// the visible part of each outline survives. So a leg in front of a body cuts
// the body's outline where it crosses, the ear in front of a head leaves the
// head's outline ending exactly on the ear's edge, and nobody has to work out
// those junctions by hand.
//
// Layers in the same group are a union: they hide each other's outline but
// not their own shared silhouette, so a head, a neck and a body can be built
// from three simple shapes and still come out as one outline.
//
// Nothing here depends on fonts or the device: the drawings are numbers, so a
// seed draws the same puzzle everywhere.
(() => {
  "use strict";

  // ------------------------------------------------------------ path parsing
  // SVG path syntax, absolute and relative: M L H V C S Q T A Z. Curves are
  // flattened finely here; deciding where the dots go happens much later.
  function parsePath(d, step) {
    const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
    const subs = [];
    let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
    let cx = 0, cy = 0, qx = 0, qy = 0, prev = "";
    let cur = null;
    const num = () => parseFloat(toks[i++]);
    const start = (px, py) => { cur = { pts: [[px, py]], closed: false }; subs.push(cur); };
    const line = (px, py) => { cur.pts.push([px, py]); };

    const cubic = (x1, y1, x2, y2, x3, y3) => {
      const len = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
      const n = Math.max(2, Math.ceil(len / step));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        line(u*u*u*x + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3,
             u*u*u*y + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3);
      }
    };

    const arc = (rx, ry, phi, large, sweep, x2, y2) => {
      // Endpoint to centre parameterisation, as in the SVG spec, appendix F.6.
      if (rx === 0 || ry === 0) { line(x2, y2); return; }
      rx = Math.abs(rx); ry = Math.abs(ry);
      const r = phi * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
      const dx = (x - x2) / 2, dy = (y - y2) / 2;
      const x1p = co * dx + si * dy, y1p = -si * dx + co * dy;
      const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const num2 = rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p;
      let f = Math.sqrt(Math.max(0, num2 / (rx*rx*y1p*y1p + ry*ry*x1p*x1p)));
      if (large === sweep) f = -f;
      const cxp = f * rx * y1p / ry, cyp = -f * ry * x1p / rx;
      const ccx = co * cxp - si * cyp + (x + x2) / 2;
      const ccy = si * cxp + co * cyp + (y + y2) / 2;
      const ang = (ux, uy, vx, vy) => {
        const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        return a;
      };
      const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
      let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI;
      if (sweep && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(2, Math.ceil(Math.abs(dt) * Math.max(rx, ry) / step));
      for (let k = 1; k <= n; k++) {
        const t = t1 + dt * k / n;
        const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
        line(co * ex - si * ey + ccx, si * ex + co * ey + ccy);
      }
    };

    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase() && cmd !== "z";
      const ox = rel ? x : 0, oy = rel ? y : 0;
      switch (cmd.toUpperCase()) {
        case "M": {
          x = num() + ox; y = num() + oy; sx = x; sy = y; start(x, y);
          cmd = rel ? "l" : "L";   // extra pairs after a moveto are linetos
          break;
        }
        case "L": x = num() + ox; y = num() + oy; line(x, y); break;
        case "H": x = num() + ox; line(x, y); break;
        case "V": y = num() + oy; line(x, y); break;
        case "C": {
          const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy;
          const x3 = num() + ox, y3 = num() + oy;
          cubic(x1, y1, x2, y2, x3, y3); cx = x2; cy = y2; x = x3; y = y3; break;
        }
        case "S": {
          const x1 = /[CS]/i.test(prev) ? 2 * x - cx : x, y1 = /[CS]/i.test(prev) ? 2 * y - cy : y;
          const x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
          cubic(x1, y1, x2, y2, x3, y3); cx = x2; cy = y2; x = x3; y = y3; break;
        }
        case "Q": {
          const x1 = num() + ox, y1 = num() + oy, x3 = num() + ox, y3 = num() + oy;
          cubic(x + 2/3 * (x1 - x), y + 2/3 * (y1 - y), x3 + 2/3 * (x1 - x3), y3 + 2/3 * (y1 - y3), x3, y3);
          qx = x1; qy = y1; x = x3; y = y3; break;
        }
        case "T": {
          const x1 = /[QT]/i.test(prev) ? 2 * x - qx : x, y1 = /[QT]/i.test(prev) ? 2 * y - qy : y;
          const x3 = num() + ox, y3 = num() + oy;
          cubic(x + 2/3 * (x1 - x), y + 2/3 * (y1 - y), x3 + 2/3 * (x1 - x3), y3 + 2/3 * (y1 - y3), x3, y3);
          qx = x1; qy = y1; x = x3; y = y3; break;
        }
        case "A": {
          const rx = num(), ry = num(), phi = num(), large = num(), sweep = num();
          const x2 = num() + ox, y2 = num() + oy;
          arc(rx, ry, phi, !!large, !!sweep, x2, y2); x = x2; y = y2; break;
        }
        case "Z": {
          if (cur) {
            const f = cur.pts[0], l = cur.pts[cur.pts.length - 1];
            if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) cur.pts.pop();
            cur.closed = true;
          }
          x = sx; y = sy; break;
        }
        default: i++;   // unknown token: skip rather than hang
      }
      prev = cmd;
    }
    return subs.filter(s => s.pts.length > 1);
  }

  function ellipsePts(cx, cy, rx, ry, rot, step) {
    const n = Math.max(12, Math.ceil(2 * Math.PI * Math.max(rx, ry) / step));
    const r = (rot || 0) * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    const pts = [];
    // Start at the left-hand extreme rather than angle zero, so the seam of a
    // closed outline sits somewhere unremarkable.
    for (let k = 0; k < n; k++) {
      const t = Math.PI + (k / n) * 2 * Math.PI;
      const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      pts.push([cx + co * ex - si * ey, cy + si * ex + co * ey]);
    }
    return [{ pts, closed: true }];
  }

  // ---------------------------------------------------------------- geometry
  function bboxOf(subs) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of subs) for (const [x, y] of s.pts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
  }

  // Even-odd over every subpath, so a shape can carry its own holes.
  //
  // This test runs for every point of every outline against every shape in
  // front of it, which made it nearly all of the time spent drawing a
  // puzzle. So each shape's edges are sorted once into horizontal bands, and
  // a point only crosses the edges in its own band.
  const BANDS = 64;
  function bandsOf(layer) {
    const b = layer.box, h = (b.y1 - b.y0) / BANDS || 1;
    const bands = Array.from({ length: BANDS }, () => []);
    for (const s of layer.subs) {
      const pts = s.pts;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const lo = Math.min(pts[i][1], pts[j][1]), hi = Math.max(pts[i][1], pts[j][1]);
        const k0 = Math.max(0, Math.floor((lo - b.y0) / h)), k1 = Math.min(BANDS - 1, Math.floor((hi - b.y0) / h));
        for (let k = k0; k <= k1; k++) bands[k].push(pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      }
    }
    return { bands, h };
  }

  function inside(p, layer) {
    const b = layer.box;
    if (p[0] < b.x0 || p[0] > b.x1 || p[1] < b.y0 || p[1] > b.y1) return false;
    if (!layer.index) layer.index = bandsOf(layer);
    const { bands, h } = layer.index;
    const e = bands[Math.min(BANDS - 1, Math.floor((p[1] - b.y0) / h))];
    let c = false;
    for (let k = 0; k < e.length; k += 4) {
      const xi = e[k], yi = e[k + 1], xj = e[k + 2], yj = e[k + 3];
      if ((yi > p[1]) !== (yj > p[1]) &&
          p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // ------------------------------------------------------------------ compile
  // Flatten every layer of a subject once. The result is reused for each
  // difficulty level, which only changes which layers take part.
  const prepared = new WeakMap();
  function prepare(subject) {
    if (!prepared.has(subject)) prepared.set(subject, flatten(subject));
    return prepared.get(subject);
  }

  function flatten(subject) {
    const [vw, vh] = subject.size;
    const step = Math.max(vw, vh) / 900;
    const layers = subject.layers.map(L => {
      const subs = L.kind === "ellipse" ? ellipsePts(L.cx, L.cy, L.rx, L.ry, L.rot, step) : parsePath(L.d, step);
      return Object.assign({}, L, { subs, box: bboxOf(subs) });
    });
    return { name: subject.name, size: subject.size, step, layers };
  }

  function activeAt(L, level) {
    return (L.lv || 1) <= level && level <= (L.upto || 9);
  }

  // The visible strokes at one level, in the subject's own coordinates. Each
  // stroke is { pts, closed }; an open stroke's ends are where it disappears
  // behind something, or where the artist ended it. Treat the result as
  // read-only: it is cached, since every new seed for the same subject and
  // difficulty draws the same lines.
  function strokes(prep, level) {
    prep.cache = prep.cache || {};
    return prep.cache[level] || (prep.cache[level] = computeStrokes(prep, level));
  }

  function computeStrokes(prep, level) {
    const active = prep.layers.filter(L => activeAt(L, level));
    const out = [];

    active.forEach((L, ai) => {
      if (L.mask) return;   // hides things but is never drawn itself

      // Who can hide this layer: any fill in front of it, plus any other
      // member of its own group wherever it sits in the stack.
      const occ = active.filter((M, bi) =>
        M !== L && M.fill && (bi > ai || (L.g && M.g === L.g)));
      // A clipped layer - spots, scales, wrinkles - only shows inside its
      // group, so a texture can be drawn loosely and trimmed to the body.
      const clip = L.clip ? active.filter(M => M.fill && M.g === L.clip) : null;
      const hidden = p => occ.some(M => inside(p, M)) || (clip && !clip.some(M => inside(p, M)));

      for (const sub of L.subs) {
        const pts = resample(sub.pts, sub.closed, prep.step * 0.6);
        out.push(...visibleRuns(pts, sub.closed, hidden));
      }
    });
    return out.filter(s => s.pts.length > 1 && polyLen(s.pts, s.closed) > prep.step * 3);
  }

  function polyLen(pts, closed) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
    if (closed) d += Math.hypot(pts[0][0] - pts[pts.length-1][0], pts[0][1] - pts[pts.length-1][1]);
    return d;
  }

  // Even spacing, so the visibility test sees every stretch of the outline at
  // the same resolution however coarsely the artist's segments were drawn.
  function resample(pts, closed, step) {
    const src = closed ? pts.concat([pts[0]]) : pts;
    const out = [src[0]];
    for (let i = 1; i < src.length; i++) {
      const [ax, ay] = src[i-1], [bx, by] = src[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
    }
    if (closed) out.pop();
    return out;
  }

  // Split a polyline into the runs that are not hidden. Where a run ends
  // behind something, the crossing is found by bisection so that it lands on
  // the occluder's own outline - that is what makes a junction meet exactly.
  function visibleRuns(pts, closed, hidden) {
    const n = pts.length;
    const vis = pts.map(p => !hidden(p));
    if (vis.every(Boolean)) return [{ pts, closed }];
    if (!vis.some(Boolean)) return [];

    const edge = (a, b, aVis) => {
      // a and b straddle the boundary; return the last point that is still
      // on the visible side.
      let lo = 0, hi = 1;
      for (let k = 0; k < 18; k++) {
        const m = (lo + hi) / 2;
        const p = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
        if (!hidden(p) === aVis) lo = m; else hi = m;
      }
      return [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo];
    };

    // For a closed loop, start the walk at a hidden point so no visible run
    // is split across the seam.
    let s0 = 0;
    if (closed) while (vis[s0]) s0++;
    const runs = [];
    let run = null;
    const total = closed ? n + 1 : n;
    for (let k = 0; k < total; k++) {
      const i = (s0 + k) % n;
      const prev = k > 0 ? (s0 + k - 1) % n : -1;
      if (vis[i]) {
        if (!run) {
          run = [];
          if (prev >= 0) run.push(edge(pts[i], pts[prev], true));
        }
        run.push(pts[i]);
      } else if (run) {
        run.push(edge(pts[prev], pts[i], true));
        runs.push({ pts: run, closed: false });
        run = null;
      }
    }
    if (run) runs.push({ pts: run, closed: false });
    return runs;
  }

  // Scale and shift absolute path data: x' = sx x + tx, y' = sy y + ty. A
  // negative scale mirrors, so symmetric drawings - wings, ears, flippers -
  // are written once, and a shape can be reused at another size.
  function transform(d, sx, sy, tx, ty) {
    const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
    const out = [];
    const flip = sx * sy < 0;
    let cmd = "", i = 0;
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) {
        cmd = toks[i++];
        if (cmd !== cmd.toUpperCase() && cmd !== "z") throw new Error("transform needs absolute path data: " + cmd);
        out.push(cmd);
        if (cmd.toUpperCase() === "Z") continue;
      }
      const C = cmd.toUpperCase();
      const n = () => Number(toks[i++]);
      if (C === "A") {
        const rx = n(), ry = n(), phi = n(), large = n(), sweep = n(), x = n(), y = n();
        out.push(rx * Math.abs(sx), ry * Math.abs(sy), flip ? -phi : phi, large,
                 flip ? 1 - sweep : sweep, sx * x + tx, sy * y + ty);
      } else if (C === "H") out.push(sx * n() + tx);
      else if (C === "V") out.push(sy * n() + ty);
      else { const x = n(), y = n(); out.push(sx * x + tx, sy * y + ty); }
    }
    return out.join(" ");
  }

  const mirror = (d, w) => transform(d, -1, 1, w, 0);

  window.LineArt = { prepare, strokes, parsePath, transform, mirror };
})();

// The subjects, drawn by hand as layered shapes. See lineart.js for how a
// stack of shapes becomes the lines a solver draws.
//
// Layers are painted back to front:
//   F(d)         a filled shape from SVG path data: its outline is drawn and
//                it hides anything behind it
//   L(d)         a line: drawn, hides nothing
//   M(d)         a mask: hides what is behind it, never drawn
//   E(cx,cy,rx,ry) / C(cx,cy,r)   a filled ellipse / circle
// Options, as a trailing object:
//   lv: 2        only appears from this difficulty up (1 medium, 2 hard, 3 epic)
//   upto: 1      only appears up to this difficulty
//   g: "body"    layers sharing a group merge into one outline
//   clip: "body" only the part inside that group is drawn - for spots,
//                scales and wrinkles, which can then be drawn loosely
//   fill: false  turns E or C into a ring that hides nothing
//   rot: 20      rotates an ellipse, in degrees
// mx(d, w) mirrors absolute path data about x = w / 2.
//
// Coordinates are whatever is convenient for the drawing; the puzzle scales
// the whole thing to the page. Detail that is small on the drawing belongs at
// a higher level, where the dots are allowed to sit closer together. Each
// level should add enough to the picture to need its extra dots: a harder
// puzzle that only dots the same lines more densely is an easier one.
(() => {
  "use strict";

  const F = (d, o) => Object.assign({ d, fill: true }, o);
  const L = (d, o) => Object.assign({ d, fill: false }, o);
  const M = (d, o) => Object.assign({ d, fill: true, mask: true }, o);
  const E = (cx, cy, rx, ry, o) => Object.assign({ kind: "ellipse", cx, cy, rx, ry, rot: 0, fill: true }, o);
  const C = (cx, cy, r, o) => E(cx, cy, r, r, o);
  const mx = (d, w) => window.LineArt.mirror(d, w);
  const xf = (d, s, tx, ty) => window.LineArt.transform(d, s, s, tx, ty);
  const ring = o => Object.assign({ fill: false }, o);

  // A tuft of grass standing on y, starting at x.
  const tuft = (x, y, o) => L(`M${x} ${y} L${x + 4} ${y - 10} L${x + 7} ${y - 3} L${x + 11} ${y - 12} L${x + 14} ${y}`, o);
  // A gull in flight, centred on x, y.
  const gull = (x, y, s, o) => L(`M${x - 13 * s} ${y} Q${x - 7 * s} ${y - 8 * s} ${x} ${y} Q${x + 7 * s} ${y - 8 * s} ${x + 13 * s} ${y}`, o);
  // A sun with short rays.
  const sun = (x, y, r, o) => {
    const rays = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const c = Math.cos(a), s = Math.sin(a);
      rays.push(L(`M${x + c * r * 1.3} ${y + s * r * 1.3} L${x + c * r * 1.75} ${y + s * r * 1.75}`, o));
    }
    return [C(x, y, r, ring(o)), ...rays];
  };
  // A leaf from its stalk at x, y, len long, pointing at angle a (degrees).
  const leaf = (x, y, len, a, o) => {
    const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const w = len * 0.32, P = (u, v) => `${(x + c * u - s * v).toFixed(1)} ${(y + s * u + c * v).toFixed(1)}`;
    return F(`M${P(0, 0)} C${P(len * 0.3, w)} ${P(len * 0.75, w)} ${P(len, 0)} ` +
             `C${P(len * 0.75, -w)} ${P(len * 0.3, -w)} ${P(0, 0)} Z`, o);
  };
  // Water: a wave line, repeated every 24 units.
  const waveD = (x0, x1, y) => {
    let d = `M${x0} ${y}`;
    for (let x = x0; x < x1; x += 24) d += ` Q${x + 6} ${y - 7} ${x + 12} ${y} Q${x + 18} ${y + 7} ${x + 24} ${y}`;
    return d;
  };
  const waves = (x0, x1, y, o) => L(waveD(x0, x1, y), o);
  // Everything below a wave line is under water: hidden, not drawn.
  const water = (x0, x1, y, depth, o) => {
    const end = x0 + Math.ceil((x1 - x0) / 24) * 24;
    return [M(`${waveD(x0, x1, y)} L${end} ${y + depth} L${x0} ${y + depth} Z`, o), waves(x0, x1, y, o)];
  };
  // An n-pointed star, outer radius R, inner r.
  const star = (cx, cy, R, r, n, rot, o) => {
    let d = "";
    for (let k = 0; k < n * 2; k++) {
      const a = ((rot || 0) - 90) * Math.PI / 180 + (k * Math.PI) / n, rr = k % 2 ? r : R;
      d += `${k ? "L" : "M"}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
    }
    return F(d + "Z", o);
  };

  const fmt = p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  // A tube along a smooth centreline through pts, tapering from width w0 to
  // w1, with a rounded tip: tails, necks, trunks, stems. The start is left
  // open-ended, so begin it inside whatever it grows out of. o.bulge widens
  // the middle, for a bushy tail.
  const tube = (pts, w0, w1, o) => {
    const P = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 16; k++) {
        const t = k / 16, t2 = t * t, t3 = t2 * t;
        P.push([0, 1].map(j => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t +
          (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    P.push(pts[pts.length - 1]);
    const s = [0];
    for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const left = [], right = [];
    let nx = 0, ny = 0, tx = 0, ty = 0, w = w1 / 2;
    P.forEach((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      tx = (b[0] - a[0]) / len; ty = (b[1] - a[1]) / len; nx = -ty; ny = tx;
      const t = s[i] / s[s.length - 1];
      w = (w0 + (w1 - w0) * t + ((o && o.bulge) || 0) * Math.sin(Math.PI * t)) / 2;
      left.push([p[0] + nx * w, p[1] + ny * w]);
      right.push([p[0] - nx * w, p[1] - ny * w]);
    });
    const end = P[P.length - 1], cap = [];
    for (let k = 1; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      cap.push([end[0] + (nx * Math.cos(a) + tx * Math.sin(a)) * w, end[1] + (ny * Math.cos(a) + ty * Math.sin(a)) * w]);
    }
    const ring = left.concat(cap, right.reverse());
    return F("M" + ring.map(fmt).join(" L") + " Z", o);
  };
  // An ellipse with n rounded bumps round its edge: manes, clouds, bushes.
  const bumpy = (cx, cy, rx, ry, n, depth, o) => {
    let d = "";
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * 2 * Math.PI, m = ((k - 0.5) / n) * 2 * Math.PI;
      const p = [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
      d += k === 0 ? `M${fmt(p)}` :
        ` Q${fmt([cx + (rx + depth * 2) * Math.cos(m), cy + (ry + depth * 2) * Math.sin(m)])} ${fmt(p)}`;
    }
    return F(d + " Z", o);
  };
  // An ellipse with n spikes of length len along its edge between angles a0
  // and a1 (degrees, 0 is right, 90 is down) and smooth the rest of the way.
  const spiky = (cx, cy, rx, ry, a0, a1, n, len, o) => {
    const P = (a, r) => [cx + (rx + r) * Math.cos(a * Math.PI / 180), cy + (ry + r) * Math.sin(a * Math.PI / 180)];
    const pts = [];
    for (let k = 0; k <= 2 * n; k++) pts.push(P(a0 + ((a1 - a0) * k) / (2 * n), k % 2 ? len : 0));
    for (let a = a1 + 4; a < a0 + 360; a += 4) pts.push(P(a, 0));
    return F("M" + pts.map(fmt).join(" L") + " Z", o);
  };
  // A flower: n petals round a centre, the petals merged into one outline.
  const flower = (cx, cy, r, n, o) => {
    const g = "flower" + cx + "_" + cy, out = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 360;
      const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
      out.push(E(cx + c * r * 1.25, cy + s * r * 1.25, r * 0.95, r * 0.55, Object.assign({ rot: a, g }, o)));
    }
    out.push(C(cx, cy, r * 0.62, o));
    return out;
  };

  // A wall from top to bottom with n merlons of height h along its top.
  const battlement = (x0, x1, top, bottom, n, h, o) => {
    const w = (x1 - x0) / (2 * n - 1);
    let d = `M${x0} ${bottom} L${x0} ${top}`;
    for (let k = 0; k < 2 * n - 1; k++) {
      const y = k % 2 ? top + h : top;
      if (k > 0) d += ` L${(x0 + k * w).toFixed(1)} ${y}`;
      d += ` L${(x0 + (k + 1) * w).toFixed(1)} ${y}`;
    }
    return F(d + ` L${x1} ${bottom} Z`, o);
  };
  // A windmill sail: the stock from the hub out to r0, then a lattice sail
  // from r0 to r1, w wide, on one side of the stock.
  const sail = (cx, cy, ang, r0, r1, w, o) => {
    const a = ang * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], n = [-u[1], u[0]];
    const P = (r, s) => fmt([cx + u[0] * r + n[0] * s, cy + u[1] * r + n[1] * s]);
    const out = [L(`M${P(0, 0)} L${P(r0, 0)}`, o), F(`M${P(r0, 0)} L${P(r1, 0)} L${P(r1, w)} L${P(r0, w)} Z`, o)];
    let bars = "";
    for (let k = 1; k < 4; k++) { const r = r0 + ((r1 - r0) * k) / 4; bars += `M${P(r, 0)} L${P(r, w)} `; }
    out.push(L(bars, Object.assign({}, o, { lv: Math.max(2, (o && o.lv) || 1) })));
    out.push(L(`M${P(r0, w / 2)} L${P(r1, w / 2)}`, Object.assign({}, o, { lv: 3 })));
    return out;
  };
  // A tulip on a stem standing at x, y.
  const tulip = (x, y, o) => [
    L(`M${x} ${y} L${x} ${y - 22}`, o),
    F(`M${x - 7} ${y - 22} L${x - 8} ${y - 36} L${x - 3} ${y - 30} L${x} ${y - 38} L${x + 3} ${y - 30} ` +
      `L${x + 8} ${y - 36} L${x + 7} ${y - 22} C${x + 4} ${y - 18} ${x - 4} ${y - 18} ${x - 7} ${y - 22} Z`, o)
  ];

  const ART = [];
  const art = (name, size, layers) => ART.push({ name, size, layers: layers.flat() });

  // ------------------------------------------------------------------ animals

  art("elephant", [230, 165], [
    gull(150, 12, 0.7, { lv: 3 }), gull(176, 20, 0.5, { lv: 3 }),
    F("M108 100 L110 150 C110 155 132 155 132 150 L132 100 Z"),                       // far front leg
    F("M192 100 L194 150 C194 155 212 155 212 150 L212 100 Z"),                       // far hind leg
    L("M214 76 C223 90 223 104 219 116"),                                              // tail
    F("M219 114 C224 118 224 126 219 129 C214 126 214 118 219 114 Z", { lv: 2 }),     // tail tuft
    F("M75 45 C100 22 160 22 192 40 C218 55 222 95 210 118 C195 128 105 128 85 120 C70 100 65 65 75 45 Z", { g: "b" }),
    F("M72 100 L73 152 C73 158 99 158 99 152 L100 104 Z", { g: "b" }),                 // near front leg
    F("M160 95 L160 152 C160 158 186 158 186 152 L194 95 Z", { g: "b" }),              // near hind leg
    F("M60 22 C82 18 100 32 100 55 C100 75 88 90 74 97 C67 113 64 132 55 146 " +
      "C50 154 42 158 36 153 L39 147 C44 146 47 138 47 126 C47 110 37 98 31 86 " +
      "C24 70 30 34 60 22 Z", { g: "b" }),                                             // head and trunk
    L("M150 50 C160 58 165 70 166 82", { lv: 3 }),                                     // haunch
    L("M70 130 C78 134 92 134 104 130 M156 130 C166 134 180 134 196 129", { lv: 3, clip: "b" }), // knees
    F("M80 32 C100 22 130 30 134 55 C138 82 126 104 106 110 C94 113 88 104 90 95 " +
      "C92 86 84 80 80 72 C76 60 74 42 80 32 Z"),                                      // ear
    L("M90 41 C106 35 124 43 126 60 C128 80 120 96 108 102", { lv: 2 }),               // ear fold
    F("M66 95 C60 105 50 111 38 110 C46 106 53 98 57 89 Z"),                          // tusk
    C(52, 52, 4.5, ring()),                                                            // eye
    L("M40 103 C46 107 53 107 60 103", { lv: 3, clip: "b" }),                          // trunk creases
    L("M40 116 C46 120 54 120 62 116", { lv: 2, clip: "b" }),
    L("M42 129 C47 132 53 132 60 128", { lv: 3, clip: "b" }),
    L("M77 156 C77 151 84 151 84 156", { lv: 3 }),                                     // toenails
    L("M87 156 C87 151 94 151 94 156", { lv: 3 }),
    L("M164 156 C164 151 171 151 171 156", { lv: 3 }),
    L("M174 156 C174 151 181 151 181 156", { lv: 3 }),
    tuft(56, 160, { lv: 2 }), tuft(138, 160, { lv: 2 }), tuft(206, 160, { lv: 3 })
  ]);

  art("giraffe", [200, 262], [
    sun(172, 30, 12, { lv: 3 }),
    L("M-4 -6 C0 10 4 26 12 44", { lv: 2 }),                                           // branch
    leaf(-1, 6, 16, 200, { lv: 2 }), leaf(3, 20, 16, -20, { lv: 2 }),
    leaf(6, 31, 14, 210, { lv: 3 }), leaf(-3, -2, 14, -30, { lv: 3 }),
    F("M108 180 L112 252 L123 252 L120 180 Z"),                                        // far legs
    F("M168 178 L176 252 L186 252 L184 172 Z"),
    L("M182 150 C190 165 192 180 192 196"),                                            // tail
    F("M192 194 C197 198 197 208 192 212 C187 208 187 198 192 194 Z"),
    F("M64 42 L71.9 53.1 L67.2 66.8 L79.9 73.6 L76.2 87.8 L89.9 93.6 L87.2 106.8 L100.9 112.1 " +
      "L98.2 124.8 L112.4 129.1 L110.2 140.8 L100 135 L58 52 Z", { lv: 2 }),           // mane
    F("M80 140 C100 128 150 135 172 145 C185 152 186 175 175 185 C160 192 100 192 85 185 " +
      "C72 175 70 150 80 140 Z", { g: "b" }),                                          // body
    F("M76 155 C66 120 52 85 42 55 L62 46 C72 80 92 115 112 140 Z", { g: "b" }),       // neck
    F("M40 30 C52 22 66 28 68 40 C70 50 62 58 52 58 L22 62 C14 63 10 56 14 50 " +
      "C18 44 30 36 40 30 Z", { g: "b" }),                                             // head
    F("M47 30 L45 14 L51 13 L54 29 Z", { g: "b" }), C(48, 12, 4, { g: "b" }),         // ossicones
    F("M56 32 L58 16 L64 17 L62 33 Z", { g: "b" }), C(61, 15, 4, { g: "b" }),
    F("M86 178 L89 255 L101 255 L102 180 Z", { g: "b" }),                              // near legs
    F("M150 178 C158 200 156 215 158 255 L170 255 C170 215 175 195 176 172 Z", { g: "b" }),
    F("M64 36 C72 28 82 26 90 28 C86 34 78 40 66 42 Z"),                               // ear
    L("M37 40 C41 35 48 35 52 40 C48 44 41 44 37 40 Z"),                               // eye
    L("M15 57 C21 59 26 59 31 57", { lv: 2 }),                                         // mouth
    L("M18 50 C19 48 22 48 23 50", { lv: 3 }),                                         // nostril
    // Spots, trimmed to the body
    L("M92 148 L104 145 L108 156 L98 162 L90 158 Z", { lv: 2, clip: "b" }),
    L("M140 148 L156 150 L155 162 L141 163 Z", { lv: 2, clip: "b" }),
    L("M122 166 L138 168 L136 180 L122 180 Z", { lv: 2, clip: "b" }),
    L("M58 82 L68 80 L72 92 L62 94 Z", { lv: 2, clip: "b" }),
    L("M80 122 L92 120 L96 132 L84 134 Z", { lv: 2, clip: "b" }),
    L("M115 146 L130 144 L133 156 L120 160 Z", { lv: 3, clip: "b" }),
    L("M160 155 L172 158 L170 172 L160 170 Z", { lv: 3, clip: "b" }),
    L("M98 168 L112 166 L115 178 L100 180 Z", { lv: 3, clip: "b" }),
    L("M145 168 L155 172 L152 182 L143 180 Z", { lv: 3, clip: "b" }),
    L("M50 64 L60 62 L63 72 L54 74 Z", { lv: 3, clip: "b" }),
    L("M68 102 L80 100 L84 112 L72 115 Z", { lv: 3, clip: "b" }),
    F("M87 244 L102 244 L103 256 L86 256 Z", { lv: 2 }),                               // hooves
    F("M156 244 L171 244 L172 256 L155 256 Z", { lv: 2 }),
    F("M110 242 L124 242 L125 253 L110 253 Z", { lv: 3 }),
    F("M174 242 L187 242 L188 253 L174 253 Z", { lv: 3 }),
    tuft(66, 258, { lv: 2 }), tuft(132, 258, { lv: 3 }), tuft(184, 258, { lv: 2 })
  ]);

  art("cat", [170, 210], [
    F("M118 192 C150 192 160 160 152 134 C148 120 140 116 137 122 C134 128 145 140 143 158 " +
      "C141 176 130 181 116 179 Z"),                                                   // tail
    F("M82 80 C52 90 32 140 37 175 C40 195 62 200 82 200 C102 200 124 195 127 175 " +
      "C132 140 112 90 82 80 Z", { g: "b" }),                                          // body
    L("M69 140 C67 165 67 185 65 202", { clip: "b" }),                                 // front legs
    L("M95 140 C97 165 97 185 99 202", { clip: "b" }),
    L("M50 202 C52 192 62 191 66 202", { lv: 2, clip: "b" }),                          // paws
    L("M98 202 C101 191 110 192 114 202", { lv: 2, clip: "b" }),
    E(82, 72, 42, 35, { g: "h" }),                                                     // head
    F("M44 60 L46 18 L76 42 Z", { g: "h" }),                                           // ears
    F("M120 60 L118 18 L88 42 Z", { g: "h" }),
    L("M52 48 L53 30 L68 42", { lv: 2 }),
    L("M112 48 L111 30 L96 42", { lv: 2 }),
    L("M57 68 C61 61 69 61 73 68 C69 74 61 74 57 68 Z"),                               // eyes
    L("M91 68 C95 61 103 61 107 68 C103 74 95 74 91 68 Z"),
    L("M65 63 C63 66 63 70 65 73 M99 63 C97 66 97 70 99 73", { lv: 3 }),               // pupils
    L("M77 80 L87 80 L82 86 Z", { lv: 2 }),                                            // nose
    L("M82 86 L82 90 C79 94 74 94 72 91 M82 90 C85 94 90 94 92 91", { lv: 2 }),       // mouth
    L("M62 84 L26 78", { lv: 3 }), L("M62 89 L28 95", { lv: 3 }),                      // whiskers
    L("M102 84 L138 78", { lv: 3 }), L("M102 89 L136 95", { lv: 3 }),
    L("M70 113 L76 119 L82 113 L88 119 L94 113", { lv: 3, clip: "b" }),                // chest fur
    C(22, 188, 13, { lv: 2, g: "y" }),                                                 // ball of wool
    L("M10 182 C18 176 28 178 33 184 M9 193 C18 186 30 188 34 196", { lv: 2, clip: "y" }),
    L("M26 200 C36 206 46 206 54 201", { lv: 3 })                                      // loose thread
  ]);

  art("owl", [200, 220], [
    F("M170 8 A32 32 0 0 1 170 72 A38 38 0 0 0 170 8 Z", { lv: 2 }),                  // moon
    L("M14 30 L18 22 L22 30 L30 34 L22 38 L18 46 L14 38 L6 34 Z", { lv: 3 }),           // stars
    L("M186 112 L189 106 L192 112 L198 115 L192 118 L189 124 L186 118 L180 115 Z", { lv: 3 }),
    F("M90 30 C140 30 160 80 158 130 C156 175 130 195 90 195 C50 195 24 175 22 130 " +
      "C20 80 40 30 90 30 Z", { g: "b" }),                                             // body
    F("M35 62 L30 18 L68 40 Z", { g: "b" }),                                           // ear tufts
    F("M145 62 L150 18 L112 40 Z", { g: "b" }),
    F("M90 52 C110 38 145 45 148 75 C150 100 120 115 90 108 C60 115 30 100 32 75 " +
      "C35 45 70 38 90 52 Z"),                                                         // face disc
    C(62, 78, 18), C(118, 78, 18),                                                     // eyes
    C(66, 80, 8, ring()), C(114, 80, 8, ring()),
    F("M82 96 L98 96 L90 116 Z"),                                                      // beak
    F("M26 105 C14 135 24 175 60 186 C47 162 44 132 48 110 Z", { g: "w" }),            // wings
    F("M154 105 C166 135 156 175 120 186 C133 162 136 132 132 110 Z", { g: "w" }),
    L("M20 140 C28 136 38 138 46 144 M22 160 C32 156 42 160 50 166", { lv: 3, clip: "w" }),
    L("M160 140 C152 136 142 138 134 144 M158 160 C148 156 138 160 130 166", { lv: 3, clip: "w" }),
    L("M70 135 Q76 142 82 135 M98 135 Q104 142 110 135 M84 150 Q90 157 96 150", { lv: 2 }),
    L("M70 165 Q76 172 82 165 M98 165 Q104 172 110 165", { lv: 3 }),                   // breast feathers
    F("M0 192 L200 184 L200 198 L0 206 Z"),                                            // branch
    L("M162 189 C168 176 178 170 190 168", { lv: 2 }),                                 // twig
    F("M190 168 C192 158 200 152 210 152 C208 162 200 168 190 168 Z", { lv: 2 }),      // leaves
    F("M178 172 C176 162 168 156 158 158 C162 168 170 172 178 172 Z", { lv: 3 }),
    F("M10 205 C6 214 8 222 16 226 C20 218 18 210 10 205 Z", { lv: 3 }),
    E(68, 193, 4, 7, { lv: 2, g: "f" }), E(77, 194, 4, 7, { lv: 2, g: "f" }),          // talons
    E(103, 194, 4, 7, { lv: 2, g: "f" }), E(112, 193, 4, 7, { lv: 2, g: "f" })
  ]);

  art("penguin", [160, 230], [
    star(16, 22, 8, 3, 6, 0, { lv: 3 }), star(146, 30, 7, 2.6, 6, 0, { lv: 3 }),       // snow
    star(10, 62, 5, 2, 6, 0, { lv: 3 }),
    F("M30 92 C14 110 6 140 10 165 C20 156 28 136 34 116 Z"),                          // flippers
    F(mx("M30 92 C14 110 6 140 10 165 C20 156 28 136 34 116 Z", 160)),
    F("M80 14 C120 14 140 70 140 130 C140 182 115 206 80 206 C45 206 20 182 20 130 " +
      "C20 70 40 14 80 14 Z"),                                                         // body
    F("M80 50 C90 36 112 38 114 58 C116 72 112 80 118 95 C126 122 124 178 80 198 " +
      "C36 178 34 122 42 95 C48 80 44 72 46 58 C48 38 70 36 80 50 Z", { g: "f" }),     // face and belly
    C(64, 62, 5, ring()), C(96, 62, 5, ring()),                                        // eyes
    F("M70 76 C75 71 85 71 90 76 L80 90 Z"),                                           // beak
    L("M70 76 C75 79 85 79 90 76", { lv: 3 }),
    L("M62 130 L67 135 L72 130 M88 130 L93 135 L98 130 M75 150 L80 155 L85 150", { lv: 3, clip: "f" }),
    L("M62 170 L67 175 L72 170 M88 170 L93 175 L98 170", { lv: 3, clip: "f" }),
    F("M48 198 C38 204 38 214 48 214 L74 214 C78 210 74 202 66 198 Z"),                // feet
    F(mx("M48 198 C38 204 38 214 48 214 L74 214 C78 210 74 202 66 198 Z", 160)),
    F("M0 210 L160 210 L152 226 L8 226 Z", { lv: 2 }),                                  // ice floe
    L("M24 212 L32 218 L28 224 M128 212 L134 218", { lv: 3 }),
    F(xf("M120 204 C130 192 152 192 162 204 L176 194 L176 214 L162 204 C152 216 130 216 120 204 Z", 0.55, 58, 92),
      { lv: 3 }),                                                                      // fish
  ]);

  art("rabbit", [190, 220], [
    E(84, 40, 10, 36, { rot: 18 }),                                                    // far ear
    C(165, 180, 13),                                                                   // tail
    F("M70 112 C42 122 34 178 48 200 C58 212 128 214 152 200 C172 186 168 140 142 122 " +
      "C122 106 92 104 70 112 Z", { g: "b" }),                                         // body
    E(60, 92, 32, 25, { rot: -12, g: "b" }),                                           // head
    E(66, 38, 11, 38, { rot: 8, g: "b" }),                                             // near ear
    E(112, 206, 30, 8, { g: "b" }),                                                    // hind foot
    E(66, 36, 5, 26, { rot: 8, fill: false, lv: 2 }),                                  // inner ear
    C(52, 86, 4.5, ring()),                                                            // eye
    C(53, 86, 1.8, ring({ lv: 3 })),
    L("M29 93 L35 93 L32 97 Z", { lv: 2 }),                                            // nose
    L("M32 97 C32 101 36 103 40 101", { lv: 2 }),
    L("M38 95 L12 88 M38 99 L12 103", { lv: 3 }),                                      // whiskers
    L("M58 140 C54 175 52 195 52 215", { clip: "b" }),                                 // front legs
    L("M78 145 C79 178 80 195 82 215", { clip: "b" }),
    L("M112 168 C116 140 150 134 158 160 C162 178 156 196 146 215", { clip: "b" }),     // haunch
    L("M46 132 L50 138 L46 144", { lv: 3 }),
    L("M18 168 L6 142 M18 168 L20 138 M18 168 L32 144", { lv: 3 }),                   // carrot
    F("M18 216 C10 200 4 184 5 172 C10 165 26 165 31 172 C32 184 26 200 18 216 Z", { lv: 3 }),
    L("M6 182 L14 184 M26 194 L20 196", { lv: 3 }),
    tuft(124, 214, { lv: 2 }), tuft(160, 214, { lv: 2 })
  ]);

  art("butterfly", [220, 180], [
    F("M106 92 C80 96 46 106 40 134 C36 158 58 174 80 166 C98 158 105 125 106 104 Z", { g: "hw" }),
    F(mx("M106 92 C80 96 46 106 40 134 C36 158 58 174 80 166 C98 158 105 125 106 104 Z", 220), { g: "hw" }),
    F("M106 72 C84 34 44 6 18 18 C2 28 6 68 26 88 C48 102 88 98 106 88 Z", { g: "fw" }),
    F(mx("M106 72 C84 34 44 6 18 18 C2 28 6 68 26 88 C48 102 88 98 106 88 Z", 220), { g: "fw" }),
    C(52, 44, 11, ring()), C(168, 44, 11, ring()),                                     // wing spots
    C(70, 140, 8, ring({ lv: 2 })), C(150, 140, 8, ring({ lv: 2 })),
    L("M100 76 C80 46 48 24 26 30 C14 38 16 64 32 80", { lv: 2 }),                     // wing borders
    L(mx("M100 76 C80 46 48 24 26 30 C14 38 16 64 32 80", 220), { lv: 2 }),
    C(22, 52, 4, ring({ lv: 3 })), C(198, 52, 4, ring({ lv: 3 })),
    C(80, 26, 4, ring({ lv: 3 })), C(140, 26, 4, ring({ lv: 3 })),
    L("M104 100 C80 110 60 124 52 146", { lv: 3, clip: "hw" }),                        // veins
    L(mx("M104 100 C80 110 60 124 52 146", 220), { lv: 3, clip: "hw" }),
    L("M104 84 C84 86 60 82 40 74", { lv: 3, clip: "fw" }),
    L(mx("M104 84 C84 86 60 82 40 74", 220), { lv: 3, clip: "fw" }),
    F("M110 44 C115 44 117 62 117 92 C117 128 114 146 110 146 C106 146 103 128 103 92 " +
      "C103 62 105 44 110 44 Z", { g: "body" }),
    C(110, 38, 8, { g: "body" }),
    L("M100 104 L120 104 M100 118 L120 118 M100 132 L120 132", { lv: 3, clip: "body" }),
    L("M106 32 C100 18 92 10 82 10"), L(mx("M106 32 C100 18 92 10 82 10", 220)),       // antennae
    C(79, 10, 3.5, { lv: 2 }), C(141, 10, 3.5, { lv: 2 })
  ]);

  art("turtle", [220, 140], [
    sun(196, 12, 11, { lv: 3 }),
    F("M82 98 L82 124 C88 127 98 127 102 124 L100 98 Z"),                              // far legs
    F("M182 98 L184 122 C190 125 200 125 204 122 L198 98 Z"),
    F("M60 98 C56 110 52 122 50 128 C58 132 72 132 78 128 C76 118 76 108 78 98 Z"),    // near legs
    F("M160 98 C158 110 156 122 154 128 C162 132 176 132 182 128 C180 118 180 108 182 98 Z"),
    F("M196 92 L214 98 L196 100 Z"),                                                   // tail
    F("M58 86 C40 80 30 70 22 66 C10 60 2 66 2 76 C2 86 12 92 24 90 C34 92 46 96 56 98 Z"), // head
    C(16, 72, 3.5, ring()),
    L("M4 81 C10 83 15 83 20 81", { lv: 2 }),
    F("M50 95 C55 40 95 20 125 20 C160 20 190 45 195 95 Z", { g: "s" }),               // shell
    L("M100 55 L125 42 L150 55 L146 82 L104 82 Z", { clip: "s" }),                     // scutes
    L("M100 55 L76 38 M125 42 L125 18 M150 55 L174 38", { lv: 2, clip: "s" }),
    L("M104 82 L70 96 M146 82 L180 96", { lv: 2, clip: "s" }),
    L("M88 47 L64 70 L58 96 M162 47 L186 70 L192 96", { lv: 3, clip: "s" }),
    F("M42 96 C42 90 46 88 52 88 L190 88 C196 88 200 92 199 97 C198 102 194 104 188 104 " +
      "L52 104 C46 104 42 101 42 96 Z"),                                               // rim
    L("M70 88 L70 104 M100 88 L100 104 M130 88 L130 104 M160 88 L160 104", { lv: 3 }),
    tuft(30, 132, { lv: 2 }), tuft(120, 132, { lv: 2 }), tuft(206, 132, { lv: 3 })
  ]);

  art("whale", [240, 170], [
    sun(130, 14, 8, { lv: 3 }),
    gull(166, 26, 0.6, { lv: 3 }),
    F("M15 95 C15 55 55 38 100 40 C140 42 168 62 186 70 C196 62 200 52 202 44 L208 44 " +
      "C210 56 206 70 198 82 C180 112 150 132 100 132 C50 132 15 125 15 95 Z", { g: "b" }),
    F("M205 50 C196 40 190 28 186 16 C198 20 204 28 206 36 C210 26 218 18 232 14 " +
      "C228 28 220 42 210 50 Z", { g: "b" }),                                          // flukes
    L("M8 97 C28 101 46 100 58 94", { clip: "b" }),                                    // mouth
    L("M10 106 C40 120 100 126 150 117 C172 111 186 98 198 84", { clip: "b" }),        // belly
    L("M24 117 C56 128 100 131 140 124", { lv: 3, clip: "b" }),                        // grooves
    L("M44 125 C76 132 106 133 126 129", { lv: 3, clip: "b" }),
    C(52, 80, 4.5, ring()),                                                            // eye
    F("M84 112 C96 120 102 134 96 146 C86 140 78 126 76 114 Z"),                       // fin
    L("M44 34 C42 24 36 16 26 10"), L("M48 34 L48 6"), L("M52 34 C54 24 60 16 70 10"), // spout
    C(22, 20, 3, ring({ lv: 3 })), C(74, 20, 3, ring({ lv: 3 })),
    waves(8, 224, 152, { lv: 2 }),
    waves(32, 200, 164, { lv: 3 })
  ]);

  art("fish", [240, 150], [

    F("M175 75 C190 55 205 35 230 25 C222 50 222 100 230 125 C205 115 190 95 175 75 Z", { g: "t" }), // tail
    F("M80 42 C95 15 130 5 160 20 C158 35 160 45 165 55 L120 60 Z", { g: "d" }),     // dorsal fin
    F("M118 108 C128 128 148 134 160 128 C155 118 150 110 150 102 Z", { lv: 2 }),     // anal fin
    F("M20 75 C40 35 110 25 180 70 C185 74 185 78 180 82 C110 125 40 115 20 75 Z", { g: "f" }), // body
    L("M21 79 C26 82 30 82 34 79"),                                                    // mouth
    L("M62 48 C73 62 73 92 60 104", { clip: "f" }),                                    // gill
    C(42, 66, 6.5, ring()),                                                            // eye
    C(43, 66, 2.6, ring({ lv: 3 })),
    F("M76 88 C89 81 106 85 113 96 C101 102 87 102 76 88 Z", { lv: 2 }),              // pectoral fin
    L("M182 72 L224 34 M184 76 L226 76 M182 80 L224 116", { lv: 3, clip: "t" }),      // tail rays
    L("M95 52 C101 58 101 66 95 72 M95 78 C101 84 101 92 95 98", { lv: 2, clip: "f" }), // scales
    L("M120 55 C126 61 126 69 120 75 M120 80 C126 86 126 94 120 100", { lv: 3, clip: "f" }),
    L("M145 62 C150 67 150 74 145 79 M145 84 C150 89 150 93 146 97", { lv: 3, clip: "f" }),
    L("M100 40 L104 0 M120 36 L126 0 M140 36 L146 0", { lv: 3, clip: "d" }),           // fin rays
    C(14, 50, 5, ring({ lv: 2 })),                                                     // bubbles
    C(18, 26, 7, ring({ lv: 2 })),
    C(30, 6, 4.5, ring({ lv: 3 })), C(196, 18, 5, ring({ lv: 3 })), C(210, 6, 3.5, ring({ lv: 3 })),
    C(24, 112, 4, ring({ lv: 3 })), C(40, 126, 5, ring({ lv: 3 }))
  ]);

  art("snail", [220, 150], [
    L("M86 142 C82 128 84 116 80 106", { lv: 3 }),                                    // grass
    L("M47 86 L38 52 M60 83 L66 50"),                                                  // eye stalks
    C(37, 48, 5), C(67, 46, 5),
    F("M30 140 C25 125 30 100 45 88 C55 80 68 82 72 95 C76 110 90 120 120 122 L200 122 " +
      "C210 124 214 132 208 138 C200 142 60 142 30 140 Z", { g: "b" }),                // body
    C(140, 76, 46),                                                                    // shell
    L("M138 76 a7 7 0 0 1 14 0 a14 14 0 0 1 -28 0 a21 21 0 0 1 42 0 a28 28 0 0 1 -56 0 " +
      "a35 35 0 0 1 70 0"),                                                            // spiral
    L("M48 100 C52 104 58 104 62 100", { lv: 2 }),                                     // smile
    C(52, 92, 2.6, ring({ lv: 3 })),
    F("M2 142 C0 120 12 104 30 104 C30 124 20 138 2 142 Z", { lv: 2 }),                // leaf
    L("M2 142 C8 130 16 118 28 106", { lv: 3 }),
    F("M200 140 L202 110 L212 110 L214 140 Z", { lv: 3 }),                             // mushroom
    F("M188 112 C188 90 226 90 226 112 Z", { lv: 3 }),
    C(200, 102, 3.5, ring({ lv: 3 })), C(214, 100, 3, ring({ lv: 3 })),
    tuft(84, 146, { lv: 2 }), tuft(150, 146, { lv: 3 })
  ]);

  art("dog", [220, 170], [
    F("M86 104 L88 146 C88 151 100 151 102 146 L104 104 Z"),                           // far legs
    F("M176 100 L182 146 C182 151 194 151 196 146 L192 98 Z"),
    F("M176 72 C186 58 192 40 188 22 C198 32 202 50 196 66 C192 76 186 82 180 86 Z"), // tail
    F("M60 70 C80 60 150 60 178 68 C192 74 194 100 184 112 C170 120 90 120 70 112 " +
      "C56 104 52 80 60 70 Z", { g: "b" }),                                            // body
    F("M62 100 L60 150 C60 156 76 156 76 150 L80 100 Z", { g: "b" }),                  // near legs
    F("M158 100 C164 120 162 135 156 150 C156 156 172 156 172 150 C178 130 184 115 182 96 Z", { g: "b" }),
    F("M46 28 C60 24 74 30 76 44 L80 72 L44 82 C34 80 24 78 14 76 C6 74 2 68 4 62 " +
      "C6 56 12 54 20 53 C28 52 32 46 34 38 C36 32 40 29 46 28 Z", { g: "b" }),         // head
    L("M110 64 C118 56 136 58 140 66 C142 76 130 82 118 78 C110 76 106 70 110 64 Z", { lv: 2, clip: "b" }),
    L("M150 90 C160 86 172 90 176 100 C178 110 168 114 158 110 C150 106 146 96 150 90 Z", { lv: 3, clip: "b" }),
    F("M54 32 C66 28 74 36 72 50 C70 62 64 70 58 68 C52 66 50 56 50 46 C50 40 50 34 54 32 Z"), // ear
    C(38, 42, 3.5, ring()),                                                            // eye
    C(6, 60, 4.5),                                                                     // nose
    L("M10 70 C16 74 24 74 30 70", { lv: 2 }),                                         // mouth
    F("M0 150 C-4 146 -10 148 -10 153 C-14 154 -14 160 -10 161 C-8 166 -2 166 0 162 L20 162 " +
      "C22 166 28 166 30 161 C34 160 34 154 30 153 C30 148 24 146 20 150 Z", { lv: 2 }), // bone
    C(214, 144, 10, { lv: 3, g: "ball" }),
    L("M202 140 C208 146 220 146 226 140", { lv: 3, clip: "ball" }),
    tuft(120, 154, { lv: 3 }), tuft(36, 154, { lv: 3 })
  ]);

  art("pig", [210, 150], [
    F("M4 40 L210 40 L210 50 L4 50 Z", { lv: 3 }),                                    // fence
    F("M4 78 L210 78 L210 88 L4 88 Z", { lv: 3 }),
    F("M96 26 L104 18 L112 26 L112 140 L96 140 Z", { lv: 3 }),
    F("M194 26 L202 18 L210 26 L210 140 L194 140 Z", { lv: 3 }),
    E(110, 138, 84, 8, { lv: 2 }),                                                     // puddle
    F("M74 112 L76 134 L90 134 L92 114 Z"),                                            // far legs
    F("M168 104 L170 132 L184 132 L182 100 Z"),
    L("M184 66 C194 62 200 54 196 48 C192 42 184 48 188 54 C192 60 202 58 206 50"),     // tail
    E(110, 75, 75, 48, { g: "b" }),                                                    // body
    E(42, 68, 32, 30, { g: "b" }),                                                     // head
    F("M48 104 L50 138 L66 138 L70 108 Z", { g: "b" }),                                // near legs
    F("M146 110 L146 138 L162 138 L168 104 Z", { g: "b" }),
    L("M118 92 C124 84 138 86 140 94 C142 104 128 106 122 102 C118 100 116 96 118 92 Z", { lv: 3, clip: "b" }),
    L("M150 48 C156 44 166 46 168 52 C170 58 162 62 156 60 C150 58 148 52 150 48 Z", { lv: 3, clip: "b" }),
    F("M49 130 L67 130 L66 138 L50 138 Z", { lv: 2 }),                                 // hooves
    F("M146 130 L163 130 L162 138 L146 138 Z", { lv: 2 }),
    F("M75 127 L90.5 127 L90 134 L76 134 Z", { lv: 3 }),
    F("M169.5 125 L183.5 125 L184 132 L170 132 Z", { lv: 3 }),
    E(12, 74, 8, 13),                                                                  // snout
    F("M46 42 C44 30 50 22 60 18 C64 26 66 34 66 44 C60 46 52 46 46 42 Z"),              // ear
    L("M52 40 C52 32 56 26 60 24", { lv: 3 }),
    C(32, 58, 3.5, ring()),                                                            // eye
    L("M20 94 C26 98 32 98 38 94", { lv: 2 })                                          // mouth
  ]);

  art("duck", [200, 150], [
    L("M-24 118 C-26 90 -24 64 -20 40 M-14 118 C-12 98 -14 82 -20 66", { lv: 3 }),     // reeds
    E(-20, 50, 4.5, 13, { lv: 3 }),
    F(xf("M40 92 C40 72 70 68 100 72 C130 74 150 62 174 46 C178 62 178 82 170 98 " +
         "C158 118 122 126 92 126 C62 126 40 114 40 92 Z", 0.55, 186, 54), { lv: 3, g: "d2" }), // duckling
    F(xf("M36 56 L66 52 L74 86 L42 90 Z", 0.55, 186, 54), { lv: 3, g: "d2" }),
    C(186 + 50 * 0.55, 54 + 44 * 0.55, 22 * 0.55, { lv: 3, g: "d2" }),
    C(186 + 46 * 0.55, 54 + 36 * 0.55, 2.6, ring({ lv: 3 })),
    F(xf("M32 40 C22 38 8 40 0 47 C6 54 20 56 34 52 Z", 0.55, 186, 54), { lv: 3 }),
    F("M40 92 C40 72 70 68 100 72 C130 74 150 62 174 46 C178 62 178 82 170 98 " +
      "C158 118 122 126 92 126 C62 126 40 114 40 92 Z", { g: "b" }),                   // body
    F("M36 56 L66 52 L74 86 L42 90 Z", { g: "b" }),                                    // neck
    C(50, 44, 22, { g: "b" }),                                                         // head
    F("M32 40 C22 38 8 40 0 47 C6 54 20 56 34 52 Z"),                                  // bill
    L("M2 47 C12 48 22 48 33 46", { lv: 2 }),
    C(46, 36, 3.5, ring()),                                                            // eye
    F("M84 86 C98 70 130 68 152 76 C142 94 120 106 96 106 C86 104 82 96 84 86 Z", { g: "w" }), // wing
    L("M104 82 C116 88 130 88 146 82 M96 94 C110 100 124 100 138 94", { lv: 2, clip: "w" }),
    water(-36, 290, 112, 40),
    waves(-12, 84, 128, { lv: 2 }), waves(132, 276, 132, { lv: 3 })
  ]);

  art("crab", [220, 165], [
    L("M72 100 L40 100 L24 128"), L("M74 110 L44 118 L34 146"), L("M80 120 L58 134 L52 156"), // legs
    L(mx("M72 100 L40 100 L24 128", 220)), L(mx("M74 110 L44 118 L34 146", 220)),
    L(mx("M80 120 L58 134 L52 156", 220)),
    L("M76 88 L50 64 L44 52"), L(mx("M76 88 L50 64 L44 52", 220)),                     // arms
    F("M44 54 C28 52 20 34 26 18 C30 26 36 30 42 30 C40 22 42 14 48 10 C58 22 58 44 44 54 Z"), // claws
    F(mx("M44 54 C28 52 20 34 26 18 C30 26 36 30 42 30 C40 22 42 14 48 10 C58 22 58 44 44 54 Z", 220)),
    L("M98 72 L94 54"), L(mx("M98 72 L94 54", 220)),                                   // eye stalks
    C(94, 50, 5), C(126, 50, 5),
    E(110, 100, 50, 32, { g: "b" }),                                                   // body
    L("M98 110 C104 116 116 116 122 110", { lv: 2 }),                                  // mouth
    L("M62 92 C84 80 136 80 158 92", { lv: 2, clip: "b" }),                            // shell ridge
    C(80, 100, 4, ring({ lv: 3 })), C(140, 100, 4, ring({ lv: 3 })), C(110, 90, 3.5, ring({ lv: 3 })),
    L("M-10 162 C30 156 60 164 100 160 C140 156 180 164 230 158", { lv: 2 }),          // sand
    star(4, 138, 14, 6, 5, 10, { lv: 3 }),                                             // starfish
    F("M196 156 L184 136 C190 128 210 128 216 136 Z", { lv: 3, g: "sh" }),             // shell
    L("M196 156 L192 130 M196 156 L200 129 M196 156 L208 131", { lv: 3, clip: "sh" }),
    C(160, 20, 5, ring({ lv: 3 })), C(172, 4, 3.5, ring({ lv: 3 }))
  ]);

  art("octopus", [200, 200], [
    C(30, 26, 7, ring({ lv: 2 })), C(18, 6, 4.5, ring({ lv: 3 })), C(172, 14, 5, ring({ lv: 3 })), // bubbles
    F("M66 108 C52 128 34 138 20 146 C8 154 8 170 20 170 C30 170 32 160 24 158 C38 150 58 140 78 116 Z"),
    F(mx("M66 108 C52 128 34 138 20 146 C8 154 8 170 20 170 C30 170 32 160 24 158 C38 150 58 140 78 116 Z", 200)),
    F("M82 114 C78 140 64 158 54 172 C48 182 54 194 64 190 C70 188 70 180 63 180 C74 166 90 146 96 116 Z"),
    F(mx("M82 114 C78 140 64 158 54 172 C48 182 54 194 64 190 C70 188 70 180 63 180 C74 166 90 146 96 116 Z", 200)),
    F("M95 116 C96 140 90 162 92 180 C94 192 106 196 112 190 C116 184 110 178 105 182 C103 166 106 142 106 116 Z"),
    C(30, 150, 2.8, ring({ lv: 3 })), C(170, 150, 2.8, ring({ lv: 3 })),               // suckers
    C(66, 168, 2.8, ring({ lv: 3 })), C(134, 168, 2.8, ring({ lv: 3 })),
    F("M100 10 C140 10 160 40 158 75 C156 100 140 112 128 120 L72 120 C60 112 44 100 42 75 " +
      "C40 40 60 10 100 10 Z"),                                                        // head
    E(80, 70, 10, 13, ring()), E(120, 70, 10, 13, ring()),                             // eyes
    C(82, 74, 4.5, ring({ lv: 2 })), C(118, 74, 4.5, ring({ lv: 2 })),
    L("M86 98 C94 104 106 104 114 98"),                                                // smile
    C(66, 40, 6, ring({ lv: 2 })), C(132, 36, 5, ring({ lv: 2 })),                      // spots
    C(100, 26, 4, ring({ lv: 3 })), C(144, 60, 4, ring({ lv: 3 }))
  ]);

  art("frog", [200, 190], [
    F("M196 160 L150 182 C130 186 112 187 100 187 C46 187 2 176 2 163 C2 150 46 139 100 139 " +
      "C154 139 198 150 198 163 C198 166 196 168 194 170 Z", { lv: 2, g: "pad" }),     // lily pad
    L("M196 160 L120 150 M196 160 L60 172", { lv: 3, clip: "pad" }),
    L("M-8 150 C-16 158 -16 170 -6 178 M206 150 C214 158 214 170 204 178", { lv: 3 }),  // ripples
    F("M56 112 C26 108 12 136 24 156 C34 168 58 166 72 156 Z"),                        // back legs
    F(mx("M56 112 C26 108 12 136 24 156 C34 168 58 166 72 156 Z", 200)),
    F("M34 160 L6 162 L14 168 L4 176 L18 174 L16 182 L42 168 Z"),                      // back feet
    F(mx("M34 160 L6 162 L14 168 L4 176 L18 174 L16 182 L42 168 Z", 200)),
    F("M100 60 C140 60 160 100 156 130 C152 156 130 166 100 166 C70 166 48 156 44 130 " +
      "C40 100 60 60 100 60 Z", { g: "b" }),                                           // body
    E(100, 66, 56, 36, { g: "b" }),                                                    // head
    C(66, 36, 20, { g: "b" }), C(134, 36, 20, { g: "b" }),                             // eye bulges
    C(66, 36, 12, ring()), C(134, 36, 12, ring()),
    E(66, 37, 4, 7, ring({ lv: 2 })), E(134, 37, 4, 7, ring({ lv: 2 })),
    L("M60 78 C80 96 120 96 140 78"),                                                  // mouth
    E(100, 132, 30, 26, ring({ lv: 2 })),                                              // belly
    C(30, 132, 5, ring({ lv: 3 })), C(170, 132, 5, ring({ lv: 3 })),                   // spots
    F("M62 104 C56 124 52 144 54 160 C54 166 66 166 68 160 C68 144 72 126 78 110 Z"),  // front legs
    F(mx("M62 104 C56 124 52 144 54 160 C54 166 66 166 68 160 C68 144 72 126 78 110 Z", 200)),
    L("M56 163 L46 170 M61 165 L60 175 M66 163 L74 170", { lv: 2 }),                   // fingers
    L(mx("M56 163 L46 170 M61 165 L60 175 M66 163 L74 170", 200), { lv: 2 })
  ]);

  art("dinosaur", [270, 180], [
    F("M176 96 L206 34 L222 34 L258 96 Z", { lv: 3 }),                                 // volcano
    L("M206 34 C210 39 218 39 222 34", { lv: 3 }),
    bumpy(214, 14, 14, 8, 7, 3, { lv: 3 }),
    F("M122 126 L124 166 C124 170 138 170 138 166 L140 126 Z"),                        // far legs
    F("M180 120 L184 164 C184 168 198 168 198 164 L194 114 Z"),
    tube([[178, 96], [212, 108], [244, 126], [272, 150]], 36, 4, { g: "b" }),          // tail
    E(140, 100, 55, 38, { g: "b" }),                                                   // body
    tube([[104, 96], [86, 70], [68, 46], [50, 32]], 32, 18, { g: "b" }),               // neck
    E(38, 30, 21, 13, { rot: -10, g: "b" }),                                           // head
    F("M100 120 L100 168 C100 173 118 173 118 168 L122 124 Z", { g: "b" }),            // near legs
    F("M160 126 L158 170 C158 175 178 175 178 170 L182 118 Z", { g: "b" }),
    C(30, 26, 3.4, ring()),                                                            // eye
    L("M18 34 C24 38 32 38 40 35", { lv: 2 }),                                         // smile
    C(126, 84, 8, ring({ lv: 2, clip: "b" })), C(152, 76, 6, ring({ lv: 2, clip: "b" })), // spots
    C(160, 100, 7, ring({ lv: 3, clip: "b" })), C(132, 110, 5, ring({ lv: 3, clip: "b" })),
    C(212, 114, 5, ring({ lv: 3, clip: "b" })), C(92, 74, 4.5, ring({ lv: 3, clip: "b" })),
    leaf(66, 174, 24, -120, { lv: 2 }), leaf(66, 174, 26, -80, { lv: 2 }), leaf(66, 174, 22, -40, { lv: 3 }),
    tuft(136, 176, { lv: 3 }), tuft(222, 176, { lv: 3 })
  ]);

  art("lion", [200, 236], [
    sun(176, 6, 11, { lv: 3 }),
    L("M150 214 C180 214 194 186 186 160"),                                            // tail
    F("M186 162 C178 156 180 144 188 140 C194 146 194 156 186 162 Z"),
    F("M60 120 C40 150 36 196 44 226 L156 226 C164 196 160 150 140 120 Z"),            // body
    F("M66 150 L64 218 C64 228 90 228 90 218 L88 150 Z", { g: "lg" }),                 // front legs
    F(mx("M66 150 L64 218 C64 228 90 228 90 218 L88 150 Z", 200), { g: "lg" }),
    L("M73 216 L73 230 M81 216 L81 230 M119 216 L119 230 M127 216 L127 230", { lv: 2, clip: "lg" }),
    bumpy(100, 82, 66, 62, 14, 6),                                                     // mane
    C(62, 40, 12), C(138, 40, 12),                                                     // ears
    C(62, 40, 6, ring({ lv: 2 })), C(138, 40, 6, ring({ lv: 2 })),
    E(100, 84, 42, 40),                                                                // face
    E(84, 76, 5, 6, ring()), E(116, 76, 5, 6, ring()),                                 // eyes
    L("M74 64 C79 59 88 59 92 63", { lv: 3 }), L(mx("M74 64 C79 59 88 59 92 63", 200), { lv: 3 }),
    E(100, 119, 8, 5, { lv: 2 }),                                                      // chin
    L("M86 104 L58 99 M86 109 L60 115", { lv: 3 }), L(mx("M86 104 L58 99 M86 109 L60 115", 200), { lv: 3 }),
    C(92, 105, 11, { g: "m" }), C(108, 105, 11, { g: "m" }),                           // muzzle
    L("M100 101 L100 112", { lv: 2 }),
    F("M90 92 L110 92 L100 102 Z"),                                                    // nose
    tuft(10, 228, { lv: 3 }), tuft(176, 228, { lv: 3 })
  ]);

  art("hedgehog", [220, 150], [
    F("M74 124 L70 142 L88 142 L88 124 Z"), F("M150 130 L148 148 L166 148 L166 128 Z"), // feet
    spiky(130, 90, 78, 52, 185, 390, 17, 13, { g: "b" }),                              // spines
    L("M118 62 L124 74 L130 62 M156 62 L162 74 L168 62 M140 92 L146 104 L152 92", { lv: 2, clip: "b" }),
    L("M100 50 L106 62 L112 50 M180 78 L186 90 L192 78 M168 104 L174 116 L180 104 " +
      "M124 108 L130 120 L136 108 M136 40 L142 52 L148 40", { lv: 3, clip: "b" }),
    C(150, 34, 15, { lv: 2 }),                                                         // apple
    L("M150 19 C150 14 152 10 156 8", { lv: 2 }), leaf(154, 14, 14, -20, { lv: 3 }),
    C(84, 64, 7),                                                                      // ear
    F("M98 64 C72 56 50 64 34 80 C26 88 12 94 6 98 C3 104 9 110 18 110 C40 114 62 128 92 130 " +
      "C106 118 110 80 98 64 Z"),                                                      // face
    C(44, 88, 3.5, ring()),                                                            // eye
    C(6, 101, 4.5),                                                                    // nose
    L("M16 109 C22 113 30 113 36 109", { lv: 2 }),
    F("M212 148 L214 122 L224 122 L226 148 Z", { lv: 3 }),                             // mushroom
    F("M202 124 C202 106 236 106 236 124 Z", { lv: 3 }),
    leaf(-2, 148, 20, -30, { lv: 3 }), leaf(30, 150, 18, -160, { lv: 3 }),
    tuft(104, 150, { lv: 2 }), tuft(182, 150, { lv: 2 })
  ]);

  art("seahorse", [150, 240], [
    C(20, 20, 6, ring({ lv: 2 })), C(10, 2, 4, ring({ lv: 3 })), C(30, -8, 3.5, ring({ lv: 3 })), // bubbles
    F("M16 236 C8 214 28 200 20 176 C12 156 26 146 20 128 C34 144 30 160 36 176 " +
      "C42 200 24 216 30 236 Z", { lv: 3 }),                                           // weed
    F("M112 236 C104 218 120 204 112 186 C128 198 122 218 126 236 Z", { lv: 3 }),
    F("M92 92 C112 86 124 98 118 116 C110 120 100 120 94 116 Z", { g: "fn" }),         // dorsal fin
    L("M96 98 L122 96 M96 106 L124 108", { lv: 2, clip: "fn" }),
    tube([[72, 128], [80, 162], [92, 190], [88, 212], [72, 222], [58, 212], [58, 198], [68, 192], [76, 198]],
         26, 6, { g: "b" }),                                                           // tail
    F("M58 54 C40 76 38 112 52 134 C62 148 82 150 92 138 C102 122 100 90 92 70 C86 58 74 52 58 54 Z", { g: "b" }),
    E(64, 42, 22, 17, { rot: -10, g: "b" }),                                           // head
    F("M48 36 L14 41 C9 43 9 50 14 52 L50 52 Z", { g: "b" }),                          // snout
    F("M55 30 L60 12 L66 24 L72 12 L77 30 Z", { g: "b" }),                             // coronet
    C(64, 40, 4.2, ring()),                                                            // eye
    L("M38 86 C54 92 76 92 100 84 M38 104 C54 110 76 110 102 102 M42 122 C56 128 76 128 98 120",
      { lv: 2, clip: "b" }),                                                           // belly ridges
    L("M42 70 C56 76 74 76 96 68", { lv: 3, clip: "b" }),
    L("M60 150 C70 156 84 156 96 150 M66 170 C76 176 88 176 98 170", { lv: 3, clip: "b" })
  ]);

  art("bee", [200, 160], [
    L("M180 146 C178 136 178 124 180 112", { lv: 2 }),                                 // flower
    leaf(179, 134, 16, -30, { lv: 2 }),
    flower(180, 100, 10, 6, { lv: 2 }),
    L("M14 146 C16 138 14 132 16 124", { lv: 3 }),
    flower(16, 114, 8, 5, { lv: 3 }),
    bumpy(160, 20, 22, 10, 7, 4, { lv: 3 }),                                           // cloud
    E(96, 44, 20, 32, { rot: -25, g: "w1" }), E(126, 46, 18, 28, { rot: 22, g: "w2" }), // wings
    L("M98 74 C94 56 92 40 90 22", { lv: 3, clip: "w1" }), L("M120 72 C124 58 128 44 134 30", { lv: 3, clip: "w2" }),
    E(112, 96, 50, 33, { g: "b" }),                                                    // body
    F("M156 88 L180 96 L156 104 Z", { g: "b" }),                                       // sting
    L("M100 58 C90 80 90 112 100 134 M114 58 C104 80 104 112 114 134", { clip: "b" }), // stripes
    L("M132 62 C124 82 124 110 132 130 M146 70 C140 86 140 106 146 122", { lv: 2, clip: "b" }),
    C(60, 92, 22),                                                                     // head
    C(52, 86, 5, ring()),
    L("M44 101 C50 107 58 107 64 103", { lv: 2 }),
    L("M54 71 C48 54 40 46 30 44"), L("M66 71 C66 54 62 44 54 38"),                    // antennae
    C(28, 43, 3.6, { lv: 2 }), C(53, 37, 3.6, { lv: 2 }),
    L("M92 126 L86 142 M112 129 L110 145 M132 126 L136 142", { lv: 2 })               // legs
  ]);

  art("squirrel", [190, 210], [
    tube([[108, 184], [146, 168], [164, 128], [158, 84], [156, 50], [140, 24], [116, 20], [104, 36]],
         30, 26, { g: "t", bulge: 22 }),                                               // tail
    L("M150 150 L166 140 M160 110 L176 104 M156 76 L172 72 M164 46 L178 40 M140 26 L148 12", { lv: 3, clip: "t" }),
    F("M70 90 C50 100 44 140 50 170 C54 186 76 190 96 188 C120 186 132 170 128 140 C124 110 100 86 70 90 Z", { g: "b" }),
    E(66, 70, 26, 22, { rot: -10, g: "b" }),                                           // head
    F("M46 62 C36 64 28 70 30 78 C34 86 44 86 54 82 Z", { g: "b" }),                   // snout
    F("M70 52 L76 28 L88 50 Z", { g: "b" }),                                           // ear
    E(86, 192, 24, 6, { g: "b" }),                                                     // hind foot
    L("M100 196 C90 168 98 142 118 140 C132 142 138 162 132 180", { clip: "b" }),      // haunch
    L("M56 98 C44 126 46 156 58 184", { lv: 2, clip: "b" }),                           // belly
    C(58, 64, 3.6, ring()),                                                            // eye
    C(31, 75, 2.8, { lv: 3 }),                                                         // nose
    E(42, 122, 10, 12),                                                                // acorn
    F("M30 114 C30 102 54 102 54 114 Z"),
    L("M42 103 L44 96", { lv: 2 }),
    L("M34 110 L50 110", { lv: 3 }),
    F("M66 104 C54 108 48 116 50 124 C56 126 66 120 72 112 Z"),                        // paw
    E(150, 202, 8, 9, { lv: 2 }), F("M140 196 C140 186 160 186 160 196 Z", { lv: 2 }), // dropped acorn
    leaf(20, 202, 18, -10, { lv: 3 }), leaf(176, 200, 16, -170, { lv: 3 }),
    tuft(110, 204, { lv: 3 })
  ]);

  // ------------------------------------------------------------------ objects

  art("sailboat", [200, 230], [
    sun(26, 30, 13, { lv: 3 }),
    L("M100 10 L100 168"),                                                             // mast
    F("M104 15 C130 60 160 120 168 160 L104 160 Z", { g: "ms" }),                      // mainsail
    F("M96 30 L96 160 L35 160 C50 120 75 70 96 30 Z", { g: "js" }),                    // jib
    F("M100 10 L124 4 L112 13 L124 22 L100 18 Z", { lv: 2 }),                          // pennant
    L("M100 60 L140 60 M100 105 L160 105", { lv: 3, clip: "ms" }),                     // sail seams
    L("M100 80 L60 80 M100 125 L40 125", { lv: 3, clip: "js" }),
    F("M20 168 L180 168 C175 185 160 198 140 200 L55 200 C40 198 28 185 20 168 Z"),    // hull
    C(70, 184, 4.5, ring({ lv: 2 })), C(100, 184, 4.5, ring({ lv: 2 })),
    C(130, 184, 4.5, ring({ lv: 2 })),
    M("M0 205 Q12 197 25 205 T50 205 T75 205 T100 205 T125 205 T150 205 T175 205 T200 205 L200 230 L0 230 Z"),
    L("M0 205 Q12 197 25 205 T50 205 T75 205 T100 205 T125 205 T150 205 T175 205 T200 205"),
    L("M15 222 Q27 214 40 222 T65 222 T90 222", { lv: 2 }),
    L("M120 222 Q132 214 145 222 T170 222 T195 222", { lv: 3 }),
    gull(160, 40, 1, { lv: 2 }), gull(178, 64, 0.7, { lv: 3 })
  ]);

  art("house", [220, 200], [
    sun(38, 12, 10, { lv: 3 }),
    bumpy(176, 10, 9, 6, 6, 2.5, { lv: 3 }), bumpy(190, -8, 7, 5, 6, 2, { lv: 3 }),     // smoke
    F("M150 30 L150 70 L170 70 L170 30 Z"),                                            // chimney
    F("M146 24 L174 24 L174 32 L146 32 Z"),
    F("M36 84 L36 190 L184 190 L184 84 Z"),                                            // walls
    F("M20 90 L110 20 L200 90 Z", { g: "roof" }),                                      // roof
    L("M20 76 L200 76 M20 62 L200 62 M20 48 L200 48 M20 34 L200 34", { lv: 3, clip: "roof" }),
    C(110, 64, 10, ring()),                                                            // attic window
    L("M100 64 L120 64 M110 54 L110 74", { lv: 3 }),
    F("M92 190 L92 138 C92 124 128 124 128 138 L128 190 Z"),                           // door
    C(120, 164, 3, ring({ lv: 3 })),
    F("M48 108 L80 108 L80 142 L48 142 Z"), L("M64 108 L64 142 M48 125 L80 125"),      // windows
    F(mx("M48 108 L80 108 L80 142 L48 142 Z", 220)), L(mx("M64 108 L64 142 M48 125 L80 125", 220)),
    L("M44 150 L84 150", { lv: 2 }), L("M136 150 L176 150", { lv: 2 }),                // sills
    L("M20 190 L36 190 M184 190 L200 190", { lv: 2 }),                                 // ground
    L("M92 190 L74 214 M128 190 L146 214"),                                            // path
    bumpy(40, 182, 16, 10, 6, 3, { lv: 2 }), bumpy(180, 182, 16, 10, 6, 3, { lv: 3 }), // bushes
    ...tulip(56, 190, { lv: 3 }), ...tulip(166, 190, { lv: 3 })
  ]);

  art("lighthouse", [160, 256], [
    bumpy(126, 36, 18, 8, 7, 3, { lv: 3 }),                                            // cloud
    L("M64 46 L8 28 M64 56 L8 74", { lv: 1 }), L(mx("M64 46 L8 28 M64 56 L8 74", 160)), // beams
    F("M54 230 L66 70 L94 70 L106 230 Z", { g: "t" }),                                 // tower
    L("M50 190 L110 190 M50 166 L110 166", { clip: "t" }),                             // stripes
    L("M50 122 L110 122 M50 100 L110 100", { lv: 2, clip: "t" }),
    F("M74 140 L86 140 L86 154 L74 154 Z", { lv: 2 }),                                 // windows
    F("M76 80 L84 80 L84 90 L76 90 Z", { lv: 3 }),
    F("M72 230 L72 212 C72 204 88 204 88 212 L88 230 Z", { lv: 2 }),                   // door
    F("M66 62 L66 38 L94 38 L94 62 Z"),                                                // lantern
    L("M80 38 L80 62"),
    F("M60 40 L80 20 L100 40 Z"),                                                      // roof
    C(80, 17, 4, { lv: 2 }),
    F("M54 70 L106 70 L106 62 L54 62 Z"),                                              // gallery
    L("M54 62 L54 52 L106 52 L106 62 M67 52 L67 62 M93 52 L93 62", { lv: 2 }),         // railing
    F("M24 236 C24 220 44 212 60 222 C70 210 96 208 104 220 C118 210 140 218 140 238 Z"), // rocks
    L("M60 222 C62 230 60 236 56 240 M104 220 C108 228 106 234 100 240", { lv: 3 }),
    water(-24, 192, 234, 30),
    waves(-12, 60, 248, { lv: 2 }), waves(96, 180, 250, { lv: 3 }),
    gull(130, 110, 0.9, { lv: 2 }), gull(22, 128, 0.7, { lv: 3 })
  ]);

  art("train", [260, 150], [
    bumpy(46, 20, 14, 10, 7, 3), bumpy(76, 2, 11, 7, 6, 2.5, { lv: 2 }),               // smoke
    bumpy(104, -12, 8, 5, 6, 2, { lv: 3 }),
    F("M36 66 L30 38 L58 38 L52 66 Z"),                                                // chimney
    F("M70 66 C70 52 90 52 90 66 Z", { lv: 2 }),                                       // dome
    F("M20 66 L120 66 L120 112 L20 112 C14 112 12 106 12 100 L12 78 C12 72 14 66 20 66 Z", { g: "loco" }),
    L("M44 66 L44 112 M96 66 L96 112", { lv: 3, clip: "loco" }),                       // boiler bands
    F("M120 42 L170 42 L170 112 L120 112 Z", { g: "loco" }),                           // cab
    F("M114 34 L176 34 L176 42 L114 42 Z"),
    F("M132 54 L158 54 L158 78 L132 78 Z"),
    bumpy(216, 66, 30, 6, 6, 2.5, { lv: 3 }),                                          // tender
    F("M182 72 L250 72 L250 116 L182 116 Z", { lv: 3 }),
    L("M176 112 L182 112", { lv: 3 }),
    F("M8 112 L176 112 L176 122 L8 122 Z"),                                            // chassis
    F("M8 112 L-8 140 L22 140 L22 122 Z"),                                             // cowcatcher
    L("M2 122 L14 140 M12 116 L16 140", { lv: 3 }),
    F("M12 74 L2 70 L2 86 L12 82 Z", { lv: 2 }),                                       // lamp
    C(140, 124, 20, { g: "w1" }), C(96, 128, 16, { g: "w2" }), C(60, 128, 16, { g: "w3" }), // wheels
    C(26, 132, 11),
    C(200, 128, 12, { lv: 3 }), C(234, 128, 12, { lv: 3 }),
    C(140, 124, 6, ring({ lv: 2 })), C(96, 128, 5, ring({ lv: 2 })), C(60, 128, 5, ring({ lv: 2 })),
    L("M140 104 L140 144 M120 124 L160 124", { lv: 3, clip: "w1" }),                  // spokes
    L("M96 112 L96 144 M80 128 L112 128", { lv: 3, clip: "w2" }),
    L("M60 112 L60 144 M44 128 L76 128", { lv: 3, clip: "w3" }),
    L("M60 128 L96 128 L140 124", { lv: 2 }),                                          // rod
    L("M-8 145 L252 145", { lv: 2 })                                                   // rail
  ]);

  art("car", [240, 140], [
    sun(212, 6, 10, { lv: 3 }),
    bumpy(40, 0, 16, 7, 6, 3, { lv: 3 }), gull(176, 14, 0.7, { lv: 3 }),
    bumpy(110, 6, 22, 9, 7, 3, { lv: 3 }),                                             // cloud
    bumpy(240, 104, 5, 4, 5, 1.6, { lv: 3 }),                                          // exhaust
    F("M14 90 C14 78 20 72 34 70 L62 66 C72 50 90 38 112 38 L150 38 C168 38 182 50 196 66 " +
      "L216 70 C228 72 234 80 234 92 L234 104 C234 110 230 112 224 112 L18 112 " +
      "C14 112 12 108 12 104 Z", { g: "c" }),                                          // body
    L("M70 66 L90 46 L124 46 L124 66 Z"),                                              // windows
    L("M132 66 L132 46 L150 46 C164 46 174 54 182 66 Z"),
    L("M128 66 L128 108", { lv: 2, clip: "c" }),                                       // door
    L("M70 66 L70 108 M186 70 L186 100", { lv: 3, clip: "c" }),
    L("M108 78 L118 78 M140 78 L150 78", { lv: 3 }),                                   // handles
    E(20, 83, 5, 5),                                                                   // headlight
    F("M228 76 L234 76 L234 90 L228 90 Z", { lv: 2 }),                                 // tail light
    L("M8 100 L28 100 M224 100 L238 100", { lv: 2 }),                                  // bumpers
    C(60, 112, 20), C(186, 112, 20),                                                   // wheels
    C(60, 112, 8, ring()), C(186, 112, 8, ring()),
    M("M4 130 L244 130 L244 150 L4 150 Z", { lv: 2 }),                                 // road
    L("M4 130 L244 130", { lv: 2 }),
    L("M10 142 L40 142 M80 142 L110 142 M150 142 L180 142 M206 142 L236 142", { lv: 3 })
  ]);

  art("aeroplane", [240, 130], [
    bumpy(40, 10, 20, 8, 7, 3, { lv: 2 }), bumpy(200, 116, 24, 8, 8, 3, { lv: 3 }),    // clouds
    F("M190 62 L214 16 L232 16 L224 66 Z"),                                            // fin
    E(12, 70, 4.5, 34),                                                                // propeller
    F("M30 60 C40 46 70 44 110 46 L200 54 C220 56 236 62 236 72 C236 80 222 84 200 84 " +
      "L100 92 C70 94 40 90 30 80 C26 74 26 66 30 60 Z", { g: "f" }),                 // fuselage
    L("M30 70 L236 70", { lv: 3, clip: "f" }),                                         // stripe
    F("M196 70 L238 64 L238 78 L196 80 Z"),                                            // tailplane
    F("M30 58 C20 60 14 66 14 70 C14 76 20 80 30 82 Z"),                               // spinner
    F("M70 47 C74 32 92 28 108 36 L112 47 Z"),                                         // cockpit
    C(126, 62, 5, ring({ lv: 2 })), C(144, 63, 5, ring({ lv: 2 })), C(162, 64, 5, ring({ lv: 2 })),
    C(180, 65, 4.5, ring({ lv: 3 })),
    L("M80 92 L78 110"), C(78, 116, 8),                                                // wheel
    F("M88 72 L136 74 L112 116 L92 116 Z"),                                            // wing
    L("M96 110 L118 108", { lv: 3 }),
    L("M240 58 L262 58 M242 70 L268 70 M240 82 L262 82", { lv: 3 })                    // speed lines
  ]);

  art("rocket", [140, 260], [
    star(18, 30, 8, 3.5, 5, 0, { lv: 2 }), star(122, 64, 7, 3, 5, 15, { lv: 2 }),      // stars
    star(14, 140, 6, 2.6, 5, 30, { lv: 3 }), star(128, 170, 6, 2.6, 5, 0, { lv: 3 }),
    F("M120 8 A16 16 0 0 1 120 40 A20 20 0 0 0 120 8 Z", { lv: 3 }),                  // moon
    F("M52 206 C48 224 58 240 70 260 C82 240 92 224 88 206 Z"),                        // flame
    F("M61 208 C60 220 66 230 70 240 C74 230 80 220 79 208 Z", { lv: 2 }),
    bumpy(36, 236, 12, 8, 6, 3, { lv: 3 }), bumpy(104, 236, 12, 8, 6, 3, { lv: 3 }),   // smoke
    F("M44 150 L14 196 L20 206 L48 190 Z"), F(mx("M44 150 L14 196 L20 206 L48 190 Z", 140)), // fins
    F("M70 10 C96 36 106 80 104 130 L100 200 L40 200 L36 130 C34 80 44 36 70 10 Z", { g: "r" }), // body
    L("M38 60 C56 68 84 68 102 60", { clip: "r" }),                                    // nose cone
    L("M34 178 L106 178", { lv: 2, clip: "r" }),
    C(70, 98, 16), C(70, 98, 10, ring()),                                              // portholes
    C(70, 144, 9, { lv: 2 }), C(70, 144, 5, ring({ lv: 3 })),
    F("M64 182 L64 214 L76 214 L76 182 Z", { lv: 2 }),                                 // centre fin
    F("M46 200 L42 212 L98 212 L94 200 Z")                                             // nozzle
  ]);

  art("balloon", [180, 250], [
    bumpy(32, 222, 18, 8, 7, 3, { lv: 2 }), bumpy(148, 204, 16, 7, 6, 3, { lv: 3 }),   // clouds
    gull(160, 14, 0.7, { lv: 3 }), gull(22, 172, 0.6, { lv: 3 }),
    F("M90 10 C140 10 170 50 168 92 C166 130 130 160 112 176 L68 176 C50 160 14 130 12 92 " +
      "C10 50 40 10 90 10 Z", { g: "e" }),                                             // envelope
    L("M90 10 L90 176 M90 10 C60 30 48 120 76 176 M90 10 C120 30 132 120 104 176", { clip: "e" }),
    L("M90 10 C36 30 22 110 66 176 M90 10 C144 30 158 110 114 176", { lv: 2, clip: "e" }),
    L("M10 100 C50 114 130 114 170 100", { lv: 2, clip: "e" }),
    L("M14 70 C50 80 130 80 166 70", { lv: 3, clip: "e" }),
    F("M68 176 L112 176 L106 190 L74 190 Z"),                                          // skirt
    L("M76 190 L72 212 M104 190 L108 212"),                                            // ropes
    L("M90 190 L90 212", { lv: 3 }),
    F("M64 210 L116 210 L110 240 L70 240 Z", { g: "bk" }),                             // basket
    L("M60 220 L120 220 M60 230 L120 230", { lv: 2, clip: "bk" }),
    L("M80 206 L80 244 M90 206 L90 244 M100 206 L100 244", { lv: 3, clip: "bk" }),
    F("M64 210 L116 210 L116 216 L64 216 Z", { lv: 2 })                                // rim
  ]);

  art("teapot", [220, 170], [
    L("M16 46 C10 40 20 34 14 26 C8 18 18 12 14 4", { lv: 2 }),                        // steam
    L("M30 40 C26 34 34 28 30 20", { lv: 3 }),
    F("M150 62 C186 54 202 80 194 104 C188 122 166 130 150 126 L150 114 C164 116 178 112 182 100 " +
      "C188 82 176 70 150 74 Z"),                                                      // handle
    F("M60 100 C40 96 30 80 20 58 C16 52 20 48 26 52 C36 66 48 76 66 80 Z"),           // spout
    E(106, 100, 58, 50, { g: "b" }),                                                   // body
    F("M70 140 L142 140 L136 156 L76 156 Z", { g: "b" }),                              // foot
    L("M48 96 C80 106 132 106 164 96", { lv: 2, clip: "b" }),                          // band
    L("M54 126 C84 134 128 134 158 126", { lv: 3, clip: "b" }),
    flower(106, 118, 5, 5, { lv: 3 }),
    F("M74 54 C74 38 138 38 138 54 Z"),                                                // lid
    F("M64 52 L148 52 L148 60 L64 60 Z"),
    C(106, 32, 7),
    F("M190 128 L222 128 C222 146 214 154 206 154 C198 154 190 146 190 128 Z", { lv: 3 }), // cup
    L("M222 133 C232 131 233 145 220 146", { lv: 3 }),
    E(206, 156, 22, 4, { lv: 3 })
  ]);

  art("windmill", [220, 250], [
    bumpy(30, 30, 18, 8, 7, 3, { lv: 3 }), gull(190, 40, 0.8, { lv: 3 }),
    F("M78 240 L90 100 L130 100 L142 240 Z"),                                          // tower
    L("M84 170 L136 170", { lv: 3 }),
    F("M100 240 L100 216 C100 206 120 206 120 216 L120 240 Z"),                        // door
    F("M104 138 L116 138 L116 154 L104 154 Z", { lv: 2 }),                             // window
    F("M84 104 C84 74 136 74 136 104 Z"),                                              // cap
    sail(110, 90, 45, 14, 100, 18), sail(110, 90, 135, 14, 100, 18),                   // sails
    sail(110, 90, 225, 14, 100, 18), sail(110, 90, 315, 14, 100, 18),
    C(110, 90, 7),
    L("M14 240 L78 240 M142 240 L206 240", { lv: 2 }),                                 // ground
    ...tulip(26, 240, { lv: 2 }), ...tulip(50, 240, { lv: 3 }), ...tulip(170, 240, { lv: 3 }),
    ...tulip(194, 240, { lv: 2 })
  ]);

  art("snowman", [200, 240], [
    star(36, 26, 7, 2.6, 6, 0, { lv: 3 }), star(164, 34, 7, 2.6, 6, 0, { lv: 3 }),     // snowflakes
    star(166, 160, 6, 2.2, 6, 0, { lv: 3 }), star(34, 150, 6, 2.2, 6, 0, { lv: 3 }),
    L("M66 120 L20 88 M36 99 L24 110 M30 95 L26 82"),                                  // arms
    L(mx("M66 120 L20 88 M36 99 L24 110 M30 95 L26 82", 200)),
    C(100, 188, 48),                                                                   // snowballs
    C(100, 116, 36),
    C(100, 58, 26),
    F("M74 76 C86 86 114 86 126 76 L127 88 C114 98 86 98 73 88 Z", { g: "sc" }),       // scarf
    F("M110 90 L120 122 L106 124 L98 94 Z", { g: "sc" }),
    L("M112 106 L120 106 M114 116 L121 116", { lv: 3, clip: "sc" }),
    F("M78 38 L78 4 L122 4 L122 38 Z"),                                                // hat
    L("M78 30 L122 30", { lv: 2 }),
    F("M66 38 L134 38 L134 46 L66 46 Z"),
    C(90, 54, 3.6, ring()), C(110, 54, 3.6, ring()),                                   // eyes
    F("M100 60 L128 66 L100 68 Z"),                                                    // nose
    L("M86 72 C94 78 106 78 114 72", { lv: 2 }),                                       // mouth
    C(100, 110, 4.5, ring()), C(100, 130, 4.5, ring()),                                // buttons
    C(100, 168, 4.5, ring({ lv: 2 })), C(100, 190, 4.5, ring({ lv: 3 })),
    M("M24 228 C60 222 140 222 176 228 L176 260 L24 260 Z", { lv: 2 }),                // snow
    L("M24 228 C60 222 140 222 176 228", { lv: 2 })
  ]);

  art("castle", [240, 220], [
    gull(130, 4, 0.8, { lv: 3 }), gull(104, 20, 0.6, { lv: 3 }),
    battlement(84, 156, 40, 200, 4, 10),                                               // keep
    F("M110 76 L110 62 C110 54 130 54 130 62 L130 76 Z"),
    battlement(56, 184, 110, 200, 6, 10, { g: "w" }),                                  // walls
    L("M66 140 L78 140 M92 160 L104 160 M136 160 L148 160 M162 140 L174 140 M70 180 L82 180 " +
      "M158 180 L170 180", { lv: 3, clip: "w" }),
    F("M20 200 L20 62 L66 62 L66 200 Z"), F(mx("M20 200 L20 62 L66 62 L66 200 Z", 240)), // towers
    F("M14 64 L43 12 L72 64 Z"), F(mx("M14 64 L43 12 L72 64 Z", 240)),                // roofs
    L("M43 12 L43 -12", { lv: 2 }), L("M197 12 L197 -12", { lv: 2 }),                  // flags
    F("M43 -12 L62 -6 L43 0 Z", { lv: 2 }), F("M197 -12 L216 -6 L197 0 Z", { lv: 2 }),
    F("M36 100 L36 86 C36 78 50 78 50 86 L50 100 Z"), F(mx("M36 100 L36 86 C36 78 50 78 50 86 L50 100 Z", 240)),
    F("M36 150 L36 136 C36 128 50 128 50 136 L50 150 Z", { lv: 2 }),
    F(mx("M36 150 L36 136 C36 128 50 128 50 136 L50 150 Z", 240), { lv: 2 }),
    F("M100 200 L100 160 C100 140 140 140 140 160 L140 200 Z", { g: "gate" }),         // gate
    L("M110 140 L110 200 M120 140 L120 200 M130 140 L130 200 M96 170 L144 170 M96 184 L144 184",
      { lv: 2, clip: "gate" }),
    bumpy(30, 194, 14, 8, 6, 3, { lv: 3 }), bumpy(210, 194, 14, 8, 6, 3, { lv: 3 })
  ]);

  art("helicopter", [240, 140], [
    bumpy(30, 110, 20, 8, 7, 3, { lv: 2 }), bumpy(206, 116, 18, 7, 6, 3, { lv: 3 }),   // clouds
    sun(220, -6, 9, { lv: 3 }),
    F("M130 60 L224 64 L224 74 L130 86 Z", { g: "h" }),                                // tail boom
    F("M214 64 L222 36 L236 36 L234 74 Z", { g: "h" }),                                // fin
    L("M228 34 L228 64 M214 49 L242 49"),                                              // tail rotor
    C(228, 49, 3.5, { lv: 2 }),
    F("M92 24 L108 24 L110 36 L90 36 Z"),                                              // mast
    F("M40 80 C40 50 70 34 110 34 C140 34 150 56 150 76 C150 96 136 104 110 104 L60 104 " +
      "C46 104 40 94 40 80 Z", { g: "h" }),                                            // body
    F("M44 78 C44 56 64 42 92 42 L92 78 Z"),                                           // windscreen
    F("M100 46 L128 46 L128 72 L100 72 Z", { lv: 2 }),                                 // door window
    L("M96 46 L96 100", { lv: 3 }),
    L("M180 66 L180 74 M200 66 L200 73", { lv: 3 }),
    L("M8 22 L212 22"),                                                                // rotor
    F("M94 18 L106 18 L106 26 L94 26 Z", { lv: 2 }),
    L("M66 104 L62 122 M118 104 L122 122"),                                            // skids
    L("M28 114 C30 122 36 124 42 124 L152 124")
  ]);

  art("teddy", [200, 240], [
    C(56, 36, 18), C(144, 36, 18),                                                     // ears
    C(56, 36, 9, ring({ lv: 2 })), C(144, 36, 9, ring({ lv: 2 })),
    E(46, 132, 16, 30, { rot: 25 }), E(154, 132, 16, 30, { rot: -25 }),                // arms
    E(100, 150, 50, 56),                                                               // body
    E(100, 164, 28, 32, ring({ lv: 2 })),                                              // tummy
    F("M100 196 C96 192 88 192 88 184 C88 178 96 176 100 182 C104 176 112 178 112 184 " +
      "C112 192 104 192 100 196 Z", { lv: 3 }),                                        // heart patch
    E(62, 198, 24, 28), E(138, 198, 24, 28),                                           // legs
    E(60, 206, 12, 14, ring()), E(140, 206, 12, 14, ring()),                           // paw pads
    C(52, 186, 4, ring({ lv: 3 })), C(62, 182, 4, ring({ lv: 3 })), C(72, 188, 4, ring({ lv: 3 })),
    C(148, 186, 4, ring({ lv: 3 })), C(138, 182, 4, ring({ lv: 3 })), C(128, 188, 4, ring({ lv: 3 })),
    C(100, 68, 46),                                                                    // head
    E(100, 88, 20, 15),                                                                // muzzle
    E(100, 81, 7, 5),                                                                  // nose
    L("M100 86 L100 94 M90 95 C94 100 106 100 110 95", { lv: 2 }),                     // mouth
    C(82, 62, 4.5, ring()), C(118, 62, 4.5, ring()),                                   // eyes
    F("M100 118 L76 106 L76 132 Z", { lv: 2 }), F("M100 118 L124 106 L124 132 Z", { lv: 2 }), // bow
    C(100, 118, 6, { lv: 2 }),
    L("M70 92 C74 96 80 96 84 92 M116 92 C120 96 126 96 130 92", { lv: 3 })           // cheeks
  ]);

  art("tractor", [240, 170], [
    sun(28, 30, 9, { lv: 3 }),
    bumpy(84, 18, 8, 5, 6, 2.2, { lv: 2 }), bumpy(100, 8, 6, 4, 6, 1.8, { lv: 3 }),     // smoke
    F("M68 28 L68 70 L78 70 L78 28 Z"),                                                // exhaust
    F("M20 70 L120 70 L120 120 L20 120 C14 120 12 114 12 108 L12 82 C12 76 14 70 20 70 Z", { g: "t" }), // bonnet
    L("M40 70 L40 120 M60 82 L104 82 M60 94 L104 94 M60 106 L104 106", { lv: 3, clip: "t" }), // vents
    F("M120 22 L190 22 L196 130 L120 130 Z", { g: "t" }),                              // cab
    F("M112 14 L198 14 L198 24 L112 24 Z"),                                            // roof
    F("M132 32 L180 32 L184 80 L132 80 Z"),                                            // window
    F("M8 80 L18 80 L18 112 L8 112 Z", { lv: 2 }),                                     // grille
    E(28, 64, 7, 5, { lv: 2 }),                                                        // headlight
    F("M126 108 C126 66 226 66 226 108 L216 108 C216 78 136 78 136 108 Z", { lv: 2 }), // mudguard
    C(176, 126, 40, { upto: 1 }),                                                      // rear wheel
    bumpy(176, 126, 37, 37, 18, 1.6, { lv: 2 }),
    C(176, 126, 24, ring({ lv: 2 })), C(176, 126, 10, ring()),
    C(50, 138, 24),                                                                    // front wheel
    C(50, 138, 9, ring()),
    L("M0 166 L232 166", { lv: 2 }),                                                   // ground
    tuft(2, 166, { lv: 3 }), tuft(100, 166, { lv: 3 }), tuft(214, 166, { lv: 3 })
  ]);

  window.DOT_ART = ART;
})();

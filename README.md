# A4 Dot-to-Dot

A single-page site that generates a printable A4 dot-to-dot puzzle. Press
**New puzzle** for a fresh one, **Print** to put it on paper. No build step and
no dependencies at runtime — `index.html` plus a generated `shapes.js`.

## Run it locally

Open `index.html` in a browser. That's it.

If your browser refuses to load `shapes.js` from `file://` (some do), serve the
folder instead:

```sh
npx serve .          # or: python -m http.server
```

## How the picture is randomised

This is the part that isn't obvious, so it's worth stating plainly: **you cannot
randomise a recognisable picture.** Recognisability is semantic information a
random number generator doesn't have — connect random points in order and you
get a scribble every time.

So the picture is *chosen*, and everything else is *randomised*. Each seed picks:

- which of the 79 subjects you get,
- the dot count (within the difficulty's budget),
- a small rotation, mirroring, scale and placement on the page,
- which dot starts each part, and which way round the numbering runs.

Same subject, visibly different sheet every time.

The picture is never turned on its side to fill the paper better — a tractor
lying on its back is much harder to recognise, and recognising it is the whole
point. Wide subjects get landscape paper instead; that is what **Auto** does.

### Difficulty adds detail, not just dots

Dropping 300 dots onto a plain silhouette does not make a harder puzzle — it
makes an easier one, because the outline becomes obvious before you join
anything. A crescent moon at 160 dots is not a puzzle at all.

So difficulty controls two things:

- **How many interior parts are revealed.** Tiny draws the silhouette alone;
  Epic draws up to six parts, so a rooster gains a comb, a wattle and a wing,
  and a tractor gains wheels, a cab and an exhaust.
- **Which subjects are eligible.** Each subject stores a `corners` score
  measuring how much structure its outline really has, and the higher
  difficulties also demand a minimum number of interior parts. A swan has
  plenty of corners but no interior detail, so 167 dots would just retrace its
  outline — Hard and Epic won't pick it. Epic draws from 29 of the 79 subjects,
  Hard from 45, Medium from 73.

### Where the 79 subjects come from

There are no image files in this repo, and no clipart licensing to worry about.
The outlines are traced from **emoji glyphs**: `tools/trace.html` rasterises each
glyph to a canvas, thresholds the alpha channel to a silhouette, keeps the
largest connected part, and extracts the boundary with **marching squares**,
simplifying the result with Ramer–Douglas–Peucker.

Marching squares matters more than it sounds. Walking the boundary pixel by
pixel bakes a one-pixel staircase into every edge, and simplifying a staircase
is what makes an outline look faceted. Marching squares interpolates each
crossing along the cell edge instead, so a smooth glyph edge stays smooth — and
because the curve is cleaner, RDP needs *fewer* points to describe it. That one
change cut `shapes.js` by 17% while improving the drawing.

Two details are easy to get wrong here:

- The glyph's own antialiasing is real sub-pixel information, so the silhouette
  is contoured from the alpha coverage rather than a hard mask. Colour regions
  have no antialiasing and need a blur pass first.
- A chained loop ends where it began. Leave that duplicate point in and RDP
  measures every deviation from a zero-length line and discards the entire
  shape. The seam is also re-anchored at the leftmost point, since RDP always
  keeps its two endpoints and the walk's arbitrary start could fall mid-curve.

Interior detail comes from two places, ranked together by area:

- **Holes.** Every closed loop in the mask is kept, not just the biggest one.
  The hole in a key's bow, a guitar's sound hole, the gap inside a wheel rim —
  discarding those left shapes flat and lifeless. Holes earn a lower size
  threshold than colour regions, because a small hole is unmistakably part of
  the drawing while a small colour patch is usually just shading.
- **Colour regions.** Pixels are quantised to three levels per channel and
  connected regions of one quantised colour become candidate parts. That is
  where eyes, windows, wheels and zebra stripes come from.

Most colour candidates are junk. A band of gradient shading quantises into a
shape that looks like a feature but isn't, and dotting it puts numbers on
something that doesn't exist in the picture. Three tests filter them, and it
took several attempts to find ones that work:

- **Tautness** — the perimeter of the convex hull over the outline's own
  perimeter (≥ 0.78). Shading wanders; a real feature doesn't.
- **Circularity** — `4πA / P²` (≥ 0.18), a floor on extreme slivers.
- **Edge hugging** — the share of the outline sitting on the silhouette
  (≤ 0.55). Shading along a body's edge passes both tests above: it is taut and
  not thin, it just runs alongside the outline, and drawing it gives a camel a
  second contour a few millimetres inside the first.

Circularity alone was the original test, and it was wrong: it measures
*roundness*, not wander, so it rejected any feature that simply wasn't round.
It was throwing away a robot's entire face — visor, eye panel, mouth — while
keeping three 2%-of-glyph scraps. Tautness alone is too permissive and lets the
wavy bands back in. The two overlap and neither separates cleanly (a robot's
visor scores 0.27 circularity / 0.81 tautness; a duck's shading band 0.29 /
0.76), so both are required and a big flat car panel at 0.74 tautness is the
notable casualty. Perfect separation is not on offer here.

Interior parts are also simplified about three times harder than the
silhouette. A colour boundary inside a glyph is usually a soft, dithered
transition rather than a drawn edge — a camel's two-tone flank is a real
feature, but traced at silhouette precision it comes out as a jagged rip.
Coarser simplification keeps the feature and loses the jaggedness; windows and
wheels are unaffected, being made of long straight runs. It also cut
`shapes.js` by a quarter.

When a subject comes out wrong, don't guess:

```sh
node tools/build-shapes.mjs --diag robot
```

prints every candidate part with its area share, circularity, tautness, hug and
the reason it was kept or dropped.

Colour regions are gated on the silhouette blob rather than the whole glyph.
Gating on the glyph let a region belonging to a *detached* blob — the jets above
a fountain's bowl — become a part sitting outside the very outline the page fit
is computed from. Parts are also bounds-checked against the silhouette, since
that failure is invisible until someone prints it.

Tracing runs **once, offline** — never in the visitor's browser. That matters:
emoji fonts differ across Windows, macOS and Android, so tracing at runtime
would mean the same seed drew a different animal on a different device. The
committed `shapes.js` makes a seed reproduce exactly the same puzzle everywhere.

```sh
node tools/build-shapes.mjs      # rewrites shapes.js, needs Chrome or Edge
```

Only re-run that when you change the subject list in `tools/trace.html`.

Subjects are picked for a readable *silhouette*, which is not the same thing as
a readable emoji. A cup, a top hat and a crescent moon collapse into featureless
blobs; a cricket shatters into thin legs and antennae; coral, corn and a pumpkin
trace clean outlines but their interiors come out as scribble. A ferris wheel is
the instructive one — its cabins turn the silhouette into a cog and its spokes
cannot be captured at all, so it reads as a gear with a circle in it. All were
tried and dropped.

**If you change the subject list, render every shape with all its parts and look
at them before committing** — the tracer cannot tell you that a silhouette is
unrecognisable, and that is the only test that matters.

## Dot placement

Two things make the difference between a solvable puzzle and a mess:

- **Corner-first sampling.** Simplifying the outline to N points puts every dot
  on a corner and leaves long straight runs completely bare. So 60% of the
  budget goes to corners for fidelity, and the rest is spread evenly along arc
  length, interpolating *between* stored vertices rather than snapping to them.

  That 60% was measured, not guessed. Sweeping it across every subject at
  40/80/150 dots, against mean deviation from the true outline and against the
  largest gap between consecutive dots:

  | corner share | mean deviation | largest gap ÷ typical |
  | --- | --- | --- |
  | 0.45 | 4.58 | 1.49 |
  | **0.60** | **3.83** | **1.83** |
  | 0.80 | 2.95 | 2.53 |
  | 1.00 (pure RDP) | 2.17 | 6.34 |

  Accuracy keeps improving all the way to pure RDP; solvability falls off a
  cliff. 0.60 takes the accuracy that is free and stops there.

  Weighting the remaining budget by curvature as well was tried and removed: it
  bought under 1% accuracy and made the spacing less even, because the corner
  pass has already put dots where the curvature is.
- **A minimum gap, in millimetres.** Dots closer than the gap are dropped,
  because two numbers that close cannot both be legible. This caps the dot count
  on small or simple outlines — a house has perhaps ten real corners — which is
  why the difficulty menu says "up to". The header always reports the count you
  actually got.

Numbers are placed outside the outline along the local normal. Where detail is
dense, every neighbour pushes out the same way and they still collide, so the
placer also sweeps the offset around the dot and falls back to the position with
the least overlap. Every part shares one collision map, so interior numbers
avoid the outline's numbers too.

Numbering runs continuously across the parts — 1 to N, no repeats — and the
first dot of each part is ringed. That is where you lift the pencil and start a
new closed loop.

## Print

Leave margins at **Default** and scale at **100%** (uncheck "Fit to page").
`@page { size: A4; margin: 0 }` means the sheet prints 1:1. The answer, when
enabled, prints as page 2 with the subject named — the puzzle sheet deliberately
never names it.

## Known limits

- At **Epic** on an intricate subject, numbers can crowd in fine detail
  (a rooster's tail feathers). Medium and Hard are the comfortable range.
- Interior detail is whatever the emoji artist drew as a distinct colour. It is
  usually the right feature, but it is not an illustrator's choice — a few
  subjects gain a part that is more "shading boundary" than "feature".
- The silhouette keeps only the largest connected part of a glyph, so anything
  detached (steam over a cup, a dotted 'i') is lost.
- `shapes.js` is ~166 KB. It is plain ASCII and compresses to a fraction of
  that over HTTP, but it is the bulk of the page weight.

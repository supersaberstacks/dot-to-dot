# A4 Dot-to-Dot

A single-page site that generates a printable A4 dot-to-dot puzzle. Press
**New puzzle** for a fresh one, **Print** to put it on paper. No build step and
no dependencies: `index.html` plus three plain scripts.

| file | what it is |
| --- | --- |
| `art.js` | the 38 subjects, drawn by hand as layered shapes |
| `lineart.js` | turns a drawing into the lines a solver draws |
| `puzzle.js` | turns those lines into numbered dots |
| `tools/preview.html` | authoring aid: every drawing, puzzle and statistic at a glance |

## Run it locally

Open `index.html` in a browser. If your browser refuses to load the scripts
from `file://` (some do), serve the folder instead:

```sh
npx serve .          # or: python -m http.server
```

## What makes a good dot-to-dot

Two things, and they pull against each other:

- **Joined, it has to look like the thing.** That is a question of the
  drawing, and nothing else. An earlier version traced emoji glyphs into
  silhouettes; however carefully the tracing was tuned, the result was a blob
  with colour patches inside it, because an emoji is a painting, not a line
  drawing.
- **Unjoined, it must not.** An outline dotted at even spacing is a dotted
  outline - you can read the subject off it at a glance, and the puzzle is over
  before it starts.

So the subjects are now drawn by hand as line art, with interior lines - the
fold of an ear, the line of a leg against a body, a wing over a flank - and
the dots are placed so that the dot field reads as a scatter until it is
joined.

## How a picture is drawn

Each subject in `art.js` is a stack of simple shapes painted back to front, the
way a cartoon is inked: a filled shape hides whatever is behind it, and only the
visible part of each outline survives. A leg in front of a body cuts the body's
outline where it crosses; an ear in front of a head leaves the head's outline
ending exactly on the ear's edge. Nobody has to work out those junctions by
hand, and the drawing never shows construction lines.

Shapes can share a group, which makes them one outline - a head, a neck and a
body built from three simple shapes, with no seams between them. Lines can be
clipped to a group, so spots, scales and wrinkles can be drawn loosely and
trimmed to the body.

Every layer is tagged with the difficulty it first appears at. Medium draws the
subject and its main features. Hard adds secondary detail - toenails, an ear
fold, the second stripe on a bee - and a little setting: grass, a puddle, a
gull. Epic adds texture and more of the scene: a giraffe's full set of
patches, the fence behind the pig, a crescent moon behind the owl.

The scenery is kept inside the subject's own frame. Anything that sticks out
widens the picture and shrinks the subject on the page: an igloo beside the
penguin printed it at 59% of its Medium size, and a tree beside the giraffe
crowded its patches into tiny clusters of numbers. `tools/preview.html#m=stats`
reports the scale for every subject; all of them now keep at least 83%.

## How a picture becomes a puzzle

1. **Line art.** `lineart.js` flattens the shapes and works out which parts of
   each outline are visible at the chosen difficulty.
2. **Junctions.** Where a line ends on another line, the other line is split
   there, so both share one dot. Two dots a millimetre apart cannot both carry a
   legible number, and the solver could not tell which was which.
3. **Runs.** The lines are chained into runs - what you draw without lifting
   the pencil - starting from loose ends and, at each junction, carrying on
   along whichever line turns least, as you would by hand. A closed loop ends
   back on its first dot, which is how the sheet tells you to close it.
4. **Dots.** Corners and junctions always get a dot. Curves get as many as they
   need to stay within a tolerance of the drawn curve; straight lines get one
   at each end, split only if the gap would make the next number a hunt.
5. **Numbers.** Numbering runs continuously across the runs. A dot that starts
   a new run is ringed and its number is bold. A dot shared by two runs shows
   both numbers, `17/42`.

## Hiding the picture

The dot count is not what makes a puzzle hard to guess - how the dots are
spread is. Three decisions do most of the work:

- **Dots go where the drawing needs them.** A long smooth back gets a dot every
  centimetre or so; a paw gets a cluster. The eye groups evenly spaced dots
  into a line, and uneven spacing defeats that.
- **Harder puzzles get more drawing, not denser dots.** The curve tolerance is
  held within a band for each difficulty (0.6-1.2 mm at Medium, 0.28-0.65 mm at
  Epic). Inside the band it is chosen to bring the count near the target;
  outside it, never. An earlier version reached Epic's 300 by tightening the
  tolerance until it got there, and the owl's eyes came out as two perfect
  dotted rings - the most recognisable thing on the sheet. Epic's extra dots
  now come from the extra layers in the art.
- **The interior is dotted too.** Ear folds, leg lines, patches and the setting
  fill the silhouette with the same scatter as its edge.

Every seed also mirrors the picture at random and tilts it a few degrees. The
picture is never turned on its side to fill the paper better - a tractor on its
back is much harder to recognise, and recognising it is the point. Wide subjects
get landscape paper instead; that is what **Auto** does.

| difficulty | dots (min / median / max) | pencil lifts, average |
| --- | --- | --- |
| Medium | 64 / 94 / 114 | 8 |
| Hard | 99 / 145 / 190 | 14 |
| Epic | 170 / 236 / 300 | 24 |

The count depends on the drawing - a castle is all corners, a whale is all
curves - which is why the menu says "about", and the sheet header always
reports the real count.

## Number placement

Each number tries 64 spots around its dot - sixteen directions at four
distances - and takes the cheapest. The preferred direction is down the middle
of the widest gap between the lines leaving the dot, which is the spot furthest
from all of them. A number has to read as belonging to its dot and no other,
and four faults break that, all priced in millimetres:

- another number in the way,
- a different dot nearer to the number than its own,
- the number printed over a dot,
- the number printed where a line will be drawn through it.

The last one is new, and it matters on a sheet with interior lines: a number
the solver's pencil line runs straight through is half-erased by the time
they get to it. One pass places each number knowing only the numbers before
it, so two refinement passes let every number reconsider against the finished
layout.

Measured over every subject, difficulty and five seeds, as a share of all
numbers printed (`tools/preview.html#m=quality`):

| | over a number | nearer another dot | over a dot | crossed by a line | 3+ numbers on a dot |
| --- | --- | --- | --- | --- | --- |
| Medium | 0.00% | 0.04% | 0.00% | 0.10% | 0.14% |
| Hard | 0.09% | 0.21% | 0.01% | 0.43% | 0.22% |
| Epic | 0.46% | 0.61% | 0.08% | 0.74% | 0.43% |

A puzzle takes about 10-35 ms to build. The occlusion test once took 80% of
that time and a full second for the busiest subject; sorting each shape's
edges into horizontal bands, so a point only tests the edges level with it,
fixed that.

## Adding or changing a subject

Drawings live in `art.js`. A layer is one of:

| helper | layer |
| --- | --- |
| `F(d)` | a filled shape from SVG path data - drawn, and hides what is behind it |
| `L(d)` | a line - drawn, hides nothing |
| `M(d)` | a mask - hides what is behind it, never drawn |
| `E(cx, cy, rx, ry)`, `C(cx, cy, r)` | a filled ellipse or circle |

with options `lv` (first difficulty: 1 Medium, 2 Hard, 3 Epic), `upto`, `g`
(merge into one outline), `clip` (only draw inside a group), `fill: false`
(a ring that hides nothing) and `rot`. There are helpers for the common
pieces - `tube` for tails and necks, `bumpy` for manes and clouds, `spiky`,
`leaf`, `flower`, `tulip`, `sun`, `gull`, `waves`, `water`, `star`,
`battlement` - and `mx` mirrors a path, so a pair of wings is written once.

Then open `tools/preview.html`:

```text
tools/preview.html                    every drawing at all three difficulties
tools/preview.html#t=elephant         one subject
tools/preview.html#m=dots&t=owl       the puzzle and answer at each difficulty
tools/preview.html#m=stats            dots, pencil lifts and scale per subject
tools/preview.html#m=quality          number placement faults
```

**Look at every drawing at every difficulty before committing.** Nothing can
tell you a drawing is unrecognisable except looking at it. In the line-art view
the open ends of lines are marked in red; two red marks a hair apart are a
junction that failed to meet.

Detail that is small on the drawing belongs at a higher difficulty, where dots
may sit closer together. A loop that cannot fit four dots at a difficulty's
spacing is left out rather than drawn as a triangle, and a tick shorter than
the gap between two numbers is dropped.

## Reproducibility

Nothing depends on fonts or the device: the drawings are numbers in `art.js`,
so a seed reproduces the same puzzle. The seed is in the URL along with the
difficulty, paper and subject.

## Print

Leave margins at **Default** and scale at **100%** (uncheck "Fit to page").
`@page { size: A4; margin: 0 }` means the sheet prints 1:1. The answer, when
enabled, prints as page 2 with the subject named - the puzzle sheet deliberately
never names it.

## Known limits

- Epic averages 24 pencil lifts. Spots, buttons and portholes are separate
  closed shapes, and every one is a fresh start. The giraffe, with its patches,
  is the worst at 44.
- Where several lines meet at one point - an owl's talons on a branch - a dot
  can carry three or four numbers. It happens on under half a percent of dots
  at Epic.
- The subject list is hand-drawn, so it grows only as fast as someone draws.

# Making your own things

Everything he can carry (**items**) and everything you can put on his desktop (**props**) is a
small text file in the JSON format. You can make new ones without touching any code.

- **Where the files go:** open his settings → **Items** → **Open items folder**. The examples he
  comes with are already in there (`pen.json`, `wooden-sword.json`, `hammer.json`,
  `bouncy-ball.json`, `chair.json`, `couch.json`, `tv.json`, `scooter.json`).
- **After you save a file:** click **Reload items**. Your new thing shows up in the Inventory
  (items) or Props list, ready to drop in.
- **If it doesn't show up:** there's a mistake in the file. The Terminal says which file it
  couldn't read (`[items] couldn't read ...`). The usual mistakes are a missing comma, an extra
  comma after the last thing in a list, or a missing quote.

The quickest way to start: **copy an example file, give it a new name, and change things.**

---

## 1. Items (things he carries)

An item hangs on his belt, he takes it out to use it, and you can take it from him.

```json
{
  "id": "bat",
  "name": "Baseball bat",
  "about": "A wooden bat. He swings it at your cursor.",
  "use": "swing",
  "length": 34,
  "grip": 8,
  "belt": "back",
  "hit": 1.4,
  "shape": [
    { "pts": [[-8, 0], [10, 0]], "color": "#6b4426", "width": 3 },
    { "pts": [[10, 0], [34, 0]], "color": "#c8955c", "width": 5 }
  ]
}
```

| field   | what it means |
|---------|---------------|
| `id`    | a short unique name: lowercase letters, numbers and dashes (`bat`, `magic-wand`). Two files with the same `id`: the newest wins. |
| `name`  | what it's called in menus ("Take baseball bat"). |
| `about` | one line describing it (shown in the Inventory). |
| `use`   | what he does with it (see below). |
| `length`| pixels from his hand to the far end (at his normal size). |
| `grip`  | pixels of handle sticking out behind his hand. |
| `belt`  | where he keeps it: `side` (a hip), `back`, `pocket` (small things, hidden), or `none` (he can't put it away). |
| `hit`   | how hard it hits: `0` harmless, `1` a wooden sword, `2` a big hit. Anything that hits can knock your cursor flying. |
| `bounce`| how bouncy it is when it lands: `0` a thud, `0.9` a super ball. Leave it out for `0.3`. |
| `shape` | the drawing (see "Drawing it" below). |

### What `use` does

| `use`   | he... |
|---------|-------|
| `draw`  | draws with it (like his pen). Without a `draw` item, he can't draw at all. |
| `swing` | swings it like a sword: practice slashes, and at your cursor when he's mad. |
| `smash` | brings it down overhead like a hammer: on your cursor, or on the window he's standing on. |
| `throw` | throws it at your cursor, or bounces it off the floor and catches it. Give it a `bounce`. |
| `none`  | just carries it around. |

### Drawing it

The drawing is a list of **strokes**. Each stroke is a line through some points, with a color
and a thickness:

```json
{ "pts": [[0, 0], [20, 0]], "color": "#c8955c", "width": 3 }
```

For items, a point is `[along, across]`:

- `along` is how far along the item: **0 = his hand**, positive = toward the tip, negative =
  toward the handle end (so the handle goes from `-grip` to `0`).
- `across` is sideways: `0` is the middle line, `+5` / `-5` is 5 pixels to either side.

So a sword is a long stroke from `[0, 0]` to `[30, 0]` (the blade), a short one from `[0, -5]`
to `[0, 5]` (the cross-guard), and one from `[-7, 0]` to `[0, 0]` (the handle).

Colors are written like `#ff8800` (red, green and blue, two digits each, 00 to ff).
Any color picker online gives you this code.

---

## 2. Props (furniture and toys)

A prop is a solid thing that sits on his desktop: it falls, it can be pushed and tipped over,
you can drag it around, and he can stand on top of it. The only thing that makes a file a prop
is the line `"type": "prop"`.

```json
{
  "type": "prop",
  "id": "stool",
  "name": "Stool",
  "about": "A little stool.",
  "use": "seat",
  "outline": [[0, 0], [24, 0], [24, 30], [0, 30]],
  "seat": [12, -1],
  "shape": [
    { "pts": [[0, 2], [24, 2]], "color": "#a8703c", "width": 5 },
    { "pts": [[3, 2], [3, 30]], "color": "#8a5a30", "width": 3 },
    { "pts": [[21, 2], [21, 30]], "color": "#8a5a30", "width": 3 }
  ]
}
```

For props, a point is `[x, y]` in pixels at his normal size: **`[0, 0]` is the top-left**,
`x` goes right, and **`y` goes DOWN** (like on a screen). He's about 90 pixels tall, so a chair
around 45 tall looks right next to him.

| field     | what it means |
|-----------|---------------|
| `type`    | always `"prop"`. |
| `id`, `name`, `about` | same as items. |
| `use`     | what he does with it: `seat` (he sits on it), `tv` (he watches it), `ride` (he rides it), or `none` (it's just a thing to stand on and knock over). |
| `outline` | its solid shape: the corners around its edge **in clockwise order** (go around it like the hands of a clock, starting anywhere). This is what has weight, what lands on the floor, and what he can stand on: every edge along the top is a surface. |
| `seat`    | (`seat`) where his bottom goes when he sits. |
| `screen`  | (`tv`) the screen: `[x, y, width, height]`. It's dark until he switches it on, then shows cartoons. |
| `wheels`, `wheel`, `bar` | (`ride`) which outline corners are wheels (by position in the list, counting from 0), how big the wheels are, and where he holds on (`[x, y]`). |
| `friction`| how grippy it is on the floor: `0.6` stays put (the default), `0.01` rolls. |
| `shape`   | the drawing: strokes like items, but with `[x, y]` points, or flat filled shapes (see "Flat art" below). The drawing doesn't have to match the outline exactly (the chair's outline is a simple shape; its drawing has legs and a back). |

### Tips

- **Keep the outline simple.** 4 to 8 corners. A box is `[[0,0],[w,0],[w,h],[0,h]]`.
- **Clockwise matters.** If he falls through the top of your prop, the outline is probably
  counter-clockwise: reverse the list.
- **Something he can stand on** needs a flat-ish edge along the top (steep edges don't count).
- Props come out of the top of the screen when you drop them in, so give them a moment to land.

---

## Flat art (the house style)

The couch and TV are drawn the way he is: flat, front-on shapes with no outlines, muted colors (so he
stays the brightest thing on screen), soft rounded corners, and a couple of tones for shading. They're
drawn smooth and then pixelated at **his** pixel size, so they always match him; there's no separate
pixel art to keep in step. Add filled pieces to `shape`:

```json
{ "rect": [10, 24, 84, 12], "radius": 4, "fill": "#b3a995" },
{ "pts": [[0, 10], [12, 0], [24, 10]], "fill": "#9a917f" }
```

- `rect` is `[x, y, width, height]`, with rounded corners of `radius`; `pts` + `fill` is any flat shape.
- Pieces are painted in order, so list what's at the back first.
- Add `"color"` and `"width"` to give a filled piece an edge line (usually you won't).
- Keep every part at least 4 wide: thinner bits break up or vanish once he's pixelated.
- A TV's `screen` is painted on top of the body, rounded, and shows his shows, his game, or your Othello board.

## Pixel sprites and removable gear

Items and props can use a `sprite` instead of line strokes. Copy a shipped example to start:

```json
"sprite": {
  "x": 0, "y": 0, "pixel": 2,
  "palette": { "o": "#29232d", "w": "#be8550" },
  "rows": ["oooo", "owwo", "oooo"]
}
```

Every character is one pixel; `.` is transparent. Rows must have the same width, up to 128 columns
and 128 rows. Palette colors are six-digit hex values. `pixel` is the local pixel size, before scaling
with him. `x`/`y` locate the sprite in the same coordinates as the object's drawing. Sprite props keep
their own two-screen-point grid (they don't follow his pixel size, so prefer flat art for new props). You can also keep `shape` strokes for details or older custom art.
Sprites supply art; `outline`, `seat`, `screen` and wheels still supply the physical interaction.

For equipment, copy `helmet.json` or `boots.json`. Set `"wear": "head"` or `"wear": "feet"`,
`"use": "none"`, `"belt": "none"`, and `"hit": 0`. The helmet follows his head; the boot sprite is
attached to each present foot and mirrored when he turns left. Take/drop/give-back work like tools.
Only one item can occupy each equipment location; a replacement drops the previous one. This is
cosmetic clothing, with no armor or health system.

Games are played on the TV (its console is part of the TV): his own runner game, and Othello with you.

## 3. Making your own version of him

You can already change a lot in his settings without any files: his **name**, his **color**,
his **size**, how he **looks** (line thickness, head size, pixel size) and how he **moves**
(Look and Movement tabs). All of it is saved in `pet.json`, next to the items folder.

So an orange one named Leonard is: Settings → General → name `Leonard`, color orange. To give
someone else a Leonard, they'd set the same thing on their copy (or you send them your `pet.json`
to drop into their app's data folder; it's a plain text file, so you can see everything in it).

His look today is drawn in code (lines and circles), not from picture files, so there are no
"textures" to swap yet. If you want that, it's a good next project: picture files for his head,
body or items, the same way items are files now.

---

## 4. For the curious: how it works

New examples include `mace.json`, `helmet.json`, `boots.json`, `canvas.json` and `desk.json`. A canvas uses
`"use": "canvas"` and a `screen` rectangle for the painting area. Any `"use": "tv"` prop can host his video
game and Othello; defining a new game needs code. See `src/core/tv-game.ts`, `src/core/board-game.ts` and
`src/core/skills/props.ts`. Canvas pictures are saved with the pet.
The mace uses `smash`; existing mallets still work. Customized copies of the older examples are
preserved when bundled examples improve.

- Items live in `src/core/items.ts`. The example files are in `src/core/items/`.
- Props live in `src/core/props.ts` (the same physics as his drawings coming to life). The
  example files are in `src/core/props/`.
- What he *does* with each `use` is a "skill" in `src/core/skills.ts` (`SwordSwing`,
  `ThrowItem`, `SitOnProp`, `WatchTV`, `RideScooter`...). A brand-new kind of `use` needs a new
  skill, which is code, not just a file.

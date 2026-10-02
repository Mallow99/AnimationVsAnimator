# Item definition files

(The full step-by-step guide, for items AND props, is MAKING-THINGS.md in this folder.)

Each `.json` file here is one thing he can carry on his belt and use. The ones in this
folder ship with him. You can make your own: on the desktop, Settings → Items →
"Open items folder", copy one of these files there, change it, and click "Reload items".

| field   | what it means |
|---------|---------------|
| `id`    | a short unique name, letters and dashes (`pen`, `sword`, `wand`) |
| `name`  | what it's called in menus |
| `about` | one line describing it |
| `use`   | what he does with it: `draw` (a pen), `swing` (a sword or bat), `smash` (a hammer: overhead, straight down), `throw` (a ball: he throws it at your cursor, or bounces and catches it), `none` (he just carries it) |
| `length`| pixels from where he holds it to the tip, at normal size |
| `grip`  | pixels of handle behind his hand |
| `belt`  | where it goes: `side` (a hip), `back`, `pocket` (small things, out of sight), or `none` (doesn't fit on the belt) |
| `hit`   | how hard it hits when swung or thrown: 0 = harmless, 1 = a wooden sword, 2 = a big hit. Anything that hits can knock your cursor flying |
| `bounce`| how bouncy it is when it lands (0 = a thud, 0.9 = a super ball). Default 0.3 |
| `shape` | the drawing: a list of strokes. Each stroke has `pts` (points `[along, across]` in pixels: `along` 0 = his hand, positive toward the tip, negative toward the handle end; `across` sideways), a `color` and a `width` |

If `shape` is left out, it's drawn as a plain line in `color` (default dark grey).

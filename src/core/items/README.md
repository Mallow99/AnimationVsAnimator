# Item definition files

Each `.json` file here is one thing he can carry on his belt and use. The ones in this
folder ship with him. You can make your own: on the desktop, Settings → Items →
"Open items folder", copy one of these files there, change it, and click "Reload items".

| field   | what it means |
|---------|---------------|
| `id`    | a short unique name, letters and dashes (`pen`, `sword`, `wand`) |
| `name`  | what it's called in menus |
| `about` | one line describing it |
| `use`   | what he does with it: `draw` (a pen), `swing` (a sword or bat), `none` (he just carries it) |
| `length`| pixels from where he holds it to the tip, at normal size |
| `grip`  | pixels of handle behind his hand |
| `belt`  | where it hangs on his belt: `side` (a hip), `back`, or `none` (doesn't fit on the belt) |
| `hit`   | how hard it hits when swung: 0 = harmless, 1 = a wooden sword, 2 = a big hit |
| `shape` | the drawing: a list of strokes. Each stroke has `pts` (points `[along, across]` in pixels: `along` 0 = his hand, positive toward the tip, negative toward the handle end; `across` sideways), a `color` and a `width` |

If `shape` is left out, it's drawn as a plain line in `color` (default dark grey).

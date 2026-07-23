# Design

Approved **visual direction** for Rectangle.

| Path | Purpose |
|------|---------|
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Tokens, layout, components, do/don’t |
| [tokens/shell.tokens.json](./tokens/shell.tokens.json) | Machine-readable tokens |
| [GUI_SIZING_RULES.md](./GUI_SIZING_RULES.md) | Mandatory dense desktop sizing, spacing, margin, padding, table, and shell layout rules |
| [MOTION_GUIDELINES.md](./MOTION_GUIDELINES.md) | Mandatory motion rules for shell, menu, AI panel, and feature transitions |
| [demo/shell.html](./demo/shell.html) | Interactive HTML demo (open in a browser) |

## How to view the demo

```bash
# from repo root
open design/demo/shell.html
# or
npx --yes serve design/demo
```

## Next

Rebuild this shell in the production framework (React + Vite or Next.js) using the tokens above — pixel-faithful chrome, real routes inside the white panel.

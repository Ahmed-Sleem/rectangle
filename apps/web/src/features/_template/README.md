# Feature template

1. Copy this folder to `src/features/<id>/`.
2. Edit `index.ts`: `id`, `title`, `routePath`, `order`, `icon`, `enabled: true`.
3. Replace the empty page with a real page component.
4. Registry auto-discovers `features/*/index.ts` (except `_template`).

Do not import other features — only `@/shared` and your own tree.

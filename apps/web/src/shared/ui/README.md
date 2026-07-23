# Shared UI primitives

Production-ready, theme-token-driven building blocks for Rectangle feature pages.

## Rules

- Import from `@/shared/ui` only.
- Do not hardcode colors in feature UI; use these components or theme tokens.
- Every new primitive must include component tests.
- Every interactive primitive needs accessible labels/focus behavior.
- Feature pages should compose these primitives instead of inventing local button/card/table styles.

## Current primitives

- `Button`, `IconButton`
- `Input`, `Textarea`, `Select`, `Field`
- `Checkbox`, `Switch`
- `Badge`, `Card`, `Toolbar`
- `PageHeader`, `PageGrid`
- `EmptyState`, `LoadingState`, `ErrorState`, `SuccessState`, `WarningState`
- `DataTable`
- `Drawer`, `Modal`, `ConfirmDialog`, `Toast`

## Verification

```bash
cd apps/web
npm test -- src/shared/ui/primitives.test.tsx
npm run verify
```

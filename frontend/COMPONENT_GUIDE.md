# PATHMAP Frontend Component Guide

PATHMAP UI components should feel quiet, direct, and operational. Use shared primitives first, then local CSS only when a page needs domain-specific layout.

## Core Primitives

### Button

Use `Button` for text actions, submits, and command buttons.

```tsx
<Button variant="primary" size="lg" loading={saving} fullWidth>
  Save settings
</Button>
```

Rules:

- Use `variant="primary"` for the main action in a view.
- Use `variant="secondary"` for supporting actions.
- Use `variant="ghost"` for low-emphasis navigation or inline swaps.
- Use `loading` instead of custom spinner markup.
- Keep visible labels concise and action-oriented.

### IconButton

Use `IconButton` for icon-only controls.

```tsx
<IconButton label="Close dialog" icon={<X aria-hidden="true" />} />
```

Rules:

- `label` is required and becomes both `aria-label` and default `title`.
- The icon must be decorative (`aria-hidden="true"`) unless it adds text not present in the label.
- Minimum hit target is 40px; prefer 44px when the surrounding layout allows it.

### Dialog

Use `Dialog` for modal surfaces. It provides `role="dialog"`, `aria-modal`, Escape close, close button naming, and focus return.

```tsx
<Dialog open={open} title="Create Account" onClose={closeDialog}>
  <form>...</form>
</Dialog>
```

Rules:

- Titles must be literal and user-facing.
- Put the primary action inside the body, not the header.
- Keep modal content focused on one job.

### ToastStack and useToast

Use `useToast` plus `ToastStack` for transient action feedback.

```tsx
const { messages, showToast, dismiss } = useToast();
showToast({ kind: 'success', title: 'Settings saved' });
<ToastStack messages={messages} onDismiss={dismiss} />;
```

Rules:

- Use success to confirm completed mutations.
- Use error when the user can act on the failure.
- Use info for state changes like tracking started or reset complete.
- Avoid using alerts for recoverable app feedback.

### EmptyState

Use `EmptyState` when a list, panel, or workflow has nothing to show.

```tsx
<EmptyState title="No tracked devices yet" message="Connect a device to start tracking." />
```

Rules:

- Explain what is missing and what to do next.
- Include an action when the next step is available on the same surface.
- Do not use empty states as marketing copy.

### Skeleton

Use `Skeleton` when content is actively loading.

```tsx
<Skeleton variant="card" label="Calculating route" />
```

Rules:

- Use skeletons for operations that can visibly take longer than about 500ms.
- Always provide a specific `label` for assistive tech.
- Respect reduced-motion; the shared component already does.

## Accessibility Checklist

Before shipping a UI change:

- Every icon-only button uses `IconButton` or has an equivalent `aria-label` and `title`.
- Every modal uses `Dialog` or equivalent `role="dialog"`, `aria-modal`, Escape close, and focus return.
- Every loading state has `role="status"` or visible text.
- Every destructive action is clearly labeled and styled consistently.
- Forms use associated labels or accessible names.
- No recoverable UI errors are console-only.

## Control Surface & Telemetry

These overlays live above the map and are driven by the eventBus + service
singletons (no global store). See `docs/control-telemetry-encryption.md` for the
full architecture.

### ControlCenter

`components/ControlCenter` renders the on-screen map control cluster (zoom,
recenter, follow-me, compass, tilt, mode, bearing-lock, fullscreen, scale bar).
It is self-contained - mount it once as a sibling of `MapView3D`. Every control
calls `mapCommandBus`; live camera state comes from the `map:camera` event.

### CommandPalette

`components/CommandPalette` is the Cmd/Ctrl-K palette. Register view-specific
commands with `commandRegistry.registerMany([...])` in an effect and return the
unregister function. Commands are `{ id, label, group?, keywords?, run }`.

### TelemetryHUD

`components/TelemetryHUD` is the live flow-tracking panel, gated by
`controlState.hudVisible` (toggle via the palette). It starts/stops `telemetryBus`
with visibility, so it costs nothing when closed. Add timings with
`telemetryBus.mark(name, ms)`.

### Accessibility prefs

Appearance/accessibility prefs are applied to the DOM root via
`utils/applyPrefs.ts` (theme, reduced motion, high contrast, text scale). New
components must use the type tokens (which honor `--text-scale`), provide 44px
touch targets, and label every icon-only control.

## Commercial Copy

PathMap is proprietary commercial software, not freeware or an open-source distribution. User-facing billing, license, and plan language should be clear about evaluation limits, paid production use, and the current plan without pretending that payment processing exists inside the frontend.

## Verification

Run these gates for user-facing changes:

```powershell
npm run typecheck
npx vitest run src/components/Button.test.tsx src/components/UXPrimitives.test.tsx src/components/controlSurface.a11y.test.tsx
npm run build
```

For broad changes, run the full suite:

```powershell
npm run test
```

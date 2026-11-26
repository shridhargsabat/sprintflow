# Scrollbar UI System

CSS-first, no JS dragging. Styles live in `src/index.css`.

## What got styled
- Global thin scrollbars: 10px, transparent track.
- Thumb: slate-400/60, rounded-full, transparent border; hover darker.
- Dark mode: `.dark` thumb variants (slate-500/65, hover slate-400/80).
- Firefox fallback on `*`: `scrollbar-width: thin; scrollbar-color`.
- `.scroll-slim`: 6px variant for dense areas.
- `.scroll-hidden`: hides scrollbars, keeps scroll.

## Scrollable props
- `children`: content. `className?`: extra classes.
- `slim?`: applies `.scroll-slim`. `maxH?`: max-height CSS value.

```tsx
import Scrollable from './Scrollable';

<Scrollable slim maxH="320px" className="pr-2">
  {/* long content */}
</Scrollable>
```

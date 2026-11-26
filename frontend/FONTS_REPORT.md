# Fonts Report — SprintFlow Frontend

## 1. Current state

| Location | Declaration |
|---|---|
| `src/App.tsx:105` (root div inline style) | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif` |
| `src/index.css:6` (body) | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| `tailwind.config.js:19` (`font-sans`) | `Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif` |
| `index.html` | No font links/imports |
| Components (136 hits) | Tailwind `font-semibold/medium/bold` + `tracking-*` only; no custom families |

Notes: no `@font-face`, no webfont downloads — Inter only renders if
installed locally; otherwise the stack falls through to system fonts.
No `letter-spacing` in raw CSS; tracking is Tailwind utilities only.

## 2. What `-apple-system` resolves to

On Safari/macOS/iOS, `-apple-system` / `system-ui` renders Apple's San
Francisco (SF Pro on macOS/iOS, SF Compact on watchOS) using the copy
already on the device — zero download, zero license issue, automatic
OS updates. On Windows it falls through to Segoe UI, on Android to Roboto.
Naming the system font in CSS is explicitly fine per Microsoft's font FAQ
and WebKit docs; only copying font *files* to a server is restricted.

## 3. Licensing verdict: do NOT bundle SF Pro as a webfont

Apple's SF license (developer.apple.com/fonts) permits use "solely for
creating mock-ups of user interfaces to be used in software products
running on Apple's iOS, macOS or tvOS", and states: "You may not embed
the Apple Font in any software programs" nor use it for "website content
or any other work product." Serving SF Pro woff2 to non-Apple visitors
violates this. Apple docs also say: "Don't bundle fonts that Apple
ships with the system" (SF Pro, SF Compact, SF Mono, New York).
Sources: developer.apple.com/fonts; developer.apple.com/forums/thread/733267;
developer.apple.com/documentation/technologyoverviews/managing-the-fonts-for-your-app.

## 4. Ranked recommendation

1. **Keep the system stack (recommended: $0, 0 KB).** Apple visitors
   already see genuine SF Pro for free. Only fix the ordering conflict:
   App.tsx puts `-apple-system` first, index.css puts Inter first.
   Standardize on `-apple-system` first for the true Apple look.
   - Pros: authentic SF on Apple, fastest, no licensing risk.
   - Cons: non-Apple visitors see Segoe UI/Roboto (still fine).
2. **Self-host Inter Variable (SIL OFL 1.1, free).** One woff2 covers
   weights 100–900 + optical-size axis (`opsz` 14–32); ~300 KB, or
   subsetted latin ~100 KB. Use only if cross-platform consistency
   matters more than the native Apple look.
   - Pros: identical everywhere, open license, variable = 1 file.
   - Cons: extra download; Apple users lose genuine SF rendering.
3. **Inter Tight for display/headings only (SIL OFL 1.1, free).** Same
   glyphs as Inter with tighter default spacing; pairs with option 1/2
   for headlines via a `font-display` family.
   - Pros: premium tight headlines without manual tracking.
   - Cons: second file to load; marginal gain if body stays system.

**Bottom line:** keep `-apple-system`-first system stack; optionally add
self-hosted Inter Variable as the non-Apple fallback, never SF Pro files.

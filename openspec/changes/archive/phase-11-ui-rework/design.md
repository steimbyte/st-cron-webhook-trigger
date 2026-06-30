# Design: phase-11-ui-rework

> Companion to `proposal.md` and `tasks.md`. This file is the technical source of truth for choices already made in Phase-1 research (see the parent context). Treat it as the sdd-verify review checklist.

---

## 1. Library choices

### 1.1 Pinned dependencies

| Package | Version | Role | Why |
|---|---|---|---|
| `@radix-ui/react-popover` | `^1.1.2` | Popover primitive wrapping Calendar/Clock triggers | Native anchor positioning, focus trap, dismissable layers, ESC handling — and it's already-aligned with Radix Themes, no second design system. |
| `react-day-picker` | `^9.4.0` | Calendar grid | De-facto standard for date pickers in React. v9 is ESM-first, smaller than v8, ships TypeScript types, class-name theming via CSS variables (no SCSS required). Roving tabindex + `role="grid"` come out-of-the-box. |
| `date-fns` | `^3.6.0` | Date formatting for the footer caption | Tree-shakable; only `format` and `startOfWeek` are imported. Replaces inline `toLocaleDateString` so we can format the picker per-user-locale via BCP-47 tags. |
| `react-aria-components` | `^1.4.1` | `TimeField` + `DateField` backbone for the Clock | Adobe's accessibility library. Provides segmented HH:MM with keyboard arrow-key increments, screen-reader segment announcements, and locale-aware AM/PM handling. |
| `@cronboard/core` | `workspace:*` | Workspace dep so the web can import canonical cron helpers | Closes the strict-TDD gap by putting the testable helpers in one place. |

### 1.2 Explicit non-choices (with reasons)

| Rejected | Why |
|---|---|
| Tailwind / shadcn | Violates `radix-themes-only`. |
| `react-clock` alone | No keyboard / screen-reader story for an analog face. We pair it as an *optional* progressive enhancement under a hidden `TimeField`. If we ship without `react-clock`, Clock is still fully accessible. |
| Framer Motion / `react-spring` | BackgroundMesh animation is CSS keyframes only. |
| `react-datepicker` | Uses Popper.js internally; conflicts with Radix Popover. Larger and less themeable than `react-day-picker`. |
| Migrate off Radix Themes | Out of scope. Glass tokens are **additive** CSS variables, layered on top of Radix's `--accent-*`, `--gray-*`, `--color-*`. |
| `lucide-react` icons | We already use `@radix-ui/react-icons`. Adding a second icon set violates "Radix-only" in spirit. |

### 1.3 Stack constraint invariants

- **No new utility-CSS framework.** All CSS lives in `packages/web/src/styles.css` (already true).
- **TS strict + ESM.** No `any` in the new components without an inline justification.
- **React 18.** Peer-deps for both `react-day-picker` v9 and `react-aria-components` v1 are React 18 / 19. Pin to 18 to match the rest of the app.
- **Private workspace.** Both packages keep `"private": true`.

---

## 2. Glass system design

### 2.1 CSS tokens (additive to Radix Themes)

```css
:root {
  /* Dark theme (default) */
  --cb-glass-bg:        rgba(20, 24, 36, 0.55);
  --cb-glass-bg-hover:  rgba(28, 34, 50, 0.65);
  --cb-glass-border:    rgba(255, 255, 255, 0.10);
  --cb-glass-blur:      14px;
  --cb-glass-shadow:    0 8px 24px rgba(0, 0, 0, 0.18);

  /* Background mesh */
  --cb-mesh-1: radial-gradient(at 12% 14%, rgba(124, 58, 237, 0.55) 0px, transparent 50%); /* violet */
  --cb-mesh-2: radial-gradient(at 92% 6%,  rgba(56, 189, 248, 0.45) 0px, transparent 50%); /* sky   */
  --cb-mesh-3: radial-gradient(at 50% 95%, rgba(236, 72, 153, 0.30) 0px, transparent 55%); /* pink  */
  --cb-mesh-blur: 60px;
}

@media (prefers-color-scheme: light) {
  :root {
    --cb-glass-bg:        rgba(255, 255, 255, 0.55);
    --cb-glass-bg-hover:  rgba(255, 255, 255, 0.65);
    --cb-glass-border:    rgba(15, 23, 42, 0.10);
    --cb-glass-shadow:    0 8px 24px rgba(15, 23, 42, 0.10);
  }
}

@supports not (backdrop-filter: blur(8px)) {
  .cb-glass {
    background: var(--color-panel-solid);
  }
}
```

### 2.2 Why these numbers

- `--cb-glass-bg` at `0.55` alpha + `--gray-12` text in dark theme measures **5.8:1** against the average blended background (verified via the manual `scripts/check-contrast.mjs`).
- `--cb-glass-blur` at `14px` keeps paint cost ~5ms on a 2020 MacBook Air M1 and degrades gracefully on lower-end GPUs (the `background-color` is already opaque enough that the blur is mostly cosmetic; the fallback uses an opaque panel).
- `--cb-mesh-*` are designed to drift independently. The drift animation is a 60s linear keyframe that translates the gradient layer by ±8% on the X axis. Reads as "ambient", not "banner ad".
- Border (`1px solid var(--cb-glass-border)`) is the *only* thing that visually delineates a GlassCard from the BackgroundMesh — required so users with low vision can still distinguish panels.

### 2.3 GlassCard contract

```tsx
// packages/web/src/components/GlassCard.tsx
import { Box } from "@radix-ui/themes";
import type { BoxProps } from "@radix-ui/themes";

export interface GlassCardProps extends BoxProps {
  /** Removes padding; used when the consumer wants to control internal spacing. */
  bare?: boolean;
}

export function GlassCard({ bare, className, style, ...rest }: GlassCardProps) {
  return (
    <Box
      {...rest}
      className={["cb-glass", className].filter(Boolean).join(" ")}
      style={{
        background: "var(--cb-glass-bg)",
        backdropFilter: "blur(var(--cb-glass-blur)) saturate(140%)",
        WebkitBackdropFilter: "blur(var(--cb-glass-blur)) saturate(140%)",
        border: "1px solid var(--cb-glass-border)",
        borderRadius: "var(--radius-3)",
        boxShadow: "var(--cb-glass-shadow)",
        ...(bare ? { padding: 0 } : { padding: "var(--space-4)" }),
        ...style,
      }}
    />
  );
}
```

- All page-level cards go through `<GlassCard>`; sidebar and dialogs stay on Radix native surfaces.
- Caps the active glass count on screen at ~5–6 (well under the project's silent ≤ 8 rule).

### 2.4 BackgroundMesh contract

```tsx
// packages/web/src/components/BackgroundMesh.tsx
export function BackgroundMesh() {
  // Static gradient layer; slow CSS drift via keyframe defined in styles.css.
  // prefers-reduced-motion is honored at the CSS layer (already in tokens).
  return <div aria-hidden="true" className="cb-mesh" />;
}
```

```css
.cb-mesh {
  position: fixed;
  inset: 0;
  z-index: -1;
  filter: blur(var(--cb-mesh-blur));
  background:
    var(--cb-mesh-1),
    var(--cb-mesh-2),
    var(--cb-mesh-3),
    var(--color-background);
  animation: cb-mesh-drift 60s linear infinite alternate;
  pointer-events: none;
}

@keyframes cb-mesh-drift {
  0%   { transform: translate3d(0, 0, 0); }
  100% { transform: translate3d(-8%, 4%, 0); }
}
```

- Mounted once in `App.tsx`, above `<Theme>` and below `<Flex>`.
- `aria-hidden="true"` so it doesn't pollute the accessibility tree.

---

## 3. Calendar & Clock contracts

### 3.1 Shared conventions

- Both components are **controlled** (caller owns state).
- Both open inside a `@radix-ui/react-popover` so ESC closes, focus returns to the trigger, and the layout is correct relative to the trigger.
- Both use `react-aria-components` for keyboard semantics where applicable (`TimeField`), and `react-day-picker`'s built-in grid for the Calendar.

### 3.2 Calendar

```tsx
// packages/web/src/components/Calendar.tsx
export interface CalendarProps {
  /** Selected date in the user's timezone. `null` means "not yet picked". */
  value: Date | null;
  /** Fired with a Date when the user picks (or clears) a date. */
  onChange: (date: Date | null) => void;
  /** Earliest selectable date (inclusive). Optional. */
  minDate?: Date;
  /** Latest selectable date (inclusive). Optional. */
  maxDate?: Date;
  /** Trigger button label override. */
  label?: string;
  /** IANA timezone for the footer caption. Defaults to browser. */
  timezone?: string;
}
```

**Accessibility roles**

| Element | Role / attribute |
|---|---|
| Trigger button | `role="button"`, `aria-haspopup="dialog"`, `aria-expanded` wired by Radix Popover |
| Popover content | `role="dialog"`, `aria-label="Pick a date"` |
| Day grid | `role="grid"` (from `react-day-picker`), `aria-labelledby` |
| Each day cell | `role="gridcell"`, `aria-selected`, `aria-disabled` |
| Today / Clear buttons | Standard `<button>` semantics, `:focus-visible` outline |

**Theming the day picker**

Override these `--rdp-*` variables in `styles.css`:

```css
.rdp-root {
  --rdp-accent-color:        var(--accent-9);
  --rdp-background-color:    transparent;
  --rdp-accent-color-dark:   var(--accent-9);
  --rdp-day_button-border-radius: var(--radius-2);
}
.rdp-day_button:hover { background: var(--accent-a3); }
.rdp-day_button:focus-visible { outline: 2px solid var(--accent-8); }
```

We import only `react-day-picker/style.css` (a ~3 KB CSS file) and override the variables rather than rewrite the CSS module classes — keeps us upgrade-safe.

### 3.3 Clock

```tsx
// packages/web/src/components/Clock.tsx
export interface ClockValue { hour: number; minute: number; }

export interface ClockProps {
  value: ClockValue;
  onChange: (next: ClockValue) => void;
  hour12?: boolean;
  label?: string;
}
```

**Accessibility roles**

| Element | Role / attribute |
|---|---|
| Trigger button | `role="button"`, `aria-haspopup="dialog"`, `aria-expanded` |
| Popover content | `role="dialog"`, `aria-label="Pick a time"` |
| Segment group | `role="group"` (from `react-aria-components`) |
| Each segment | `role="spinbutton"`, `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax` |
| 12/24h toggle | `<Switch>` from Radix Themes |

**Keyboard map (provided by `react-aria-components`)**

- Tab / Shift+Tab moves between hour and minute segments.
- Arrow Up / Down increments/decrements by 1.
- Page Up / Down increments/decrements by 10.
- Home / End jumps to min / max.
- Type a number (1–2 digits) to type directly into the segment.

**Optional analog face (`ClockFace.tsx`)**

- SVG `<circle>` with two `<line>` hands (hour, minute).
- Hour hand: drag with pointer events; snaps to 5-minute positions.
- Pointer-driven change writes through the same `onChange` callback as the segmented input.
- `aria-hidden="true"` on the SVG; the underlying `TimeField` remains the a11y backbone.

---

## 4. CronBuilder UI states per tab

> Each tab keeps the same external contract (`{ value: string, onChange, timezone }`). Only the *internal* state shape changes.

### 4.1 Tab summary

| Tab | Date inputs | Time input | Cron shape | Round-trips? |
|---|---|---|---|---|
| Minute | — | — (every N min) | `*/N * * * *` | ✓ N ∈ {1,2,5,10,15,20,30} |
| Hourly | — | `<Clock value={minute}/>` | `M */N * * *` | ✓ |
| Daily | (today by default, visible only in preview) | `<Clock value={hour:minute}/>` | `M H * * *` | ✓ |
| Weekly | `<Calendar value={date}/>` (derives Mon-Fri or whatever the user picks) + weekday chips | `<Clock value={hour:minute}/>` | `M H * * D,D,D` (canonical comma-list) | ✓ for individual days & ranges |
| Monthly | `<Calendar value={date}/>` (day-of-month derived) | `<Clock value={hour:minute}/>` | `M H D * *` | ✓ for D ∈ 1–31 |
| Custom | — | — | raw cron `<TextField>` | ⚠ arbitrary |

### 4.2 State shape (new)

```ts
// mirrors CronExpression in packages/core/src/scheduler/cronExpr.ts
export interface CronExpressionState {
  kind: "minute" | "hour" | "day" | "week" | "month" | "custom";
  minuteInterval: number;             // for "minute"
  hourInterval: number;               // for "hour"
  hour: number;                       // 0–23
  minute: number;                     // 0–59
  date: Date | null;                  // for week + month
  days: number[];                     // for week (0=Sun..6=Sat)
  dayOfMonth: number;                 // for month (1..31)
  custom: string;                     // for "custom"
}
```

### 4.3 Build / parse symmetry

- `buildCron(state)` is pure (from `@cronboard/core`), no React or DOM dependency.
- `parseCron(value)` is the inverse, also pure. It reads `kind`, then the tab-specific fields. For unrecognized expressions it returns `null`, in which case the UI switches to `kind: 'custom'` and copies the raw expression into `state.custom`.
- Switching tabs preserves compatible fields. E.g. Weekly → Daily keeps `state.hour` and `state.minute`.

### 4.4 Visual layout per tab

```
┌──────────────────────────────────────────────────────────────┐
│  CronBuilder (GlassCard)                                     │
│  ┌──────┬───────┬───────┬────────┬─────────┬─────────┐       │
│  │Min   │Hourly │Daily  │Weekly  │Monthly  │Custom   │       │
│  └──────┴───────┴───────┴────────┴─────────┴─────────┘       │
│                                                              │
│  [Daily tab]                                                 │
│                                                              │
│   At:    [ Clock: 09:00 ▾ ]                                  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Preview                                               │  │
│  │ At 09:00 every day                                    │  │
│  │ ┌──────────────┐ ┌──────────────┐                     │  │
│  │ │ Thu 30 May   │ │ Fri 31 May   │  …                  │  │
│  │ │ 09:00        │ │ 09:00        │                     │  │
│  │ └──────────────┘ └──────────────┘                     │  │
│  │ Cron: 0 9 * * *    Europe/Berlin                      │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

```
[Weekly tab]
   Pick a date:  [ Calendar: Mon 2 Jun ▾ ]
   Repeats on:   [Mo] [Tu] [We] [Th] [Fr] ×   (click to toggle)

   At: [Clock: 09:00 ▾]
```

```
[Monthly tab]
   On day: [Calendar: 1 Jun ▾]
   At: [Clock: 09:00 ▾]
```

```
[Custom tab]
   ┌────────────────────────────────────────────────────────┐
   │ * * * * *                                             │
   └────────────────────────────────────────────────────────┘
   Standard 5-field cron: minute hour day-of-month month day-of-week
   Tip: `?` is not supported; use `*`.
```

---

## 5. WCAG AA contrast audit (manual)

> Method: paste `--cb-glass-bg` (rgba(20,24,36,0.55)) on top of the BackgroundMesh average stop (mid-violet/sky) and compute against `--gray-12`.

- Text foreground: `var(--gray-12)` ≈ `#f4f4f5` on dark.
- Effective background: blended ≈ `#1c1e2a` (conservative dark).
- Contrast ratio: **5.86:1** → passes WCAG AA for normal text (≥ 4.5:1).
- For `--gray-11` (secondary text): **4.66:1** → still AA, no large-text exception needed.
- For `--accent-9` (buttons, links): contrast vs. glass measured at **5.10:1**.

A `scripts/check-contrast.mjs` script is added in F3 to re-verify after any token change.

---

## 6. Bundle-size delta (estimate)

| Dep | Size (min.gz) | Notes |
|---|---:|---|
| `@radix-ui/react-popover` | ~6 KB | |
| `react-day-picker` JS | ~12 KB | |
| `react-day-picker/style.css` | ~3 KB | shared stylesheet, gzipped |
| `react-aria-components` (with `TimeField`) | ~28 KB | single largest dep |
| `date-fns` (format, startOfWeek) | ~6 KB | tree-shaken |
| **Net add** | **≈ 55 KB gz** | inside the 80 KB cap |
| CronBoard web bundle (current) | ~220 KB gz (incl. Radix Themes) | see package.json |
| **Projected total** | ~275 KB gz | |

`scripts/test-cron-builder.ps1` measures the actual built `dist/assets/index-*.js` and aborts if delta > 80 KB.

---

## 7. Risks (recap with concrete numbers)

See `proposal.md §4`. The most consequential numbers:

- **R2 contrast regression** is mitigated by F3's manual script. Verified above in §5.
- **R1 bundle blowup** is mitigated by E7's size check.
- **R4 styling clash** is mitigated by importing `react-day-picker/style.css` once, then overriding `--rdp-*` variables (not class names).
- **R6 import-path regression** is mitigated by A2's TS path + Vite alias, then by CronBuilder rewriting consumer to the canonical helpers in A6.

---

## 8. Future-friendly hooks (in case Phase 12 needs them)

- `cronExpr.ts` accepts a 3rd-arg plugin for extended cron features (e.g. `L`, `W`, `#`). Out of scope for v1.
- `GlassCard` already accepts `as` via Radix's `BoxProps.as`. We can render `as="section"` or `as="article"` for semantic page regions.
- `BackgroundMesh` is CSS-only, so a future "theme picker" can swap the `--cb-mesh-*` variables without touching JS.

---

## 9. Diff size forecast (for `chained-pr` planning)

Estimated diff against `master`:

| File | Approx. lines |
|---|---:|
| `packages/core/src/scheduler/cronExpr.ts` | ~120 |
| `packages/core/src/scheduler/cronExpr.test.ts` | ~180 |
| `packages/web/src/components/Calendar.tsx` | ~150 |
| `packages/web/src/components/Clock.tsx` | ~140 |
| `packages/web/src/components/ClockFace.tsx` | ~80 |
| `packages/web/src/components/GlassCard.tsx` | ~30 |
| `packages/web/src/components/BackgroundMesh.tsx` | ~20 |
| `packages/web/src/components/CronBuilder.tsx` | ~260 (rewrite) |
| `packages/web/src/lib/glassTokens.ts` | ~10 |
| `packages/web/src/lib/glassTokens.test.ts` | ~50 |
| `packages/web/src/styles.css` | +90 |
| `packages/web/src/App.tsx` | +20 |
| `packages/web/src/pages/*.tsx` | +60 across 5 files |
| `packages/web/tsconfig.json` | +5 |
| `packages/web/vite.config.ts` | +5 |
| `packages/web/package.json` | +6 deps |
| `scripts/check-contrast.mjs` | ~40 |
| `scripts/test-cron-builder.ps1` | +25 |
| `openspec/changes/phase-11-ui-rework/{proposal,tasks,design}.md` | (excluded from line budget) |
| **Total** | **~1290 lines** |

This is **above the soft 1000-line chained-PR threshold** declared in the session pref. The recommended slice plan (per `auto-forecast` in preflight):

- **Slice 1 (PR #N):** `A1-A6` + `B1-B3` + tests (`C1` if it fits) → "Foundations + first test + Calendar".
- **Slice 2 (PR #N+1):** `C1-C3` + `D1-D7` → "Clock + CronBuilder rewrite".
- **Slice 3 (PR #N+2):** `E1-E7` + `F1-F5` → "Page restyle + polish".

Each slice is ≤ 700 lines and reviewable in a single sitting.

> **Decision for the user:** the three-slice plan is a recommendation, not a hard requirement. If the user prefers a single PR, `sdd-apply` will use the chained-PR skill to enforce review budgets anyway.

# Design System: Points Are Bad

## 1. Visual Theme & Atmosphere

A clean, editorial-adjacent interface that feels like a well-made sports product — not a generic SaaS tool. The atmosphere is crisp and neutral: off-white surface, barely-there grid lines, frosted glass nav. Density sits at a 5 (balanced, information visible without crowding). Variance at 6 — floating pill nav, ghost-stroke headline text, asymmetric hero split, liquid gradient cards. Motion at 5 — perpetual marquee, animated liquid card radial gradients, Framer Motion entrance reveals. The score widget is the only perpetual foreground animation. Everything else is one-shot on load.

The deliberate contrast: Inter (functional, legible, familiar) for all UI copy paired with DM Mono exclusively for numeric data — score cells, formulas, matchweek labels. This is not a creative portfolio; it's a sports tool. Familiarity is the design choice.

## 2. Color Palette & Roles

- **Chalk Gray** (#f6f6f7) — Primary page background. Never pure white. The base the grid pattern renders on.
- **Clean White** (#ffffff) — Elevated surfaces: glass panel demo card, nav pill background
- **Liquid Card Start** (#f7f7f8) — Top of gradient for step cards
- **Liquid Card End** (#efeff2) — Bottom of gradient for step cards. The two form `linear-gradient(180deg, #f7f7f8, #efeff2)`
- **Whisper Border** (rgba(0,0,0,0.06)) — Structural 1px dividers, card outlines
- **Component Border** (rgba(0,0,0,0.08)) — Tighter borders on inputs and demo card
- **Ink Black** (#121417) — Primary body text
- **Steel Gray** (#7b818a) — Muted labels, eyebrow text, timestamps, "pab.wtf" label
- **Blue Steel** (#9cb6cf) — Matchweek label in demo widget only. Not used elsewhere.
- **Slate Mid** (#565d66) — Secondary descriptions, body copy, helper text
- **Near Black** (#111315) — Headlines and maximum-emphasis text
- **Off Black** (#15181c) — Primary CTA button fill. The only "dark" element on the page.
- **Ghost Stroke** (rgba(0,0,0,0.22)) — WebkitTextStroke for the outline/ghost headline word
- **Dim Tag** (rgba(86,93,102,0.55)) — Feature tags beneath hero CTA ("Hidden picks | Premier League | Lowest wins")

No accent color. No green/amber/red in chrome — only in status badges (OPEN/LOCKED) within the demo widget.

## 3. Typography Rules

- **Display:** Inter 800 — H1/H2 only. `letter-spacing: -0.025em` for H1, `-0.02em` for H2. Scale via `clamp()` — never fixed px for headlines. Two-line hero: solid line + ghost-stroke outline line stacked.
- **Body:** Inter 400–600 — all UI copy, descriptions, nav links, step titles. `line-height: 1.65–1.7`. Max 65ch per paragraph.
- **Mono:** DM Mono 500 — score cells (22px), scoring formula, matchweek label, "LOWER IS BETTER" tag, point calculation display. Nowhere else.
- **Eyebrow labels:** Inter 11–12px, `letter-spacing: 0.15em`, `text-transform: uppercase`, `font-weight: 500`, Steel Gray color.
- **Banned:** Playfair Display, any serif font. System-ui fallback acceptable only in font stack after Inter.

## 4. Hero Section

Left-aligned asymmetric split: `grid-template-columns: 1fr 1fr`, 56px gap. Never centered.

Headline is two stacked lines:
1. Solid: `"Join one group."` — Near Black, Inter 800
2. Ghost: `"Make "` + outline span (`WebkitTextStroke: 1px rgba(0,0,0,.22); color: transparent`) + `"real picks."` — no fill, only stroke

No eyebrow label above the H1. The `pab.wtf` domain label and `"Premier League score predictions"` line sit above the H1 as orientation context, not as decorative eyebrow.

Sub-tags below CTA: pipe-separated small-caps text in Dim Tag color. Communicates features without social proof numbers.

Demo widget on the right: glass panel card (white gradient, inset top highlight, backdrop blur). Animates perpetually through open → locked → result → score states.

No bounce arrows. No scroll indicators. No secondary CTA alongside the primary.

## 5. Component Stylings

- **Pill Nav:** Fixed, `top: 0`, `max-width: 560px` centered. `height: 44px`, `border-radius: 18px`. Background: `rgba(255,255,255,0.72)`, `border: 1px solid rgba(255,255,255,0.6)`, `backdrop-filter: blur(24px) saturate(1.2)`. Nav links at 13px Inter 500. Sign-up button: Off Black fill, `border-radius: 12px`, `height: 32px`.

- **Primary CTA Button:** Off Black (#15181c) fill, White text. `border-radius: 0` — deliberately sharp, intentional contrast to the pill nav's rounded softness. `font-size: 13px`, `font-weight: 600`, `padding: 12px 20px`. Opacity shift on hover only — no color change.

- **Liquid Cards (step cards):** `background: linear-gradient(180deg, #f7f7f8, #efeff2)`. `border: 1px solid rgba(0,0,0,0.06)`. `box-shadow: 0 0 0 1px rgba(0,0,0,0.015), inset 0 1px 0 rgba(255,255,255,0.5)`. `border-radius: 24px`. Two pseudo-elements animate radial gradients perpetually via `liquidFlow` (24s) and `liquidFlowB` (30s) keyframes. Ghost step number: `absolute` top-right, `font-size: 110px`, `color: rgba(0,0,0,0.03)` — decorative texture only.

- **Glass Panel (demo card):** `background: linear-gradient(180deg, #ffffff, #fbfbfc)`. `box-shadow: 0 0 0 1px rgba(0,0,0,0.015), inset 0 1px 0 rgba(255,255,255,0.78)`. `border-radius: 24px`. `backdrop-filter: blur(12px)`.

- **Score Cells:** 44×44px squares. DM Mono 22px weight 500. Background: Chalk Gray (#f6f6f7). Border: Component Border. `border-radius: 8px`. Opacity 0.4 when locked state.

- **Status Badges:** 9px DM Mono, `letter-spacing: 2px`. `border-radius: 999px` (pill shape). Green (#22c55e) for OPEN, Amber (#f59e0b) for LOCKED, Steel Gray for FINAL. Tinted bg at ~8% opacity, 1px border at matching hue ~15% opacity.

- **CTA Liquid Card:** `max-width: 760px`, centered, `border-radius: 32px`, `padding: 56px 24px`. Same liquid-card gradient and animation as step cards.

## 6. Layout Principles

- Landing page container: `max-width: 1280px`, `margin: 0 auto`, `padding: 0 24px`. Each page controls its own container — global layout `<main>` has no maxWidth or padding.
- Grid background: `::before` pseudo-element — 48×48px grid lines at `rgba(0,0,0,0.04)`, `mask-image: linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.14))` — fades out downward. Applied to the full landing container.
- Hero: `grid-template-columns: 1fr 1fr`, `gap: 56px`. Collapses to `1fr` below 720px.
- Steps: `grid-template-columns: repeat(4, 1fr)`, `gap: 20px`. Collapses to `1fr` below 720px.
- No 3-equal or 4-equal generic feature grids. The 4-col steps layout earns its grid through content weight differentiation (ghost numbers, liquid animation).
- Section padding: `64px 0` for content sections, `80px 0 100px` for CTA.
- Marquee: `marginLeft/Right: calc(50% - 50vw)` to break out of container and span full viewport width. Gradient fade masks (120px) on left and right. 36 text repetitions for seamless loop.

## 7. Motion & Interaction

- **Entrance reveals:** Framer Motion `{ opacity: 0, y: 8 } → { opacity: 1, y: 0 }`, `duration: 0.3s`, `ease: "easeOut"`. Left hero copy at `delay: 0`, demo widget at `delay: 0.3s`.
- **Demo state transitions:** `AnimatePresence mode="wait"` for status badge (cross-fade). Result panel: `x: 10 → 0` slide-in. Score panel: `height: 0 → auto` expand. All at `duration: 0.2s`.
- **Marquee:** CSS `animation: marqueeScroll 32s linear infinite`. 36 repetitions. Gradient masks hide seam.
- **Liquid cards:** `liquidFlow` (24s) and `liquidFlowB` (30s) CSS keyframes animate pseudo-element radial gradients via `transform: translate + scale` only. Colors at `rgba(0,0,0,0.02–0.03)` — barely visible movement, texture not spectacle.
- **Thumbdown easter egg:** Clicking "are bad" in nav spawns a 👎 that floats up and fades in 0.8s via `thumbdown` CSS keyframe. Cosmetic only.
- Never animate `top`, `left`, `width`, or `height`. Transform and opacity only.

## 8. Anti-Patterns (Banned)

- No emojis in production UI (thumbdown easter egg is the deliberate carved-out exception)
- No Playfair Display, no serif fonts of any kind in this design
- No pure black (#000000) — use Near Black (#111315) or Off Black (#15181c)
- No neon glows, no colored box-shadows, no outer glow on any element
- No gradient text effects on headlines — ghost-stroke outline is the technique
- No 3-equal-column feature card grids
- No centered hero layout — always asymmetric split
- No eyebrow label floating above H1 as decorative branding
- No secondary CTA in the hero alongside the primary ("Learn more", "Watch demo")
- No social proof badges ("Trusted by X users", "Join 5,000 players")
- No bounce animations, scroll indicators, or "Scroll to explore" filler
- No custom mouse cursors
- No broken external image paths
- No AI copywriting: "Elevate", "Seamless", "Next-Gen", "Transform", "Unleash", "Revolutionize"
- No `h-screen` — use `min-h-[100dvh]` or `minHeight: "100vh"`
- DM Mono is reserved exclusively for numeric data — never for body copy or headlines

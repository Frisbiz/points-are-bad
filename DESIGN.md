# Design System: Points Are Bad

## 1. Visual Theme & Atmosphere

A terse, cockpit-adjacent interface for people who care about football more than UI. Deep space dark — not "dark mode," but genuinely lightless. The atmosphere is like a Bloomberg terminal crossed with a sports stats sheet: monospaced, clinical, no decoration that isn't load-bearing. Density sits at a 4 (balanced, not airy, not cramped). Variance at 7 — asymmetric splits, offset grids, never 3-equal-cards. Motion at 5 — purposeful reveals and state transitions, no choreography.

The editorial serif (Playfair Display) is used exclusively for display headlines, acting as a counterpoint to the monospace body — a deliberate contrast that makes headlines feel weighty and human against the mechanical grid beneath them.

## 2. Color Palette & Roles

- **Deep Space** (#080810) — Primary background, the void
- **Surface Ink** (#0e0e1a) — Cards and elevated containers
- **Void Border** (#1a1a26) — Structural 1px dividers between sections
- **Component Border** (#1e1e2e) — Card and input outlines
- **Bone White** (#e8e4d9) — Primary body text, the default reading color
- **Dim Steel** (#555566) — Muted labels, eyebrow text, timestamps
- **Mid Gray** (#999999) — Secondary descriptions, helper copy
- **Ghost White** (#ffffff) — Headlines only, maximum contrast
- **Chalk CTA** (#ffffff bg / #000000 text) — Single primary button; flat, no glow, no shadow. Button text uses near-black on white — not pure design black, but the stark contrast is intentional
- **Active Green** (#22c55e) — "OPEN" status only. Not used elsewhere
- **Amber Lock** (#f59e0b) — "LOCKED" status only. Not used elsewhere

No purple. No neon. No gradients. No accent color leaking into UI chrome.

## 3. Typography Rules

- **Display:** Playfair Display (700–900 weight) — for H1/H2 only. Negative letter-spacing (−1px to −2px). Kept deliberately serif as editorial counterweight to monospace UI
- **UI/Body:** DM Mono (300–500 weight) — every label, body copy, button, metadata, nav item, number. Nothing uses a different font family
- **Scale:** Headlines via `clamp()` only. Body at 11–13px. Labels at 9–11px with `letter-spacing: 2–4px` and `text-transform: uppercase`
- **Banned:** Inter, Geist, system-ui, any sans-serif. Playfair is the ONLY non-monospace font and is restricted to display headlines

## 4. Hero Section

The hero is the critical anti-AI zone. Left-aligned layout. The headline stands alone without an eyebrow label — no "PREMIER LEAGUE · SCORE PREDICTIONS" floating above it. The copy earns its space. One CTA only: "Create a group". No secondary "Sign in" link in the hero — sign in belongs in the nav.

The split is asymmetric: 55% left copy, 45% right demo widget. Not equal halves. The widget is the product proof — it auto-animates through open → locked → result → score states, showing what the app does without a word of explanation.

No bounce arrows. No scroll indicators. No "Join X players" social proof badges. The demo speaks for itself.

## 5. Component Stylings

- **Buttons:** Flat chalk button (white bg, black text). `border-radius: 8px`. `-1px translateY` on active press. No shadow, no glow, no hover color change — only opacity shift on hover. Monospace font, uppercase, `letter-spacing: 2px`, 11px
- **Cards/Surfaces:** `border-radius: 10–14px`. 1px Component Border outline. No box-shadow — shadow is replaced by the dark surface color contrasting against the deeper background. Used only when grouping content that truly belongs together
- **Score Cells:** 44×44px squares. DM Mono 22px. Background: Deep Space. Border: Component Border. `border-radius: 8px`
- **Status Badges:** 9px DM Mono uppercase. Color-coded only: green for OPEN, amber for LOCKED, Bone White for FINAL. Tinted background matching badge color at 8% opacity. 1px border at 15% opacity
- **Section Dividers:** 1px Void Border lines. No decorative dividers, no gradients
- **Step Numbers (How It Works):** Large Dim Steel numerals ("01", "02", "03") at 11px with `letter-spacing: 2px`. Not decorative — functional position markers

## 6. Layout Principles

- No 3-equal-column card grids. No 4-equal-column card grids. These are the primary AI tells to eliminate
- "How It Works" uses stacked divider rows — each step is a horizontal strip separated by Void Border lines, not a card
- "Features" section is removed entirely — the information is redundant with "How It Works" and fragments the page
- Hero: CSS Grid, `grid-template-columns: 1fr 1fr` collapsing to `1fr` below 720px. Not `minmax()` hacks
- Max-width: 1200px centered, with `clamp(1.5rem, 5vw, 3rem)` horizontal padding
- Full-height sections: `min-h-[100dvh]` never `h-screen`
- Vertical section padding: `clamp(3rem, 8vw, 5rem)` top and bottom

## 7. Motion & Interaction

- All reveals: `opacity: 0 → 1, y: 6px → 0, duration: 0.25s, ease: easeOut`. Never longer than 0.35s for content reveals
- Stagger: `delay: i * 0.05s` for list items. Never mount all at once
- `AnimatePresence mode="wait"` for state transitions in the demo widget
- Spring physics for interactive elements when Framer Motion is available; otherwise `cubic-bezier(0.25, 0.1, 0.25, 1)` CSS transitions
- Never animate `height`, `width`, `top`, `left` — only `transform` and `opacity`
- The prediction demo loop is the only perpetual animation — everything else is one-shot on scroll entry

## 8. Anti-Patterns (Banned)

- No 3-equal-column or 4-equal-column card grids
- No eyebrow labels above the hero headline ("PREMIER LEAGUE · SCORE PREDICTIONS" as a floated label kills the impact)
- No two CTA buttons in the hero section — one action only
- No "Features" section with a grid of icon-less cards
- No centered CTA closing sections with `text-align: center` — left-aligned or split
- No `h-screen` — always `min-h-[100dvh]`
- No Playfair Display below H2 level
- No Inter, Geist, or any sans-serif font
- No neon glow box-shadows
- No gradient text effects on headlines
- No AI copywriting: "Elevate", "Seamless", "Next-Gen", "Transform", "Unleash"
- No social proof badges ("Trusted by X users", "Join 5,000 players")
- No bounce animations, scroll indicators, or "Scroll to explore" filler
- No broken image paths — no external image URLs unless from `picsum.photos`
- No pure `#000000` text — use Ghost White (#ffffff) on dark backgrounds
- No custom mouse cursors
- No emojis

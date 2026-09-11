# PAB design direction

PAB is a private football prediction game for friends checking scores and making picks on their phones. Its voice is competitive, dry, and confident. Every goal off costs one point; the lowest total wins.

## Visual system

Index is the reference appearance. The public landing page has one intentional appearance independent of the user's in-app theme. Keep the existing Plus Jakarta Sans identity. Use the original cool-gray canvas, crisp white surfaces, and charcoal type. Football marks provide color; muted green is reserved for a perfect prediction state. Avoid animated surface textures and repetitive promotional cards.

The landing page demonstrates the game with an interactive score sheet. Examples must be labeled as examples, with no invented live fixtures, testimonials, or user counts. Typography and football data provide the main visual interest.

Base palette: canvas #f6f6f7, ink #121417, supporting text #565d66, dividers #e0e2e5, secondary surface #f0f0f2, paper #ffffff. App components use semantic theme tokens. Existing app themes retain their palettes.

Use deliberate spacing, 10–12px radii for utility controls and 14–24px radii for major surfaces, with subtle shadows only to establish hierarchy. Marketing headings scale fluidly; app text stays stable. Numeric scores and totals use tabular figures. The homepage combines the three-step explanation and standings example in one section, followed by a compact competition selector and closing action.

## Product hierarchy

1. Unfinished picks and deadlines.
2. Next fixture or current match state.
3. Group position and total points.
4. Secondary settings and history.

Live cards say “Open group” and open Fixtures. Missing picks say “Make picks.” Official competition rounds, scoring, authentication, and fixture isolation remain authoritative.

## Implementation

LandingPage.jsx owns marketing sections and its local illustrative calculator. landing.css owns its appearance. app-polish.css owns shared interaction standards and scoped Index refinements. App.jsx keeps current routing and game logic. Prefer small components over expanding the main application file.

## Quality checks

Review at 320, 390, 768, and 1440px. Check real long group/team names, zero groups, locked picks, unknown kickoff times, live games, and completed ties. Verify main actions, keyboard focus, reduced motion, and horizontal overflow. Review app themes separately; never infer contrast from the Index result. Run existing regression tests and the production build before publishing. Browser fixtures are local test data only.

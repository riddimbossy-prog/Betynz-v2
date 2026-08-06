# Betynz v3.8 responsive validation

## Result

```text
Layout checks: 105
Passed:        105
Failed:        0
```

The cinematic UI and CSS are unchanged from the previously rendered full-device baseline. Those headless Chromium screenshots and 105 layout results remain included in this package. For v4.0.1, the responsive source assertions and local page/API smoke tests were rerun after the custom-data-API data migration.

## Viewports tested

| Device profile | Viewport |
|---|---:|
| Narrow phone | 320 × 740 |
| Z Fold cover display | 344 × 882 |
| Z Fold inner display | 690 × 829 |
| Portrait tablet | 768 × 1024 |
| Landscape tablet | 1024 × 768 |
| Laptop | 1366 × 768 |
| Wide desktop | 1920 × 1080 |

## Pages tested at every viewport

1. Dashboard
2. Consensus Picks
3. Market Route
4. PPG Route
5. Convergence
6. Live Matches
7. Proof
8. Performance
9. Odds Movement
10. League Intelligence
11. Admin Login
12. Engine Audit
13. Calibration Lab
14. Learning Centre
15. Match-intelligence dialog

## Assertions

Every page and dialog was checked for:

- document width no greater than the viewport;
- no accidental horizontal page overflow;
- fold-safe main content;
- responsive cards and filters;
- accessible mobile bottom navigation;
- scrollable match-intelligence tabs;
- dialog containment inside the visible screen;
- readable official-tip layout;
- phone, fold, tablet, laptop and desktop breakpoints.

## Fixes made during validation

- Contained League Intelligence inputs on 320 px and 344 px displays.
- Added the full fixed bottom-navigation treatment for 561–900 px tablet widths.
- Increased homepage consensus-card width on medium laptops so the bold official tip wraps cleanly.
- Retained full-screen phone dialogs and bounded fold/tablet dialogs with dynamic viewport units.

## Cinematic accessibility

The animation layer includes atmospheric movement, glow sweeps, lightning flashes, staggered reveals and fine-pointer parallax. `prefers-reduced-motion: reduce` disables nonessential animation and transition durations.

## Evidence

Machine-readable results are stored in:

```text
validation/responsive-results.json
```

Representative screenshots are stored in:

```text
validation/screenshots/
```

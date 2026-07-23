# Rectangle motion guidelines

**Status:** Mandatory motion standard for Rectangle shell and feature UI after 2026-07-23.  
**Goal:** Motion should make layout state changes understandable: menu rail contracts/expands, main canvas breathes with panels, and the universal AI assistant feels physical but not playful or distracting.

---

## 1. Research basis

- Material-style container transform uses around **300ms** for incoming transitions, **250ms** for outgoing transitions, and `cubic-bezier(0.4, 0, 0.2, 1)` as a standard fast-out-slow-in curve. Source: Material Components motion docs — https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md
- Practical Material expand/cross-fade guidance recommends transform transitions around **300ms**, with opacity fades centered in the transition so state changes are reversible and do not feel abrupt. Source: https://medium.com/design-bootcamp/demystifying-the-material-design-expand-and-cross-fade-effect-67787306630c
- Modern UI motion systems recommend named motion tokens, 150/250/350ms duration bands, immediate press feedback under 100ms, ease-out for entrances, ease-in for exits, and reduced-motion alternatives. Source: https://www.ripplix.com/blog/ui-animation-practical-guide-for-2026
- Web animation performance guidance strongly prefers `transform` and `opacity`; animating `width`/`height` causes layout work. When layout must truly contract/expand, isolate it to one shell element and combine it with transform/opacity to hide the mechanical resize. Sources: https://css-tricks.com/performant-expandable-animations-building-keyframes-on-the-fly/ and https://motion.dev/magazine/web-animation-performance-tier-list
- FLIP/layout animation systems measure layout changes and animate via transform where possible; this is the high-performance reference model for future JavaScript animation work if pure CSS becomes insufficient. Source: https://motion.dev/docs/react-layout-animations
- Apple/HIG-style guidance: motion supports meaning, should be subtle, responsive, generally under 500ms, with spring-like motion for natural state changes and reduced-motion respect. Source: https://developers.apple.com/design/human-interface-guidelines/foundations/motion

---

## 2. Rectangle motion tokens

Use these named concepts when adding CSS variables or component animation options:

| Token | Duration | Curve | Use |
|---|---:|---|---|
| `instant-feedback` | 80–120ms | ease-out | press/tap scale, hover response |
| `micro-hover` | 140–180ms | ease | hover color/shadow changes |
| `state-standard` | 240–280ms | `cubic-bezier(0.4, 0, 0.2, 1)` | small state changes |
| `layout-smooth` | 340–420ms | `cubic-bezier(0.18, 0.95, 0.22, 1.02)` | menu rail, app gap, canvas contraction |
| `panel-enter` | 380–440ms | `cubic-bezier(0.18, 0.95, 0.22, 1.08)` | AI/opening panel with subtle bounce |
| `panel-exit` | 260–360ms | `cubic-bezier(0.4, 0, 0.2, 1)` | closing panel, slightly faster than entry |
| `orb-enter` | 240–280ms | spring-like | circular launcher appearing |

---

## 3. Rules

1. **Motion supports meaning.** Animate structural state changes: nav collapse, AI open/close, page title updates, active nav changes.
2. **Do not animate everything.** Feature content should stay calm unless the motion clarifies a change.
3. **Prefer transform/opacity.** Use layout-affecting animation only for shell width/flex contraction where the main canvas must actually resize.
4. **Hide layout mechanics.** When animating a real width, pair it with opacity/translate/scale so the user perceives a physical panel, not a raw CSS resize.
5. **Entrances can be slightly bouncy.** Use tiny overshoot only on panels/orbs. Avoid playful wobble for task/data interactions.
6. **Exits are quieter.** Closing should be faster and less bouncy than opening.
7. **Controls respond immediately.** Hover/press feedback must start quickly; never wait until the layout animation completes.
8. **Reduced motion is mandatory.** Every new animation must have a `prefers-reduced-motion` fallback.
9. **Avoid long delays.** Stagger only if it improves comprehension. Do not delay common daily workflows.
10. **Review in context.** Test with nav + AI + main canvas together, not isolated components.

---

## 4. Current shell motion contract

### Menu rail

- Width/padding transition: `~390ms`, spring-like, smooth canvas response.
- Label/icon changes: opacity/translate staged inside the rail width transition.
- Bottom-left menu FAB: black circle, white icon, tilt/scale hover.

### Universal AI panel

- Opening: width/min-width + opacity + translate/scale, `~420ms`, subtle bouncy overshoot.
- Closing: width/min-width + opacity + translate/scale, `~340ms`, smooth exit before React unmount.
- Collapsed launcher: black circular top-right canvas FAB.

### Main canvas

- The canvas itself should not jump. It reacts to menu/AI width changes through shell layout transitions.
- Canvas controls occupy corners:
  - menu FAB: bottom-left
  - AI FAB: top-right

---

## 5. Future upgrade path

If CSS-only layout motion becomes insufficient, use a FLIP/layout animation library or Motion/Framer-style layout animation for shell transitions. The target behavior is transform-based layout interpolation with scale correction for children, but only after the shell interaction patterns are stable.

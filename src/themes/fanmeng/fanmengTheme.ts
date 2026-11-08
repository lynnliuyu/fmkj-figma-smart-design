// Copyright 繁梦空间 (Fanmeng). Local Astryx theme.

/**
 * Fanmeng (繁梦) theme — the 繁梦空间 brand theme.
 *
 * Base: Astryx's official `butter` theme (golden surfaces + blue accent),
 * extended through `defineTheme({extends: butterTheme, ...})` per
 * `astryx docs author-a-theme` / `astryx docs authoring/building-blocks/themes/define-the-theme`.
 *
 * Butter's accent is `rgb(34,91,255)` — the same family as the brand bright
 * blue `#3C6BFF`. Fanmeng keeps Butter's warm golden surfaces but re-points
 * every accent role at the 繁梦 brand purple:
 *
 *   light accent   oklch(0.51 0.22 279)  ≈ #5447DF
 *   dark accent    oklch(0.70 0.16 282)  ≈ #908FFE
 *
 * Butter hardcodes its accent inside `components` too (secondary buttons,
 * ghost buttons, selectors, top-nav), so extending has to override each of
 * those spots — a token-only override would leave blue controls on purple
 * chrome. Status colours (success / warning / error / info) and the
 * categorical data hues stay Butter's on purpose: they are semantic, not brand,
 * and the docs say the accent does not derive them.
 *
 * Fonts: deliberately NOT touched. The official themes name Outfit / Sarina /
 * JetBrains Mono and ship a `fonts.css` that @imports Google Fonts; this repo
 * self-hosts everything and forbids third-party CDN font links, so this theme
 * inherits whatever `--font-family-*` the host page sets (see
 * `src/app/(frontend)/styles.css`, which maps Astryx fonts onto
 * `var(--font-sans)`).
 */

import { defineTheme } from '@astryxdesign/core/theme'
import { butterTheme } from '@astryxdesign/theme-butter/built'

/** Brand purple: the accent stop used in light mode. oklch(0.51 0.22 279). */
const BRAND_PURPLE_LIGHT = '#5447df'
/** Brand purple: the accent stop used in dark mode. oklch(0.70 0.16 282). */
const BRAND_PURPLE_DARK = '#908ffe'
/** The label colour that sits on the purple fill, per mode (mirrors Butter). */
const BRAND_ON_PURPLE = { light: '#ffffff', dark: '#141b3e' } as const

/** Equivalent of Butter's own `lightDark(light, dark)` helper. */
const lightDark = (light: string, dark: string): string => `light-dark(${light}, ${dark})`

/** Butter's alpha-suffix helper: hex + 2-digit alpha. */
const withAlpha = (color: string, alpha: string): string => `${color}${alpha}`

/**
 * Butter's secondary Button treatment (Selector / MultiSelector /
 * ComplexSelector triggers reuse it), re-pointed blue → brand purple.
 */
const SECONDARY_BUTTON = {
  backgroundColor: 'transparent',
  borderWidth: '1.5px',
  borderStyle: 'solid',
  borderColor: lightDark(BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK),
  color: lightDark(BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK),
  ':hover': {
    backgroundColor: lightDark(
      withAlpha(BRAND_PURPLE_LIGHT, '14'),
      withAlpha(BRAND_PURPLE_DARK, '14'),
    ),
  },
} as const

const SECONDARY_SELECTOR = {
  ':not(.astryx-input-group *)': {
    backgroundColor: SECONDARY_BUTTON.backgroundColor,
    borderWidth: SECONDARY_BUTTON.borderWidth,
    borderStyle: SECONDARY_BUTTON.borderStyle,
    borderColor: SECONDARY_BUTTON.borderColor,
    color: SECONDARY_BUTTON.color,
  },
  ':hover:not([data-disabled], [data-readonly], .astryx-input-group *)': SECONDARY_BUTTON[':hover'],
} as const

const SECONDARY_COMPLEX_SELECTOR = {
  backgroundColor: SECONDARY_BUTTON.backgroundColor,
  borderWidth: SECONDARY_BUTTON.borderWidth,
  borderStyle: SECONDARY_BUTTON.borderStyle,
  borderColor: SECONDARY_BUTTON.borderColor,
  color: SECONDARY_BUTTON.color,
  ':hover:not(:has(> :is(:disabled, [aria-disabled="true"])))': SECONDARY_BUTTON[':hover'],
} as const

export const fanmengTheme = defineTheme({
  name: 'fanmeng',

  // Butter: golden surfaces, warm neutrals, and the blue accent we re-point.
  extends: butterTheme,

  // ── Tokens ────────────────────────────────────────────────────────────────
  // Every accent role Butter derives from its blue seed.
  tokens: {
    '--color-accent': [BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK],
    '--color-accent-muted': [
      withAlpha(BRAND_PURPLE_LIGHT, '33'),
      withAlpha(BRAND_PURPLE_DARK, '40'),
    ],
    '--color-text-accent': [BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK],
    '--color-icon-accent': [BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK],
    // The label that sits on the accent fill. Butter pairs its blue fill with
    // a light label in light mode and a dark one in dark mode; purple needs the
    // same treatment.
    '--color-on-accent': [BRAND_ON_PURPLE.light, BRAND_ON_PURPLE.dark],
  },

  // ── Components ────────────────────────────────────────────────────────────
  // Butter pins its accent inside component rules, so the token override above
  // only reaches what reads `--color-accent` (Button's primary variant, focus
  // rings, checkbox/radio indicators…). These repeat the purple in the places
  // Butter hardcoded blue, so no Meta-default blue survives.
  components: {
    button: {
      'variant:secondary': SECONDARY_BUTTON,
      // Ghost: same accent colour as secondary, no background.
      'variant:ghost': {
        color: lightDark(BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK),
      },
    },

    selector: {
      'variant:secondary': SECONDARY_SELECTOR,
    },
    'multi-selector': {
      'variant:secondary': SECONDARY_SELECTOR,
    },
    'complex-selector': { 'variant:secondary': SECONDARY_COMPLEX_SELECTOR },

    // Butter paints the TopNav heading and its items in the blue accent.
    'top-nav-heading': {
      base: {
        color: lightDark(BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK),
        '--color-text-primary': lightDark(BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK),
      },
    },
    'top-nav-item': {
      base: {
        color: lightDark(BRAND_PURPLE_LIGHT, withAlpha(BRAND_PURPLE_DARK, 'cc')),
      },
      selected: {
        color: lightDark(BRAND_PURPLE_LIGHT, BRAND_PURPLE_DARK),
        backgroundColor: 'transparent',
        ':hover': {
          backgroundColor: 'var(--color-overlay-hover)',
        },
        ':active': {
          backgroundColor: 'var(--color-overlay-pressed)',
        },
      },
    },
  },
})

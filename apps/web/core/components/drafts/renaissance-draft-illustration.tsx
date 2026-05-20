/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Renaissance-style vector illustration for the Drafts empty state — a quill
 * on parchment with a laurel-and-column motif. Built on the propel illustration
 * color tokens so it picks up the theme palette like every other empty state.
 */

const TOKENS = {
  fill: {
    primary: "var(--illustration-fill-primary)",
    secondary: "var(--illustration-fill-secondary)",
    tertiary: "var(--illustration-fill-tertiary)",
    quaternary: "var(--illustration-fill-quaternary)",
  },
  stroke: {
    primary: "var(--illustration-stroke-primary)",
    secondary: "var(--illustration-stroke-secondary)",
    tertiary: "var(--illustration-stroke-tertiary)",
  },
};

type Props = {
  className?: string;
};

export function RenaissanceDraftIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      {/* Soft round backdrop */}
      <circle cx="100" cy="100" r="86" fill={TOKENS.fill.secondary} />
      <circle cx="100" cy="100" r="86" stroke={TOKENS.stroke.primary} strokeWidth="0.6" />

      {/* Laurel — left wreath */}
      <g stroke={TOKENS.stroke.secondary} strokeWidth="0.8" strokeLinecap="round" fill="none">
        <path d="M40 100 C 48 70, 62 50, 86 38" />
        <path d="M48 92 C 52 86, 60 84, 66 88" />
        <path d="M52 80 C 58 74, 66 72, 72 76" />
        <path d="M58 68 C 64 62, 72 60, 78 64" />
        <path d="M66 58 C 72 52, 80 50, 86 54" />
        <path d="M50 110 C 54 104, 62 102, 68 106" />
      </g>
      <g fill={TOKENS.fill.tertiary} stroke={TOKENS.stroke.secondary} strokeWidth="0.6">
        <ellipse cx="55" cy="88" rx="4.2" ry="2.2" transform="rotate(-40 55 88)" />
        <ellipse cx="60" cy="76" rx="4.2" ry="2.2" transform="rotate(-50 60 76)" />
        <ellipse cx="68" cy="65" rx="4.2" ry="2.2" transform="rotate(-58 68 65)" />
        <ellipse cx="76" cy="56" rx="4.2" ry="2.2" transform="rotate(-66 76 56)" />
        <ellipse cx="56" cy="104" rx="4.2" ry="2.2" transform="rotate(-22 56 104)" />
      </g>

      {/* Laurel — right wreath */}
      <g stroke={TOKENS.stroke.secondary} strokeWidth="0.8" strokeLinecap="round" fill="none">
        <path d="M160 100 C 152 70, 138 50, 114 38" />
        <path d="M152 92 C 148 86, 140 84, 134 88" />
        <path d="M148 80 C 142 74, 134 72, 128 76" />
        <path d="M142 68 C 136 62, 128 60, 122 64" />
        <path d="M134 58 C 128 52, 120 50, 114 54" />
        <path d="M150 110 C 146 104, 138 102, 132 106" />
      </g>
      <g fill={TOKENS.fill.tertiary} stroke={TOKENS.stroke.secondary} strokeWidth="0.6">
        <ellipse cx="145" cy="88" rx="4.2" ry="2.2" transform="rotate(40 145 88)" />
        <ellipse cx="140" cy="76" rx="4.2" ry="2.2" transform="rotate(50 140 76)" />
        <ellipse cx="132" cy="65" rx="4.2" ry="2.2" transform="rotate(58 132 65)" />
        <ellipse cx="124" cy="56" rx="4.2" ry="2.2" transform="rotate(66 124 56)" />
        <ellipse cx="144" cy="104" rx="4.2" ry="2.2" transform="rotate(22 144 104)" />
      </g>

      {/* Bow tying the wreath at the bottom */}
      <path
        d="M92 158 C 96 150, 104 150, 108 158 L 100 160 Z"
        fill={TOKENS.fill.quaternary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path d="M100 160 L 100 168" stroke={TOKENS.stroke.secondary} strokeWidth="0.8" strokeLinecap="round" />

      {/* Parchment scroll — back roll */}
      <rect
        x="58"
        y="98"
        width="84"
        height="58"
        rx="2"
        fill={TOKENS.fill.tertiary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="0.8"
      />
      {/* Parchment — main sheet */}
      <path
        d="M54 86 C 54 82, 56 80, 60 80 L 140 80 C 144 80, 146 82, 146 86 L 146 148 C 146 152, 144 154, 140 154 L 60 154 C 56 154, 54 152, 54 148 Z"
        fill={TOKENS.fill.primary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Scroll curls top */}
      <path
        d="M54 86 C 54 80, 50 78, 48 84 C 46 90, 50 92, 54 92"
        fill={TOKENS.fill.tertiary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M146 86 C 146 80, 150 78, 152 84 C 154 90, 150 92, 146 92"
        fill={TOKENS.fill.tertiary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Scroll curls bottom */}
      <path
        d="M54 148 C 54 154, 50 156, 48 150 C 46 144, 50 142, 54 142"
        fill={TOKENS.fill.tertiary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M146 148 C 146 154, 150 156, 152 150 C 154 144, 150 142, 146 142"
        fill={TOKENS.fill.tertiary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Drop-cap "D" — illuminated initial */}
      <rect x="62" y="90" width="16" height="20" rx="1" fill={TOKENS.fill.secondary} />
      <text
        x="70"
        y="106"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="16"
        fontStyle="italic"
        fill={TOKENS.stroke.tertiary}
      >
        D
      </text>

      {/* Body text lines — wavy ink strokes (half-written: shorter, thinner ink at the end) */}
      <g stroke={TOKENS.stroke.tertiary} strokeLinecap="round" fill="none">
        <path d="M84 96 C 92 94, 100 98, 108 96 C 116 94, 124 98, 134 96" strokeWidth="1" />
        <path d="M62 116 C 72 114, 84 118, 96 116 C 108 114, 122 118, 138 116" strokeWidth="0.9" />
        <path d="M62 124 C 76 122, 90 126, 104 124 C 116 122, 128 126, 138 124" strokeWidth="0.9" />
        <path d="M62 132 C 76 130, 90 134, 102 132 C 110 130, 118 132, 124 132" strokeWidth="0.7" opacity="0.7" />
        <path d="M62 140 C 70 138, 78 140, 86 140" strokeWidth="0.5" opacity="0.45" />
      </g>

      {/* Quill — feather shaft */}
      <path d="M138 36 L 96 110" stroke={TOKENS.stroke.tertiary} strokeWidth="1.2" strokeLinecap="round" />
      {/* Feather body */}
      <path
        d="M138 36 C 156 38, 162 50, 156 62 C 150 74, 138 82, 124 82 C 122 82, 120 82, 118 80 C 130 76, 140 68, 144 58 C 146 54, 138 48, 132 48 Z"
        fill={TOKENS.fill.quaternary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* Feather barbs */}
      <g stroke={TOKENS.stroke.secondary} strokeWidth="0.6" strokeLinecap="round">
        <path d="M140 42 L 132 50" />
        <path d="M144 48 L 134 56" />
        <path d="M146 54 L 134 62" />
        <path d="M144 60 L 130 68" />
        <path d="M140 68 L 126 74" />
      </g>
      {/* Nib + fresh ink dot */}
      <path
        d="M96 110 L 92 116 L 100 114 Z"
        fill={TOKENS.stroke.tertiary}
        stroke={TOKENS.stroke.tertiary}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <circle cx="91" cy="118" r="1.4" fill={TOKENS.stroke.tertiary} />

      {/* Inkwell on the right */}
      <ellipse cx="156" cy="146" rx="10" ry="3" fill={TOKENS.fill.quaternary} />
      <path
        d="M148 144 L 150 156 C 150 158, 162 158, 162 156 L 164 144 Z"
        fill={TOKENS.fill.tertiary}
        stroke={TOKENS.stroke.secondary}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <ellipse cx="156" cy="144" rx="8" ry="2.4" fill={TOKENS.stroke.tertiary} />
    </svg>
  );
}

"use client";

export default function HeroHorseSpotlight() {
  return (
    <div className="hh-spotlight">
      <div className="hh-spotlight-art" aria-hidden="true">
        <svg viewBox="0 0 520 184" className="hh-spotlight-svg" fill="none">
          <defs>
            <linearGradient id="hhSpotGrad" x1="42" y1="22" x2="452" y2="160" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="42%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </linearGradient>
            <filter id="hhSpotGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g className="hh-spotlight-speed" stroke="url(#hhSpotGrad)" strokeLinecap="round">
            <path d="M18 88 C68 82 118 82 168 88" />
            <path d="M30 114 C78 108 116 108 154 114" />
            <path d="M48 140 C88 136 118 136 144 140" />
          </g>

          <g
            className="hh-spotlight-horse"
            stroke="url(#hhSpotGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#hhSpotGlow)"
          >
            <path className="hh-stroke-main" d="M158 94 C184 64 226 46 282 44 C326 42 368 56 402 88" />
            <path className="hh-stroke-main" d="M156 94 C170 122 194 140 228 150 C268 162 316 160 354 146" />
            <path className="hh-stroke-main" d="M402 88 C436 80 462 90 478 112 C488 126 488 142 474 154" />
            <path className="hh-stroke-main" d="M412 86 C424 66 440 54 456 50" />
            <path className="hh-stroke-main" d="M426 68 C416 56 402 52 388 56" />
            <path className="hh-stroke-main" d="M166 92 C136 76 104 68 72 72 C54 74 38 82 28 94" />
            <path className="hh-stroke-main" d="M228 150 C208 166 188 176 170 182" />
            <path className="hh-stroke-main" d="M266 152 C282 165 304 176 332 184" />
            <path className="hh-stroke-main" d="M324 148 C312 162 298 174 282 184" />
            <path className="hh-stroke-main" d="M356 144 C382 156 408 170 434 184" />
            <path className="hh-stroke-accent" d="M398 86 C364 64 326 54 284 56" />
            <path className="hh-stroke-accent" d="M194 80 C224 60 266 50 312 50" />
            <path className="hh-stroke-accent" d="M470 114 C476 120 478 128 476 138" />
            <path className="hh-stroke-accent" d="M458 114 C464 116 468 120 470 126" />
          </g>

          <g className="hh-spotlight-dust" fill="url(#hhSpotGrad)">
            <circle cx="120" cy="152" r="3.2" />
            <circle cx="138" cy="162" r="2.5" />
            <circle cx="332" cy="160" r="3" />
            <circle cx="360" cy="170" r="2.1" />
          </g>
        </svg>
      </div>

      <div className="hh-spotlight-copy">
        <div className="hh-spotlight-kicker">FEATURED MODEL ACCESS</div>
        <div className="hh-spotlight-title">
          <span>HappyHorse is now available</span>
          <span className="hh-spotlight-title-pill">LIVE</span>
        </div>
        <p className="hh-spotlight-sub">
          You can now call HappyHorse video capabilities directly through our unified API. Same authentication, same integration method — start running on NexusFlow right away.
        </p>
      </div>
    </div>
  );
}

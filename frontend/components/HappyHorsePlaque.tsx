"use client";

import Link from "next/link";

export default function HappyHorsePlaque() {
  return (
    <Link href="/docs/models/happyhorse" className="hh-plaque" aria-label="HappyHorse is live">
      <span className="hh-plaque-mark" aria-hidden="true">
        <span className="hh-plaque-mark-core">H</span>
      </span>
      <span className="hh-plaque-copy">
        <span className="hh-plaque-title">HappyHorse is live</span>
        <span className="hh-plaque-sub">by Alibaba</span>
      </span>
    </Link>
  );
}

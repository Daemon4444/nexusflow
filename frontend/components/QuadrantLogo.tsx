"use client";

/**
 * Nexusflow Logo — text wordmark with shimmer light sweep effect.
 * Uses Inter font (inherited), CSS-only animation for the light pass.
 */

export function NexusflowLogo({
  size = 15,
  color = "white",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 700,
        letterSpacing: 0,
        color,
        position: "relative",
        display: "inline-block",
        lineHeight: 1,
        fontFamily: "inherit",
      }}
    >
      {/* Base text */}
      <span style={{ position: "relative", zIndex: 1 }}>
        nexus
        <span style={{ fontWeight: 400, opacity: 0.5 }}>flow</span>
      </span>

      {/* Shimmer overlay — light sweep across the text */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          overflow: "hidden",
          pointerEvents: "none",
          WebkitMaskImage: `linear-gradient(to right, transparent, transparent)`,
          maskImage: `linear-gradient(to right, transparent, transparent)`,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 0,
            left: "-100%",
            width: "60%",
            height: "100%",
            background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)`,
            animation: "nf-shimmer 4s ease-in-out infinite",
          }}
        />
      </span>

      <style>{`
        @keyframes nf-shimmer {
          0%, 100% { left: -60%; opacity: 0; }
          10% { opacity: 1; }
          50% { left: 120%; opacity: 1; }
          60%, 100% { opacity: 0; left: 120%; }
        }
      `}</style>
    </span>
  );
}

/**
 * Large hero version — bigger wordmark with glowing backdrop.
 */
export function NexusflowLogoLarge() {
  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Glow backdrop */}
      <div
        style={{
          position: "absolute",
          width: 200,
          height: 60,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,255,255,0.06) 0%, transparent 70%)",
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />
      <NexusflowLogo size={40} color="white" />
    </div>
  );
}

// Backward-compatible exports
export const QuadrantLogo = NexusflowLogo;
export const QuadrantLogoLarge = NexusflowLogoLarge;

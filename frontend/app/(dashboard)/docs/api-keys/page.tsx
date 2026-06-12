"use client";

import Link from "next/link";

export default function ApiKeysDocPage() {
  return (
    <div style={{ padding: "48px 64px", maxWidth: 920 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8, fontWeight: 500 }}>Authentication</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: 8 }}>
          API Keys
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, maxWidth: 640 }}>
          Create and manage your API keys.
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Create a Key</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          After signing in, head to the <Link href="/keys" style={{ color: "var(--accent)" }}>API Keys</Link> page and click &quot;Create key&quot; to generate a new API key.
        </p>
        <div style={{ padding: 16, borderRadius: 10, background: "var(--accent-bg)", border: "1px solid var(--accent-border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>Heads up</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            Copy and store the key as soon as it&apos;s created. For security reasons, the full key value is not shown again. If you lose it, delete the key and create a new one.
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Key Format</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          nexusflow API keys use the <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>sk-air-</code> prefix followed by a random string.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 16 }}>
          <code style={{ fontSize: 13, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>sk-air-a1b2c3d4e5f6g7h8i9j0...</code>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Authentication Methods</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          Each protocol can pass the API key via its native header (SDKs handle this automatically). The Anthropic protocol additionally accepts a generic <code style={{ fontFamily: "var(--font-mono)" }}>Authorization: Bearer</code> header.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Protocol</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Native header</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Generic header</th>
              </tr>
            </thead>
            <tbody>
              {[
                { proto: "OpenAI", native: "Authorization: Bearer KEY", generic: "-" },
                { proto: "Anthropic", native: "x-api-key: KEY", generic: "Authorization: Bearer KEY" },
              ].map((row, idx) => (
                <tr key={row.proto} style={{ background: idx % 2 === 0 ? "var(--bg)" : "var(--bg-elevated)" }}>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.proto}</td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.native}</code></td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}><code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.generic}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12, lineHeight: 1.7 }}>
          When using the official SDKs you don&apos;t need to worry about header details—the SDK handles them. The generic header is mainly there to give cURL or custom HTTP clients a unified auth approach.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Best Practices</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { title: "Isolate by Project", desc: "Create a separate key per project so you can manage and track usage cleanly." },
            { title: "Rotate Regularly", desc: "Periodically delete old keys and create new ones to reduce exposure risk." },
            { title: "Use Environment Variables", desc: "Don't hard-code keys in source. Use environment variables or a secret manager." },
            { title: "Handle Leaks", desc: "If a key leaks, delete it from the management page immediately and create a new one." },
          ].map((item) => (
            <div key={item.title} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Related Docs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { href: "/docs/quickstart", label: "Quick Start", desc: "Three steps to your first model call" },
            { href: "/docs/multi-protocol", label: "Multi-Protocol Support", desc: "Learn each protocol's auth method" },
          ].map((link) => (
            <Link key={link.href} href={link.href} style={{ padding: "14px 18px", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", background: "var(--bg)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{link.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{link.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

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
          Create and manage your API keys
        </p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Create a Key</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          After logging in, go to the <Link href="/keys" style={{ color: "var(--accent)" }}>API Keys</Link> page and click Create Key to generate a new API Key.
        </p>
        <div style={{ padding: 16, borderRadius: 10, background: "var(--accent-bg)", border: "1px solid var(--accent-border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>Note</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            Please copy and save your key immediately after creation. For security reasons, the full key value will not be displayed again after creation. If lost, you need to delete it and create a new one.
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Key Format</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          NexusFlow API Keys uniformly use the <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>sk-air-</code> prefix followed by a random string.
        </p>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 16 }}>
          <code style={{ fontSize: 13, color: "#e5e5e5", fontFamily: "var(--font-mono)" }}>sk-air-a1b2c3d4e5f6g7h8i9j0...</code>
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Authentication Method</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          All protocols can pass the API Key via their native request headers (SDKs handle this automatically). Additionally, the Anthropic protocol also supports the generic <code style={{ fontFamily: "var(--font-mono)" }}>Authorization: Bearer</code> header.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Protocol</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Native Header</th>
                <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Generic Header</th>
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
          When using official SDKs, you don't need to worry about header details - the SDK handles them automatically. The generic header is mainly useful when using cURL or custom HTTP clients for unified authentication.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Best Practices</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { title: "Isolate by Project", desc: "Create separate Keys for different projects for easier management and usage tracking." },
            { title: "Rotate Regularly", desc: "Periodically delete old Keys and create new ones to reduce exposure risk." },
            { title: "Use Environment Variables", desc: "Don't hard-code Keys in your code - use environment variables or key management services." },
            { title: "Handle Leaks", desc: "If a Key is leaked, immediately delete it on the key management page and create a new one." },
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
            { href: "/docs/quickstart", label: "Quick Start", desc: "Get started calling AI models in three steps" },
            { href: "/docs/multi-protocol", label: "Multi-Protocol Support", desc: "Learn about authentication for each protocol" },
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

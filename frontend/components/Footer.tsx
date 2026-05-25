import Link from "next/link";

export default function Footer() {
  return (
    <footer className="nf-footer">
      <div className="nf-footer-inner">
        <div className="nf-footer-brand">
          <strong>NexusFlow</strong>
          <p>Unified AI Model Gateway</p>
        </div>
        <div className="nf-footer-links">
          <div className="nf-footer-col">
            <h4>Product</h4>
            <Link href="/models">Models</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/playground">Playground</Link>
            <Link href="/docs">Documentation</Link>
          </div>
          <div className="nf-footer-col">
            <h4>Resources</h4>
            <Link href="/docs/quickstart">Quickstart</Link>
            <Link href="/docs/api/parameters">API Reference</Link>
            <Link href="/docs/faq">FAQ</Link>
          </div>
          <div className="nf-footer-col">
            <h4>Legal</h4>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
        </div>
      </div>
      <div className="nf-footer-bottom">
        <span>&copy; {new Date().getFullYear()} NexusFlow. All rights reserved.</span>
      </div>
    </footer>
  );
}

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="nf-footer">
      <div className="nf-footer-inner">
        <div className="nf-footer-brand">
          <strong>NexusFlow</strong>
          <p>一个 API，调用全部主流大模型</p>
        </div>
        <div className="nf-footer-links">
          <div className="nf-footer-col">
            <h4>产品</h4>
            <Link href="/models">模型</Link>
            <Link href="/pricing">定价</Link>
            <Link href="/docs">文档</Link>
          </div>
          <div className="nf-footer-col">
            <h4>资源</h4>
            <Link href="/docs/quickstart">快速开始</Link>
            <Link href="/docs/api/parameters">API 参考</Link>
            <Link href="/docs/faq">常见问题</Link>
            <Link href="/status">服务状态</Link>
          </div>
          <div className="nf-footer-col">
            <h4>条款</h4>
            <Link href="/terms">服务条款</Link>
            <Link href="/privacy">隐私政策</Link>
          </div>
        </div>
      </div>
      <div className="nf-footer-bottom">
        <span>&copy; {new Date().getFullYear()} NexusFlow</span>
        <span>按量计费 · 服务状态实时公开</span>
      </div>
    </footer>
  );
}

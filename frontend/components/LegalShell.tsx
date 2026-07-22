import Link from "next/link";
import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import styles from "./LegalShell.module.css";

type LegalShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  children: ReactNode;
};

export default function LegalShell({
  eyebrow,
  title,
  description,
  effectiveDate,
  children,
}: LegalShellProps) {
  return (
    <div className={styles.site}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="返回 NexusFlow 首页">
          <strong>nexus</strong><span>flow</span>
        </Link>
        <nav aria-label="法律文件导航">
          <Link href="/terms">服务条款</Link>
          <Link href="/privacy">隐私政策</Link>
          <Link href="/docs">开发文档</Link>
        </nav>
      </header>

      <main id="main-content" className={styles.main}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.description}>{description}</p>
          <p className={styles.effective}>生效日期：{effectiveDate}</p>
        </header>

        <article className={styles.document}>{children}</article>
      </main>

      <Footer />
    </div>
  );
}

import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main-content" style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)" }}>
        {children}
      </main>
      <Footer />
    </>
  );
}

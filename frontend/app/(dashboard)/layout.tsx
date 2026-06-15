import Header from "@/components/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main-content" style={{ height: "calc(100vh - 56px)", overflow: "auto", background: "var(--bg)" }}>
        {children}
      </main>
    </>
  );
}

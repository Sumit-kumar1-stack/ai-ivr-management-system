import Sidebar from "./sidebar";
import Header from "./header";

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar />

      <div className="flex-1">
        <Header />

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
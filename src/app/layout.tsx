import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "agentItAll",
  description: "Local AI agent dashboard for your repos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <Sidebar />
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </body>
    </html>
  );
}

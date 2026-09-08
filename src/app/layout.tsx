import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LogOut, Ruler } from "lucide-react";
import "./globals.css";
import { authEnabled } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Growth Tracker",
  description: "Track a child's stature and weight on the CDC 2 to 20 years growth charts.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Growth" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f5f7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="bg-surface border-b border-line">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-bold"><Ruler size={18} className="text-brand" /> Growth Tracker</Link>
            {authEnabled() && (
              <form method="post" action="/api/auth/logout">
                <button type="submit" className="btn-ghost btn-sm text-muted hover:text-ink"><LogOut size={14} /> Sign out</button>
              </form>
            )}
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-5 lg:px-6 lg:py-8">{children}</main>
      </body>
    </html>
  );
}

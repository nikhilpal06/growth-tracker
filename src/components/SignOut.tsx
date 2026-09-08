"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

/** Sign-out button; hidden on the login screen itself. */
export default function SignOut() {
  if (usePathname() === "/login") return null;
  return (
    <form method="post" action="/api/auth/logout">
      <button type="submit" className="btn-ghost btn-sm text-muted hover:text-ink"><LogOut size={14} /> Sign out</button>
    </form>
  );
}

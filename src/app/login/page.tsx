import Link from "next/link";
import { Ruler } from "lucide-react";
import { authEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const enabled = authEnabled();
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <form method="post" action="/api/auth/login" className="card card-pad w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2 font-bold text-lg"><Ruler size={20} className="text-brand" /> Growth Tracker</div>
        {enabled ? (
          <>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" className="input" autoFocus autoComplete="current-password" />
              <input type="hidden" name="next" value={next ?? "/"} />
            </div>
            {error && <div className="text-sm text-danger">Wrong password.</div>}
            <button className="btn-primary w-full" type="submit">Sign in</button>
          </>
        ) : (
          <div className="text-sm text-muted">
            Login is off because <code>APP_PASSWORD</code> is not set. That is fine on your own machine. Set it before hosting this app on the internet.
            <div className="mt-3"><Link href="/" className="btn-primary">Continue</Link></div>
          </div>
        )}
      </form>
    </div>
  );
}

/**
 * Absolute URL for redirects. Behind a hosting proxy (Railway, Fly, nginx) the raw
 * request URL is the container's internal address, so prefer APP_URL, then the
 * forwarded headers, then the request itself.
 */
export function absoluteUrl(req: Request, pathAndQuery: string): URL {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  if (base) return new URL(pathAndQuery, base + "/");
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return new URL(pathAndQuery, `${proto ?? "https"}://${host}/`);
  return new URL(pathAndQuery, req.url);
}

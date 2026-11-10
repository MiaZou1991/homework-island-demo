// KAIXIN-only HTTPS QA preview, served exclusively from isolated Supabase staging.
// Static HTML and scripts only. Never accepts passwords, tokens, family payloads,
// or credentials server-side. Actual data access is protected by Supabase Auth/RLS.
// DEPLOY TARGET MUST BE project tgnznizqhheiwgdhvwdc, NEVER production.
import { html, flow, ui } from "./assets.ts";

const functionPath = "/functions/v1/kaixin-onboarding-preview";
const baseHeaders: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://tgnznizqhheiwgdhvwdc.supabase.co wss://tgnznizqhheiwgdhvwdc.supabase.co",
    "upgrade-insecure-requests",
  ].join("; "),
};

function result(body: string | null, status: number, type: string, method: string): Response {
  return new Response(method === "HEAD" ? null : body, {
    status, headers: { ...baseHeaders, "Content-Type": type },
  });
}

Deno.serve((request: Request) => {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return result("Read-only staging preview", 405, "text/plain; charset=utf-8", method);
  }
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.endsWith("/kaixin-onboarding-preview") && !path.endsWith("/")) {
    return new Response(null, {
      status: 308,
      headers: { ...baseHeaders, Location: url.origin + path + "/" },
    });
  }
  if (path.endsWith("/") || path === "/") {
    return result(html, 200, "text/html; charset=utf-8", method);
  }
  if (path.endsWith("/kaixin-staging-onboarding-flow.js")) {
    return result(flow, 200, "text/javascript; charset=utf-8", method);
  }
  if (path.endsWith("/kaixin-staging-onboarding-ui.js")) {
    return result(ui, 200, "text/javascript; charset=utf-8", method);
  }
  return result("Not found", 404, "text/plain; charset=utf-8", method);
});

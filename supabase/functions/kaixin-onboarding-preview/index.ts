// Intentionally DISABLED staging-only experiment.
// Supabase Edge Functions on the shared *.supabase.co hostname deliberately
// override HTML Content-Type to text/plain. They cannot safely host a login UI.
// Keep this function unconditionally closed until a separate approved HTTPS
// static host is ready. Never accept passwords/tokens or read user data here.
// Production Supabase is untouched.
Deno.serve((_request: Request) =>
  new Response("KAIXIN staging HTML preview is disabled. Use a separate HTTPS static host.", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  })
);

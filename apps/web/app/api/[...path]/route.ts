import type { NextRequest } from "next/server";

/**
 * Proxy del panel a la API: el navegador solo habla con este dominio, así la cookie de sesión es
 * de primera parte (HttpOnly, SameSite=Lax) y la API puede quedar en la red privada de Railway.
 */
export const dynamic = "force-dynamic";

const FORWARD_REQUEST_HEADERS = ["content-type", "cookie", "user-agent", "x-cergo-csrf", "x-request-id", "accept"];
const DROP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";
  const { path } = await ctx.params;
  const target = `${base.replace(/\/$/, "")}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const fwd = req.headers.get("x-forwarded-for");
  const realIp = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  if (realIp) headers.set("x-forwarded-for", realIp);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: { code: "unavailable", message: "No pudimos conectar con el servidor. Probá de nuevo en un momento." } }, { status: 503 });
  }
  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie") out.set(key, value);
  });
  for (const cookie of res.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };

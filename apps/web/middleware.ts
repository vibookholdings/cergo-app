import { NextResponse, type NextRequest } from "next/server";

/** Sin cookie de sesión, las páginas privadas mandan a /entrar (la API valida la sesión de verdad). */
export function middleware(req: NextRequest) {
  if (!req.cookies.has("cergo_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/h/:path*", "/admin/:path*", "/cuenta/:path*", "/"] };

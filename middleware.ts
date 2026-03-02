import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function supabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey()!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, { ...options, path: "/" });
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const isApp = pathname === "/app" || pathname.startsWith("/app/");

  console.log("[MW]", {
    pathname,
    isLogin,
    isApp,
    hasUser: !!user,
    authError: error ? String(error.message ?? error) : null,
  });

  if (isApp && !user) {
    console.log("[MW] redirect -> /login");
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isLogin && user) {
    console.log("[MW] redirect -> /app");
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = { matcher: ["/app/:path*", "/login"] };
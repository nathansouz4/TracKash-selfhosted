import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { getRequest, setResponseHeaders } from "@tanstack/react-start/server";

import { isLocalHost } from "./lib/hosts";
import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * There is no sign-in: the app belongs to whoever runs it, on their own machine.
 * So it only answers requests addressed to this machine (Vite also binds to
 * localhost only). Checking the Host header stops DNS rebinding: a web page
 * pointing its own domain at 127.0.0.1 to read the dashboards.
 */
const localOnlyMiddleware = createMiddleware().server(async ({ next }) => {
  const host = getRequest().headers.get("host") ?? "";
  if (!isLocalHost(host)) {
    return new Response("Trackash only answers on this machine (localhost).", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return next();
});

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Security headers for every server response, including a strict CSP: in
 * production only scripts carrying this request's nonce run (the router puts
 * it on the scripts it renders, see router.tsx). Styles allow inline because
 * charts use style attributes; that can't execute code.
 */
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const nonce = createNonce();
  const isDev = process.env["NODE_ENV"] !== "production";
  const csp = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://cdn.pluggy.ai",
    "font-src 'self'",
    isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  setResponseHeaders(
    new Headers({
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      // Every page and RPC is personal data: never cache it anywhere.
      "Cache-Control": "no-store, private",
    }),
  );
  return next({ context: { nonce } });
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [
    errorMiddleware,
    localOnlyMiddleware,
    securityHeadersMiddleware,
    csrfMiddleware,
  ],
}));

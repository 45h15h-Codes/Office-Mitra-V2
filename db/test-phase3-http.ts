/**
 * Phase 3 — Live HTTP verification.
 *
 * Prerequisites:
 *   1. Test user seeded (run `npx tsx db/seed-test-user.ts`)
 *   2. Dev server running (`npm run dev`)
 *
 * This script hits the real server function endpoint via HTTP,
 * exercising the full loginServerFn → setResponseHeader("Set-Cookie")
 * code path that unit tests can't reach.
 *
 * Run: npx tsx db/test-phase3-http.ts
 */
import "dotenv/config";

const BASE = "http://localhost:8080";

// TanStack Start server functions are invoked via POST to the server fn URL.
// The client calls loginServerFn({ data: ... }) which internally POSTs to
// /_server/?_serverFnId=... with JSON body. We need to discover the endpoint.
// Alternative: just POST to the login page and let the form handler work.
// Simplest reliable approach: import the server function's URL at build time.
// Since we can't do that outside the framework, we'll hit the SSR page and
// then call the function by its convention.

async function waitForServer(maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(BASE, { method: "HEAD" });
      if (res.ok || res.status === 200 || res.status === 302) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function findServerFnUrl(): Promise<string> {
  // Load the login page HTML, extract the server function ID from the bundled JS
  // TanStack Start embeds the server fn URL in the client bundle.
  // Convention: /_server/?_serverFnId=<hash>&_serverFnName=loginServerFn
  // Let's try fetching the login page and parsing script sources
  const loginHtml = await (await fetch(`${BASE}/login`)).text();

  // Look for the login.function chunk in script tags
  const scriptMatch = loginHtml.match(/src="([^"]*login\.function[^"]*)"/);
  if (scriptMatch) {
    const scriptUrl = scriptMatch[1]!.startsWith("http")
      ? scriptMatch[1]!
      : `${BASE}${scriptMatch[1]}`;
    const scriptContent = await (await fetch(scriptUrl)).text();
    // Server fn URLs look like: url: "/_server/?_serverFnId=..."
    const urlMatch = scriptContent.match(/url:\s*"(\/[^"]*_serverFnId[^"]*)"/);
    if (urlMatch) return urlMatch[1]!;
  }

  // Fallback: try the createServerFn chunk
  const chunkScripts = [...loginHtml.matchAll(/src="([^"]*(?:createServerFn|auth)[^"]*)"/g)];
  for (const [, src] of chunkScripts) {
    const scriptUrl = src!.startsWith("http") ? src! : `${BASE}${src}`;
    try {
      const content = await (await fetch(scriptUrl)).text();
      const urlMatch = content.match(/url:\s*"(\/[^"]*_serverFnId[^"]*)"/);
      if (urlMatch) return urlMatch[1]!;
    } catch { /* skip */ }
  }

  // Last resort: scan all script tags
  const allScripts = [...loginHtml.matchAll(/src="([^"]+\.js[^"]*)"/g)];
  for (const [, src] of allScripts) {
    const scriptUrl = src!.startsWith("http") ? src! : `${BASE}${src}`;
    try {
      const content = await (await fetch(scriptUrl)).text();
      const urlMatch = content.match(/url:\s*"(\/[^"]*_serverFnId[^"]*)"/);
      if (urlMatch) return urlMatch[1]!;
    } catch { /* skip */ }
  }

  throw new Error("Could not find loginServerFn URL in client bundle");
}

async function main() {
  console.log("Waiting for dev server at", BASE, "...");
  const ready = await waitForServer();
  if (!ready) {
    console.error("Dev server not reachable at", BASE, "— start it with `npm run dev` first.");
    process.exit(1);
  }
  console.log("Dev server is up.\n");

  // Find the server function endpoint
  let serverFnUrl: string;
  try {
    serverFnUrl = await findServerFnUrl();
    console.log("Discovered server fn URL:", serverFnUrl);
  } catch (e: any) {
    console.error("Could not discover server fn URL:", e.message);
    console.log("Trying direct convention URL...");
    // TanStack Start convention: POST to /_server with the function data
    serverFnUrl = "/_server";
  }

  const fullUrl = `${BASE}${serverFnUrl}`;

  console.log("\n==========================================================");
  console.log("HTTP TEST 1: Valid login — expect Set-Cookie in response");
  console.log("==========================================================");

  const validRes = await fetch(fullUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: "phase3test@officemitra.io", password: "Phase3Pass123!" } }),
    redirect: "manual",
  });

  console.log("Status:", validRes.status);
  console.log("All response headers:");
  validRes.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });

  const setCookie = validRes.headers.get("set-cookie");
  console.log("\nSet-Cookie header:", setCookie);
  if (setCookie && setCookie.includes("om_session=")) {
    console.log("PASS — Set-Cookie with om_session present in live HTTP response");
  } else {
    console.log("FAIL — No om_session Set-Cookie header in response");
  }

  const validBody = await validRes.text();
  console.log("Response body:", validBody);

  console.log("\n==========================================================");
  console.log("HTTP TEST 2: Wrong password — no cookie, error response");
  console.log("==========================================================");

  const wrongRes = await fetch(fullUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email: "phase3test@officemitra.io", password: "wrong" } }),
    redirect: "manual",
  });

  console.log("Status:", wrongRes.status);
  const wrongSetCookie = wrongRes.headers.get("set-cookie");
  console.log("Set-Cookie header:", wrongSetCookie);
  if (!wrongSetCookie || !wrongSetCookie.includes("om_session=")) {
    console.log("PASS — No session cookie on failed login");
  } else {
    console.log("FAIL — Session cookie issued on failed login!");
  }
  const wrongBody = await wrongRes.text();
  console.log("Response body:", wrongBody);

  console.log("\n==========================================================");
  console.log("HTTP TEST 3: Protected endpoint with valid cookie");
  console.log("==========================================================");

  if (setCookie) {
    // Extract just the cookie name=value part
    const cookieValue = setCookie.split(";")[0]!;
    const protectedRes = await fetch(`${BASE}/`, {
      headers: { cookie: cookieValue },
      redirect: "manual",
    });
    console.log("Status accessing / with valid cookie:", protectedRes.status);
    console.log(protectedRes.status < 400 ? "PASS — Authenticated access" : "INFO — Check if route requires cookie");
  }

  console.log("\nDone. All HTTP tests complete.");
}

main().catch((err) => {
  console.error("HTTP test failed:", err);
  process.exit(1);
});

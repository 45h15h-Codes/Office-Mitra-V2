import { chromium } from "playwright";

async function main() {
  console.log("Launching chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let setCookieHeaderFound: string | null = null;
  let serverFnResponseStatus: number | null = null;
  let serverFnResponseBody: string | null = null;

  // Listen to network responses
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("_server") || response.request().method() === "POST") {
      console.log(`\n[NETWORK] POST Response: ${response.status()} ${url}`);
      serverFnResponseStatus = response.status();
      const headers = response.headers();
      console.log("[NETWORK] Response Headers:", JSON.stringify(headers, null, 2));

      const cookieHeader = headers["set-cookie"];
      if (cookieHeader) {
        setCookieHeaderFound = cookieHeader;
        console.log(">>> FOUND Set-Cookie HEADER:", cookieHeader);
      }
      try {
        serverFnResponseBody = await response.text();
        console.log("[NETWORK] Response Body:", serverFnResponseBody);
      } catch (e) {}
    }
  });

  console.log("Navigating to http://localhost:8080/login...");
  await page.goto("http://localhost:8080/login", { waitUntil: "networkidle" });

  console.log("Filling login form...");
  await page.fill("#email", "phase3test@officemitra.io");
  await page.fill("#password", "Phase3Pass123!");

  console.log("Clicking Sign in...");
  await Promise.all([
    page.waitForNavigation({ timeout: 5000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  await page.waitForTimeout(2000);

  console.log("\n==========================================================");
  console.log("LIVE BROWSER HTTP VERIFICATION RESULTS:");
  console.log("==========================================================");
  console.log("Final Page URL:", page.url());
  console.log("Server Fn Status:", serverFnResponseStatus);
  console.log("Set-Cookie Header:", setCookieHeaderFound);

  const cookies = await context.cookies();
  console.log("Browser Cookies stored after login:", cookies);

  await browser.close();

  if (setCookieHeaderFound && setCookieHeaderFound.includes("om_session=")) {
    console.log("\nPASS: Real HTTP login request issued valid Set-Cookie header in live H3 context!");
    process.exit(0);
  } else if (cookies.some(c => c.name === "om_session")) {
    console.log("\nPASS: om_session cookie was set in browser storage!");
    process.exit(0);
  } else {
    console.log("\nFAIL: om_session cookie was NOT issued or saved.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});

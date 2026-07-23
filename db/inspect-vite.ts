import "dotenv/config";

async function main() {
  const url = "http://localhost:8080/src/routes/login.tsx";
  const res = await fetch(url);
  const code = await res.text();
  console.log("login.tsx status:", res.status);
  console.log("login.tsx code sample:", code.slice(0, 500));

  // Fetch login.function.ts directly from Vite dev server
  const fnUrl = "http://localhost:8080/src/lib/auth/login.function.ts";
  const fnRes = await fetch(fnUrl);
  const fnCode = await fnRes.text();
  console.log("\nlogin.function.ts status:", fnRes.status);
  console.log("login.function.ts transformed code:\n", fnCode);
}

main();

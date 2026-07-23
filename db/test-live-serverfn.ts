import "dotenv/config";
import { toJSONAsync } from "seroval";

const BASE = "http://localhost:8080";
const FN_ID = "eyJmaWxlIjoiL3NyYy9saWIvYXV0aC9sb2dpbi5mdW5jdGlvbi50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJsb2dpblNlcnZlckZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

async function testUrl(path: string, extraHeaders: Record<string, string> = {}) {
  const url = `${BASE}${path}`;
  console.log(`\nTesting POST to: ${url}`);
  const payload = { data: { email: "phase3test@officemitra.io", password: "Phase3Pass123!" } };
  const serializedBody = JSON.stringify(await toJSONAsync(payload));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tsr-serverFn": "true",
      "accept": "application/json, text/html, */*",
      ...extraHeaders,
    },
    body: serializedBody,
  });

  console.log("Status:", res.status);
  const setCookie = res.headers.get("set-cookie");
  console.log("Set-Cookie:", setCookie);
  const text = await res.text();
  console.log("Body snippet:", text.slice(0, 200));
  return setCookie;
}

async function main() {
  // Test variations
  await testUrl(`/_server/${FN_ID}`);
  await testUrl(`/_server?_serverFnId=${FN_ID}`);
  await testUrl(`/_server/${encodeURIComponent(FN_ID)}`);
  await testUrl(`/login?_serverFnId=${FN_ID}`);
}

main().catch(err => console.error("Error:", err));

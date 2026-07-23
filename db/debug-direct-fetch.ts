async function testDirectModuleFetch() {
  const url = "http://localhost:8080/src/lib/auth/login.function.ts";
  const res = await fetch(url);
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Transformed code snippet:", text.slice(0, 500));
  const urlMatches = [...text.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
  console.log("Found fn URLs:", urlMatches);
}

testDirectModuleFetch();

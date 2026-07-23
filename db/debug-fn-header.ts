async function testHeaderServerFn() {
  const fnId =
    "eyJmaWxlIjoiL3NyYy9saWIvYXV0aC9sb2dpbi5mdW5jdGlvbi50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJsb2dpblNlcnZlckZuX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";

  console.log("=== Testing x-server-fn-id header ===");
  const res1 = await fetch("http://localhost:8080/_server", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-server-fn-id": fnId,
    },
    body: JSON.stringify({ email: "phase3test@officemitra.io", password: "Phase3Pass123!" }),
  });
  console.log("Status with header:", res1.status);
  console.log("Set-Cookie header:", res1.headers.get("set-cookie"));
  console.log("Body:", await res1.text());

  console.log("\n=== Testing query param with x-server-fn-name ===");
  const res2 = await fetch(
    `http://localhost:8080/_server?_serverFnId=${encodeURIComponent(fnId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-server-fn-id": fnId,
        "x-server-fn-name": "loginServerFn",
      },
      body: JSON.stringify({ email: "phase3test@officemitra.io", password: "Phase3Pass123!" }),
    },
  );
  console.log("Status with header & query:", res2.status);
  console.log("Set-Cookie header:", res2.headers.get("set-cookie"));
  console.log("Body:", await res2.text());
}

testHeaderServerFn();

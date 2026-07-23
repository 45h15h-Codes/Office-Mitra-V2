import "dotenv/config";

async function seedBrowserUser() {
  const payload = {
    companyName: "Browser Corp " + Date.now(),
    ownerEmail: "browserowner@testcorp.com",
    ownerName: "Browser Owner",
    password: "Password123!",
  };

  const res = await fetch("http://localhost:8080/api/public/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: payload }),
  });

  const data = await res.json();
  console.log("Browser user registration result:", data);
}

seedBrowserUser().catch(console.error);

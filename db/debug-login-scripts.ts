import "dotenv/config";

async function inspectLoginScripts() {
  const html = await (await fetch("http://localhost:8080/login")).text();
  console.log("HTML length:", html.length);
  const scripts = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  console.log("Script tags found in HTML:", scripts);

  for (const src of scripts) {
    const url = src.startsWith("http") ? src : `http://localhost:8080${src}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`\nScript ${src} (status ${res.status}, length ${text.length}):`);
      const fnMatches = [...text.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
      if (fnMatches.length > 0) {
        console.log("  Found fn URLs:", fnMatches);
      }
      if (text.includes("loginServerFn")) {
        console.log("  Contains text 'loginServerFn'!");
      }
    } catch (e: any) {
      console.log(`Failed fetching ${src}:`, e.message);
    }
  }
}

inspectLoginScripts();

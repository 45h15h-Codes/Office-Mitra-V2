import "dotenv/config";

async function main() {
  const res = await fetch("http://localhost:8080/login");
  const html = await res.text();
  console.log("Fetched login page, length:", html.length);
  
  // Find all script tags
  const scripts = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  console.log("Found scripts:", scripts);

  for (const src of scripts) {
    if (!src) continue;
    const url = src.startsWith("http") ? src : `http://localhost:8080${src}`;
    try {
      const js = await (await fetch(url)).text();
      const fnMatches = js.match(/_serverFnId[^"']*/g);
      if (fnMatches) {
        console.log(`Found in ${src}:`, fnMatches);
      }
      const serverFnId = js.match(/serverFnId["']?\s*[:=]\s*["']([^"']+)["']/);
      if (serverFnId) {
        console.log(`Found serverFnId in ${src}:`, serverFnId[1]);
      }
    } catch (e: any) {
      console.log("Error fetching script", src, e.message);
    }
  }
}

main();

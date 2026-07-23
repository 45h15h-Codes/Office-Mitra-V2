import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";

export const Route = createFileRoute("/uploads/screenshots/$filename")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { filename } = params;
        const safeName = path.basename(filename);
        const filePath = path.join(process.cwd(), "public/uploads/screenshots", safeName);

        if (!fs.existsSync(filePath)) {
          return new Response(JSON.stringify({ ok: false, error: "Image file not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const buf = fs.readFileSync(filePath);
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});

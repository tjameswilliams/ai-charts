import { Hono } from "hono";
import { join } from "path";
import { newId } from "../lib/nanoid";

const projectRoot = import.meta.dir.replace(/\/server\/routes$/, "");
const uploadsDir = join(projectRoot, "uploads");

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/markdown": ".md",
  "application/json": ".json",
};

const app = new Hono();

// Upload an image file
app.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }

  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return c.json(
      { error: `Unsupported file type: ${file.type}. Supported: ${Object.keys(MIME_TO_EXT).join(", ")}` },
      400
    );
  }

  const id = newId();
  const filename = `${id}${ext}`;
  const filepath = join(uploadsDir, filename);

  const buffer = await file.arrayBuffer();
  await Bun.write(filepath, buffer);

  const url = `/api/uploads/${filename}`;
  return c.json({ url, filename, id });
});

// Serve uploaded files
app.get("/uploads/:filename", async (c) => {
  const filename = c.req.param("filename");

  // Prevent directory traversal
  if (filename.includes("..") || filename.includes("/")) {
    return c.json({ error: "Invalid filename" }, 400);
  }

  const filepath = join(uploadsDir, filename);
  const file = Bun.file(filepath);

  if (!(await file.exists())) {
    return c.json({ error: "Not found" }, 404);
  }

  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

export default app;

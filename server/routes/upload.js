import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "uploads");

// Make sure the uploads folder exists (it's git-ignored, so it won't exist
// on a fresh clone/deploy until the first file is sent).
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 15MB cap keeps this minimal — big enough for photos/short clips/docs,
// small enough to not choke a free-tier server.
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, unique);
  },
});

const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

const router = Router();

// Auth'd users only. Client sends multipart/form-data with a single "file" field.
router.post("/", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

  const isImage = req.file.mimetype.startsWith("image/");

  res.json({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    kind: isImage ? "image" : "file",
  });
});

export default router;

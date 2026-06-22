import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { validateSession } from "../data/users";
import { validateApiKey } from "../data/apikeys";

const router = Router();

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
const JPEG_MIME = "image/jpeg";

type UploadResult = {
  filename: string;
  size: number;
  mimetype: string;
};

// Configure upload directory
const uploadDir = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp",
    "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
  ];
  const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".mp4", ".mov", ".webm", ".avi"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file format. Supported: JPG, PNG, WebP, GIF, BMP, MP4, MOV, WebM"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

async function requireUploadAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Upload requires login or API Key" });
    return;
  }

  const token = auth.slice(7).trim();
  if ((await validateSession(token)) || (await validateApiKey(token))) {
    next();
    return;
  }

  res.status(401).json({ success: false, message: "Upload credential invalid or expired" });
}

function jpegFilename(filename: string): string {
  const parsed = path.parse(filename);
  return `${parsed.name}.jpg`;
}

function replaceFile(source: string, target: string) {
  if (source !== target && fs.existsSync(source)) {
    fs.unlinkSync(source);
  }
  fs.renameSync(`${target}.tmp`, target);
}

async function compressImageIfNeeded(file: Express.Multer.File): Promise<UploadResult> {
  const filePath = file.path;
  const mimetype = file.mimetype;
  const stat = fs.statSync(filePath);
  const isImage = mimetype.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp)$/i.test(filePath);
  const isAnimatedGif = mimetype === "image/gif" || /\.gif$/i.test(filePath);
  if (!isImage || isAnimatedGif || stat.size <= IMAGE_SIZE_LIMIT) {
    return { filename: file.filename, size: stat.size, mimetype };
  }

  console.log(`[Upload API] Compressing image: ${stat.size} bytes -> target <= 10MB`);
  const outputFilename = jpegFilename(file.filename);
  const outputPath = path.join(uploadDir, outputFilename);
  const tmpPath = outputPath + ".tmp";

  // Compress: reduce to fit within 10MB using JPEG quality stepping down
  let quality = 85;
  while (quality >= 40) {
    await sharp(filePath).jpeg({ quality }).toFile(tmpPath);
    const newSize = fs.statSync(tmpPath).size;
    if (newSize <= IMAGE_SIZE_LIMIT) {
      replaceFile(filePath, outputPath);
      console.log(`[Upload API] Compressed to ${newSize} bytes (quality=${quality})`);
      return { filename: outputFilename, size: newSize, mimetype: JPEG_MIME };
    }
    quality -= 10;
  }

  // If still too large after quality reduction, also resize
  const meta = await sharp(filePath).metadata();
  const maxDim = 3840;
  const needsResize = (meta.width || 0) > maxDim || (meta.height || 0) > maxDim;
  await sharp(filePath)
    .resize(needsResize ? maxDim : undefined, needsResize ? maxDim : undefined, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 40 })
    .toFile(tmpPath);
  const finalSize = fs.statSync(tmpPath).size;
  replaceFile(filePath, outputPath);
  console.log(`[Upload API] Compressed (resize+quality=40) to ${finalSize} bytes`);
  return { filename: outputFilename, size: finalSize, mimetype: JPEG_MIME };
}

// POST /api/upload - single file upload
router.post("/", requireUploadAuth, upload.single("file"), async (req, res) => {
  console.log("[Upload API] Received request, file:", req.file?.originalname, "size:", req.file?.size);
  if (!req.file) {
    console.log("[Upload API] No file in request");
    res.status(400).json({ success: false, message: "No file received" });
    return;
  }

  let uploaded: UploadResult = {
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  };

  try {
    uploaded = await compressImageIfNeeded(req.file);
  } catch (err: any) {
    console.error("[Upload API] Compression failed:", err.message);
    // Compression failure does not affect upload, continue with original file
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const publicUrl = `${baseUrl}/api/uploads/${uploaded.filename}`;
  console.log("[Upload API] Success, url:", publicUrl, "size:", uploaded.size);

  res.json({
    success: true,
    data: {
      url: publicUrl,
      filename: uploaded.filename,
      size: uploaded.size,
      mimetype: uploaded.mimetype,
    },
  });
});

// GET /api/uploads/:filename - serve uploaded files through the backend.
router.get("/:filename", (req, res) => {
  const filename = path.basename(req.params.filename || "");
  if (!filename) {
    res.status(400).json({ success: false, message: "Invalid filename" });
    return;
  }

  const filePath = path.join(uploadDir, filename);
  if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: "File not found" });
    return;
  }

  res.sendFile(filePath);
});

// Error handler for multer errors
router.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ success: false, message: "File too large, maximum 100MB" });
      return;
    }
    res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    return;
  }
  if (err.message) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }
  res.status(500).json({ success: false, message: "Upload failed" });
});

export default router;

import { Router, Request } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

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
    cb(new Error("不支持的文件格式。支持: JPG, PNG, WebP, GIF, BMP, MP4, MOV, WebM"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// POST /api/upload - single file upload
router.post("/", upload.single("file"), (req, res) => {
  console.log("[Upload API] Received request, file:", req.file?.originalname, "size:", req.file?.size);
  if (!req.file) {
    console.log("[Upload API] No file in request");
    res.status(400).json({ success: false, message: "未收到文件" });
    return;
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const publicUrl = `${baseUrl}/api/uploads/${req.file.filename}`;
  console.log("[Upload API] Success, url:", publicUrl);

  res.json({
    success: true,
    data: {
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
  });
});

// GET /api/uploads/:filename - serve uploaded files through the backend.
router.get("/:filename", (req, res) => {
  const filename = path.basename(req.params.filename || "");
  if (!filename) {
    res.status(400).json({ success: false, message: "文件名无效" });
    return;
  }

  const filePath = path.join(uploadDir, filename);
  if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: "文件不存在" });
    return;
  }

  res.sendFile(filePath);
});

// Error handler for multer errors
router.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ success: false, message: "文件过大，最大支持 100MB" });
      return;
    }
    res.status(400).json({ success: false, message: `上传错误: ${err.message}` });
    return;
  }
  if (err.message) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }
  res.status(500).json({ success: false, message: "上传失败" });
});

export default router;

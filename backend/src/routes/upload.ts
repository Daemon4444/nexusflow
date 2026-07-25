import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { validateSession } from "../data/users";
import { validateApiKey } from "../data/apikeys";
import { checkRPM } from "../services/rate-limiter";
import { getUploadObject, isOssUploadEnabled, putUploadObject } from "../services/oss";

const router = Router();

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
const JPEG_MIME = "image/jpeg";
const UPLOAD_RPM = Math.max(1, Number(process.env.UPLOAD_RPM || 10));

const MIME_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/bmp": [".bmp"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
  "video/x-msvideo": [".avi"],
};

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
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${randomUUID()}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  // The declared MIME and extension must be an exact known pair. Browser
  // supplied MIME values are not trusted as content validation; file magic is
  // checked again after multer writes the file.
  if (MIME_EXTENSIONS[file.mimetype]?.includes(ext)) {
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

async function requireUploadAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "上传需要登录或 API Key" });
    return;
  }

  const token = auth.slice(7).trim();
  const session = await validateSession(token);
  const apiKey = session ? null : await validateApiKey(token);
  const identity = session?.id || apiKey?.user_id || apiKey?.id;
  if (identity) {
    const rate = await checkRPM(`upload:${identity}`, UPLOAD_RPM);
    if (!rate.allowed) {
      res.status(429).json({ success: false, message: `上传过于频繁，请 ${Math.ceil(rate.resetMs / 1000)} 秒后重试` });
      return;
    }
    next();
    return;
  }

  res.status(401).json({ success: false, message: "上传凭证无效或已过期" });
}

async function hasValidFileSignature(file: Express.Multer.File): Promise<boolean> {
  const handle = await fs.promises.open(file.path, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);
    const ascii = (start: number, end: number) => head.subarray(start, end).toString("ascii");

    switch (file.mimetype) {
      case "image/jpeg":
        return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      case "image/png":
        return head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      case "image/gif":
        return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
      case "image/webp":
        return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
      case "image/bmp":
        return ascii(0, 2) === "BM";
      case "video/mp4":
      case "video/quicktime":
        return ascii(4, 8) === "ftyp";
      case "video/webm":
        return head.length >= 4 && head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      case "video/x-msvideo":
        return ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI ";
      default:
        return false;
    }
  } finally {
    await handle.close();
  }
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
    res.status(400).json({ success: false, message: "未收到文件" });
    return;
  }

  let uploaded: UploadResult = {
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  };

  try {
    if (!(await hasValidFileSignature(req.file))) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ success: false, message: "文件内容与声明格式不匹配" });
      return;
    }
  } catch (err: any) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error("[Upload API] Signature validation failed:", err.message);
    res.status(400).json({ success: false, message: "无法验证文件内容" });
    return;
  }

  try {
    uploaded = await compressImageIfNeeded(req.file);
  } catch (err: any) {
    console.error("[Upload API] Compression failed:", err.message);
    // 压缩失败不影响上传，继续用原文件
  }

  if (isOssUploadEnabled()) {
    try {
      await putUploadObject(uploaded.filename, path.join(uploadDir, uploaded.filename), uploaded.mimetype);
      await fs.promises.unlink(path.join(uploadDir, uploaded.filename));
    } catch (err: any) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      console.error("[Upload API] OSS upload failed:", err.message);
      res.status(503).json({ success: false, message: "文件存储暂不可用，请稍后重试" });
      return;
    }
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
router.get("/:filename", async (req, res) => {
  const filename = path.basename(req.params.filename || "");
  if (!filename) {
    res.status(400).json({ success: false, message: "文件名无效" });
    return;
  }

  if (isOssUploadEnabled()) {
    try {
      const object = await getUploadObject(filename);
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (object.contentType) res.setHeader("Content-Type", object.contentType);
      if (object.contentLength) res.setHeader("Content-Length", object.contentLength);
      object.body.on("error", (err) => {
        console.error("[Upload API] OSS download stream failed:", err.message);
        if (!res.headersSent) res.status(502).end();
        else res.destroy(err);
      });
      object.body.pipe(res);
      return;
    } catch (err: any) {
      console.error("[Upload API] OSS download failed:", err.message);
      res.status(err.statusCode === 404 ? 404 : 502).json({
        success: false,
        message: err.statusCode === 404 ? "文件不存在" : "文件存储暂不可用",
      });
      return;
    }
  }

  const filePath = path.join(uploadDir, filename);
  if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: "文件不存在" });
    return;
  }

  // 纵深防御：即便存在历史遗留的可执行内容（HTML/SVG），也禁止其加载脚本/资源，
  // 且禁止浏览器嗅探类型。图片仍可正常内联显示。
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("X-Content-Type-Options", "nosniff");
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

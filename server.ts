import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Configure Cloudinary
  const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
  if (useCloudinary) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ storage });

  app.use(express.json({ limit: '50mb' }));
  app.use('/uploads', express.static(uploadsDir));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (useCloudinary) {
        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "gymni-mate" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          const fileBuffer = fs.readFileSync(req.file!.path);
          uploadStream.end(fileBuffer);
        });
        return res.json({ url: (result as any).secure_url });
      }

      // Return local URL
      const url = `/uploads/${req.file.filename}`;
      res.json({ url });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Handle base64 upload if needed
  app.post("/api/upload-base64", async (req, res) => {
    try {
      const { image, name } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image data" });
      }

      if (useCloudinary) {
        // Use resource_type: "auto" to handle non-image files (PDF, PPTX, etc.)
        const result = await cloudinary.uploader.upload(image, {
          folder: "gymni-mate",
          resource_type: "auto",
          public_id: name ? path.parse(name).name : undefined
        });
        return res.json({ url: result.secure_url });
      }

      // Local Base64 Save
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `${Date.now()}-${name ? path.parse(name).name : 'upload'}.png`;
      const filePath = path.join(uploadsDir, fileName);
      
      fs.writeFileSync(filePath, buffer);

      const url = `/uploads/${fileName}`;
      res.json({ url });
    } catch (error: any) {
      console.error("Base64 upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

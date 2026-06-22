const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_ROOT = process.env.DATA_ROOT
  ? path.resolve(process.env.DATA_ROOT)
  : path.join(ROOT, "data");
const UPLOAD_ROOT = path.join(DATA_ROOT, "uploads");
const BUILD_ROOT = path.join(DATA_ROOT, "build-web");
const BUILD_SCRIPT = path.join(ROOT, "src", "buildPodcast.js");
const DEFAULT_ASSET_DIR = path.join(DATA_ROOT, "default-assets");
const DEFAULT_ASSET_META_PATH = path.join(DEFAULT_ASSET_DIR, "defaults.json");
const DEFAULT_FFMPEG_PATHS = [
  "/usr/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "C:\\Users\\Public\\AppData\\Roaming\\Flixmate\\ffmpeg.exe",
  "C:\\Program Files\\Wondershare\\Wondershare UniConverter 16\\ffmpeg.exe",
  "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
  "C:\\ffmpeg\\bin\\ffmpeg.exe"
];

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
fs.mkdirSync(BUILD_ROOT, { recursive: true });
fs.mkdirSync(DEFAULT_ASSET_DIR, { recursive: true });

const DEFAULT_ASSET_SLOTS = {
  bgm: "bgm-audio",
  jingle: "jingle-audio",
  introImage: "intro-image",
  jingleImage: "jingle-image"
};
const jobs = new Map();

function findFfmpeg() {
  if (process.env.PODCAST_FFMPEG_PATH && fs.existsSync(process.env.PODCAST_FFMPEG_PATH)) {
    return process.env.PODCAST_FFMPEG_PATH;
  }

  for (const candidate of DEFAULT_FFMPEG_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function readDefaultAssetMeta() {
  if (!fs.existsSync(DEFAULT_ASSET_META_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(DEFAULT_ASSET_META_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeDefaultAssetMeta(meta) {
  fs.writeFileSync(DEFAULT_ASSET_META_PATH, JSON.stringify(meta, null, 2), "utf8");
}

function removeExistingDefaultAssetFiles(slotKey) {
  const slotPrefix = DEFAULT_ASSET_SLOTS[slotKey];
  for (const entry of fs.readdirSync(DEFAULT_ASSET_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name === path.basename(DEFAULT_ASSET_META_PATH)) {
      continue;
    }
    if (entry.name.startsWith(`${slotPrefix}.`)) {
      fs.unlinkSync(path.join(DEFAULT_ASSET_DIR, entry.name));
    }
  }
}

function findDefaultAssetPath(slotKey) {
  const meta = readDefaultAssetMeta();
  const metaEntry = meta[slotKey];
  if (metaEntry && metaEntry.storedName) {
    const preferred = path.join(DEFAULT_ASSET_DIR, metaEntry.storedName);
    if (fs.existsSync(preferred)) {
      return preferred;
    }
  }

  const slotPrefix = DEFAULT_ASSET_SLOTS[slotKey];
  const matches = fs.readdirSync(DEFAULT_ASSET_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${slotPrefix}.`))
    .map((entry) => entry.name)
    .sort();

  if (matches.length === 0) {
    return "";
  }
  return path.join(DEFAULT_ASSET_DIR, matches[0]);
}

function getDefaultAssetInfo() {
  const meta = readDefaultAssetMeta();
  const info = {};

  for (const [key] of Object.entries(DEFAULT_ASSET_SLOTS)) {
    const assetPath = findDefaultAssetPath(key);
    const metaEntry = meta[key] || {};
    info[key] = {
      available: Boolean(assetPath && fs.existsSync(assetPath)),
      fileName: assetPath ? path.basename(assetPath) : "",
      displayName: metaEntry.originalName || (assetPath ? path.basename(assetPath) : ""),
      updatedAt: metaEntry.updatedAt || ""
    };
  }
  return info;
}

function saveDefaultAsset(slotKey, uploadItem) {
  if (!uploadItem || !uploadItem.content || uploadItem.content.length === 0) {
    return false;
  }

  const originalName = uploadItem.fileName || "upload.bin";
  const ext = path.extname(originalName) || ".bin";
  const storedName = `${DEFAULT_ASSET_SLOTS[slotKey]}${ext.toLowerCase()}`;
  removeExistingDefaultAssetFiles(slotKey);
  fs.writeFileSync(path.join(DEFAULT_ASSET_DIR, storedName), uploadItem.content);

  const meta = readDefaultAssetMeta();
  meta[slotKey] = {
    originalName: originalName,
    storedName,
    updatedAt: new Date().toISOString()
  };
  writeDefaultAssetMeta(meta);
  return true;
}

function bufferSplit(buffer, separator) {
  const chunks = [];
  let offset = 0;
  while (true) {
    const index = buffer.indexOf(separator, offset);
    if (index === -1) {
      chunks.push(buffer.subarray(offset));
      return chunks;
    }
    chunks.push(buffer.subarray(offset, index));
    offset = index + separator.length;
  }
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    throw new Error("Upload boundary was not found.");
  }

  const boundary = match[1] || match[2];
  const body = await readRequestBody(req);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = bufferSplit(body, boundaryBuffer).slice(1, -1);
  const fields = {};
  const files = {};

  for (let part of parts) {
    if (part.subarray(0, 2).equals(Buffer.from("\r\n"))) {
      part = part.subarray(2);
    }
    if (part.subarray(part.length - 2).equals(Buffer.from("\r\n"))) {
      part = part.subarray(0, part.length - 2);
    }

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      continue;
    }

    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const content = part.subarray(headerEnd + 4);
    const nameMatch = headerText.match(/name="([^"]+)"/i);
    if (!nameMatch) {
      continue;
    }

    const fieldName = nameMatch[1];
    const fileNameMatch = headerText.match(/filename="([^"]*)"/i);
    if (fileNameMatch) {
      files[fieldName] = {
        fileName: path.basename(fileNameMatch[1]),
        content
      };
    } else {
      fields[fieldName] = content.toString("utf8");
    }
  }

  return { fields, files };
}

function saveUpload(folder, slotName, item) {
  const originalName = item.fileName || "upload.bin";
  const ext = path.extname(originalName) || ".bin";
  const safeName = sanitizeFileName(`${slotName}${ext}`);
  const fullPath = path.join(folder, safeName);
  fs.writeFileSync(fullPath, item.content);
  return fullPath;
}

function resolveAssetPath(folder, slotName, uploadItem, defaultPath) {
  if (uploadItem && uploadItem.content && uploadItem.content.length > 0) {
    return saveUpload(folder, slotName, uploadItem);
  }
  if (defaultPath && fs.existsSync(defaultPath)) {
    return defaultPath;
  }
  return "";
}

function buildConfig(sessionDir, uploadDir, fields, files, ffmpegPath) {
  const outputName = (fields.outputName || "podcast_episode.mp4").trim() || "podcast_episode.mp4";
  let insertTimes = [
    (fields.insert1 || "00:03:13").trim(),
    (fields.insert2 || "00:11:29").trim()
  ];

  if (fields.noJingles === "1") {
    insertTimes = [];
  }

  if (fields.insertTimesJson) {
    try {
      const parsed = JSON.parse(fields.insertTimesJson);
      if (Array.isArray(parsed)) {
        insertTimes = parsed
          .map((value) => String(value || "").trim())
          .filter(Boolean);
      }
    } catch (error) {
      throw new Error("ジングル位置の読み取りに失敗しました。");
    }
  }

  return {
    ffmpegPath,
    outputDir: path.join(sessionDir, "output"),
    video: {
      mainVideo: saveUpload(uploadDir, "main-video", files.mainVideo),
      introImage: resolveAssetPath(uploadDir, "intro-image", files.introImage, findDefaultAssetPath("introImage")),
      jingleImage: resolveAssetPath(uploadDir, "jingle-image", files.jingleImage, findDefaultAssetPath("jingleImage"))
    },
    audio: {
      bgm: resolveAssetPath(uploadDir, "bgm-audio", files.bgm, findDefaultAssetPath("bgm")),
      jingle: resolveAssetPath(uploadDir, "jingle-audio", files.jingle, findDefaultAssetPath("jingle")),
      jingleGeneratorScript: "",
      pythonCommand: "python"
    },
    timing: {
      introDurationSec: 8,
      jingleDurationSec: 4,
      insertTimes
    },
    mix: {
      introBgmVolume: 1.0,
      mainBgmVolume: 0.1,
      jingleVolume: 0.4,
      introFadeInSec: 2
    },
    output: {
      width: 1920,
      height: 1080,
      videoCodec: "libx264",
      videoPreset: "veryfast",
      videoThreads: 2,
      audioCodec: "aac",
      audioBitrate: "192k",
      pixelFormat: "yuv420p",
      fileName: outputName
    }
  };
}

function runBuild(configPath, workingDirectory) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BUILD_SCRIPT, "--config", configPath], {
      cwd: workingDirectory,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function createJob() {
  const id = crypto.randomUUID();
  const job = {
    id,
    status: "queued",
    message: "作成の開始を待っています。",
    log: "",
    outputPath: "",
    videoUrl: "",
    createdAt: Date.now()
  };
  jobs.set(id, job);
  return job;
}

function appendJobLog(job, text) {
  if (!text) {
    return;
  }
  job.log += text.toString();
  if (job.log.length > 200000) {
    job.log = job.log.slice(-200000);
  }
}

function startBuildJob(job, configPath, workingDirectory, config, sessionId) {
  job.status = "running";
  job.message = "動画を作成しています。長めの動画は数分かかることがあります。";

  const child = spawn(process.execPath, [BUILD_SCRIPT, "--config", configPath], {
    cwd: workingDirectory,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    appendJobLog(job, chunk);
  });

  child.stderr.on("data", (chunk) => {
    appendJobLog(job, chunk);
  });

  child.on("error", (error) => {
    job.status = "failed";
    job.message = "作成を開始できませんでした。";
    appendJobLog(job, `\n${error.message}\n`);
  });

  child.on("close", (code) => {
    if (code !== 0) {
      job.status = "failed";
      job.message = "作成に失敗しました。詳細を確認してください。";
      return;
    }

    const finalPath = path.join(config.outputDir, config.output.fileName);
    job.status = "done";
    job.message = "作成が完了しました。";
    job.outputPath = finalPath;
    job.videoUrl = `/files/${sessionId}/${encodeURIComponent(config.output.fileName)}`;
  });
}

function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  };

  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, {
        ok: true,
        ffmpegFound: Boolean(findFfmpeg()),
        defaults: getDefaultAssetInfo()
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/build") {
      const ffmpegPath = findFfmpeg();
      if (!ffmpegPath) {
        sendJson(res, 500, { ok: false, error: "このPCで動画変換ソフトが見つかりませんでした。" });
        return;
      }

      const { fields, files } = await parseMultipart(req);
      const required = ["mainVideo"];
      for (const key of required) {
        if (!files[key] || !files[key].content || files[key].content.length === 0) {
          sendJson(res, 400, { ok: false, error: `必要なファイルが足りません: ${key}` });
          return;
        }
      }

      const sessionId = crypto.randomUUID();
      const sessionDir = path.join(BUILD_ROOT, sessionId);
      const uploadDir = path.join(sessionDir, "uploads");
      fs.mkdirSync(uploadDir, { recursive: true });

      const config = buildConfig(sessionDir, uploadDir, fields, files, ffmpegPath);
      fs.mkdirSync(config.outputDir, { recursive: true });
      const configPath = path.join(sessionDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

      sendJson(res, 200, {
        ok: true,
        jobId: sessionId,
        message: "作成を開始しました。このまま画面を開いたままお待ちください。"
      });
      const job = createJob();
      jobs.delete(job.id);
      job.id = sessionId;
      jobs.set(sessionId, job);
      startBuildJob(job, configPath, ROOT, config, sessionId);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/build-status") {
      const jobId = url.searchParams.get("id") || "";
      const job = jobs.get(jobId);
      if (!job) {
        sendJson(res, 404, { ok: false, error: "作成情報が見つかりませんでした。" });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        jobId: job.id,
        status: job.status,
        message: job.message,
        log: job.log.trim(),
        outputPath: job.outputPath,
        videoUrl: job.videoUrl
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/default-assets") {
      const { files } = await parseMultipart(req);
      const updated = [];

      if (saveDefaultAsset("bgm", files.bgm)) {
        updated.push("bgm");
      }
      if (saveDefaultAsset("jingle", files.jingle)) {
        updated.push("jingle");
      }
      if (saveDefaultAsset("introImage", files.introImage)) {
        updated.push("introImage");
      }
      if (saveDefaultAsset("jingleImage", files.jingleImage)) {
        updated.push("jingleImage");
      }

      sendJson(res, 200, {
        ok: true,
        updated,
        defaults: getDefaultAssetInfo()
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/files/")) {
      const pieces = url.pathname.split("/").filter(Boolean);
      const sessionId = pieces[1];
      const fileName = decodeURIComponent(pieces.slice(2).join("/"));
      const target = path.join(BUILD_ROOT, sessionId, "output", fileName);
      serveStaticFile(res, target);
      return;
    }

    const publicPath = url.pathname === "/"
      ? path.join(PUBLIC_DIR, "index.html")
      : path.join(PUBLIC_DIR, url.pathname.replace(/^\/+/, ""));
    serveStaticFile(res, publicPath);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Video Podcast Builder running at http://${HOST}:${PORT}`);
});

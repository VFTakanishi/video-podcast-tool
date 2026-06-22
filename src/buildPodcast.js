#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--config") {
      args.config = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function toSeconds(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    throw new Error(`Unsupported time value: ${value}`);
  }
  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) {
    throw new Error(`Invalid time string: ${value}`);
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  throw new Error(`Invalid time string: ${value}`);
}

function secondsToTimestamp(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const whole = Math.floor(seconds);
  const fraction = seconds - whole;
  const ms = Math.round(fraction * 1000);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(whole).padStart(2, "0");
  if (ms === 0) {
    return `${hh}:${mm}:${ss}`;
  }

  return `${hh}:${mm}:${ss}.${String(ms).padStart(3, "0")}`;
}

function ensureFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadConfig(configPath) {
  const absolute = path.resolve(configPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Config file not found: ${absolute}`);
  }
  const raw = fs.readFileSync(absolute, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  return { absolute, dir: path.dirname(absolute), data: parsed };
}

function resolvePath(baseDir, maybePath) {
  if (!maybePath) {
    return maybePath;
  }
  if (path.isAbsolute(maybePath)) {
    return maybePath;
  }
  return path.resolve(baseDir, maybePath);
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function toFfmpegListPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function runCommand(command, args, options = {}) {
  const label = options.label || path.basename(command);
  return new Promise((resolve, reject) => {
    console.log(`\n[run] ${label}`);
    console.log(`${shellQuote(command)} ${args.map(shellQuote).join(" ")}`);

    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (!options.quiet) {
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (!options.quiet) {
        process.stderr.write(text);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.acceptNonZeroExit) {
        resolve({ code, stdout, stderr });
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

async function probeDurationSeconds(ffmpegPath, inputFile) {
  const result = await runCommand(
    ffmpegPath,
    ["-i", inputFile],
    { label: `probe ${path.basename(inputFile)}`, acceptNonZeroExit: true, quiet: true }
  );

  const combined = `${result.stdout}\n${result.stderr}`;
  const match = combined.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) {
    throw new Error(`Could not determine duration for: ${inputFile}`);
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function ensureJingleAudio(config) {
  const jinglePath = config.audio.jingle;
  if (fs.existsSync(jinglePath)) {
    return;
  }

  const scriptPath = config.audio.jingleGeneratorScript;
  const pythonCommand = config.audio.pythonCommand || "python";
  if (!scriptPath) {
    throw new Error(`Jingle audio not found and no generator script configured: ${jinglePath}`);
  }
  ensureFile(scriptPath, "Jingle generator script");

  console.log(`Jingle audio missing. Attempting regeneration via ${scriptPath}`);
  await runCommand(pythonCommand, [scriptPath], { label: "generate jingle audio" });
  ensureFile(jinglePath, "Regenerated jingle audio");
}

function buildScalePadFilter(width, height) {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`;
}

async function createIntro(config, paths) {
  const { ffmpegPath } = paths;
  const duration = config.timing.introDurationSec;
  const scalePad = buildScalePadFilter(config.output.width, config.output.height);
  const output = path.join(paths.outputDir, "01_intro.mp4");

  await runCommand(ffmpegPath, [
    "-y",
    "-loop", "1",
    "-i", config.video.introImage,
    "-stream_loop", "-1",
    "-i", config.audio.bgm,
    "-t", String(duration),
    "-filter_complex", `[1:a]volume=${config.mix.introBgmVolume},afade=t=in:st=0:d=${config.mix.introFadeInSec},aformat=sample_rates=48000:channel_layouts=stereo[a]`,
    "-map", "0:v:0",
    "-map", "[a]",
    "-vf", scalePad,
    "-c:v", config.output.videoCodec,
    "-c:a", config.output.audioCodec,
    "-b:a", config.output.audioBitrate,
    "-pix_fmt", config.output.pixelFormat,
    "-r", "30",
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
    output
  ], { label: "create intro" });

  return output;
}

async function createMainWithBgm(config, paths) {
  const { ffmpegPath } = paths;
  const output = path.join(paths.outputDir, "02_main_with_bgm.mp4");

  await runCommand(ffmpegPath, [
    "-y",
    "-i", config.video.mainVideo,
    "-stream_loop", "-1",
    "-i", config.audio.bgm,
    "-filter_complex",
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo[main];[1:a]volume=${config.mix.mainBgmVolume},aformat=sample_rates=48000:channel_layouts=stereo[bgm];[main][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", config.output.videoCodec,
    "-c:a", config.output.audioCodec,
    "-b:a", config.output.audioBitrate,
    "-pix_fmt", config.output.pixelFormat,
    "-r", "30",
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
    output
  ], { label: "mix bgm into main video" });

  return output;
}

async function createJingle(config, paths) {
  const { ffmpegPath } = paths;
  const duration = config.timing.jingleDurationSec;
  const scalePad = buildScalePadFilter(config.output.width, config.output.height);
  const output = path.join(paths.outputDir, "03_jingle.mp4");

  await runCommand(ffmpegPath, [
    "-y",
    "-loop", "1",
    "-i", config.video.jingleImage,
    "-i", config.audio.jingle,
    "-t", String(duration),
    "-filter_complex", `[1:a]volume=${config.mix.jingleVolume},aformat=sample_rates=48000:channel_layouts=stereo[a]`,
    "-map", "0:v:0",
    "-map", "[a]",
    "-vf", scalePad,
    "-c:v", config.output.videoCodec,
    "-c:a", config.output.audioCodec,
    "-b:a", config.output.audioBitrate,
    "-pix_fmt", config.output.pixelFormat,
    "-r", "30",
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
    output
  ], { label: "create jingle clip" });

  return output;
}

async function splitMainVideo(config, paths, mainVideoPath, mainDurationSec) {
  const { ffmpegPath } = paths;
  const splitPoints = config.timing.insertTimes.map(toSeconds).sort((a, b) => a - b);
  if (splitPoints.some((value) => value <= 0 || value >= mainDurationSec)) {
    throw new Error(`Split points must be inside the main video duration (${mainDurationSec}s).`);
  }

  const boundaries = [0, ...splitPoints, mainDurationSec];
  const segmentPaths = [];

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const duration = Math.max(0, end - start);
    const outFile = path.join(paths.outputDir, `segment_${String(i + 1).padStart(2, "0")}.mp4`);
    segmentPaths.push(outFile);

    await runCommand(ffmpegPath, [
      "-y",
      "-i", mainVideoPath,
      "-ss", secondsToTimestamp(start),
      "-t", secondsToTimestamp(duration),
      "-c:v", config.output.videoCodec,
      "-c:a", config.output.audioCodec,
      "-b:a", config.output.audioBitrate,
      "-pix_fmt", config.output.pixelFormat,
      "-r", "30",
      "-ar", "48000",
      "-ac", "2",
      outFile
    ], { label: `split segment ${i + 1}` });
  }

  return segmentPaths;
}

async function concatClips(config, paths, clips) {
  const { ffmpegPath } = paths;
  const finalOutput = path.join(paths.outputDir, config.output.fileName);
  const filterInputs = clips.map((_, index) => `[${index}:v:0][${index}:a:0]`).join("");
  const filterComplex = `${filterInputs}concat=n=${clips.length}:v=1:a=1[v][a]`;
  const args = ["-y"];

  for (const clipPath of clips) {
    args.push("-i", clipPath);
  }

  args.push(
    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", config.output.videoCodec,
    "-c:a", config.output.audioCodec,
    "-b:a", config.output.audioBitrate,
    "-pix_fmt", config.output.pixelFormat,
    "-r", "30",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    finalOutput
  );

  await runCommand(ffmpegPath, args, { label: "concat final episode" });

  return finalOutput;
}

async function main() {
  const args = parseArgs(process.argv);
  const configArg = args.config || "config.json";
  const loaded = loadConfig(configArg);
  const config = loaded.data;

  config.ffmpegPath = resolvePath(loaded.dir, config.ffmpegPath);
  config.outputDir = resolvePath(loaded.dir, config.outputDir || "./build");
  config.video.mainVideo = resolvePath(loaded.dir, config.video.mainVideo);
  config.video.introImage = resolvePath(loaded.dir, config.video.introImage);
  config.video.jingleImage = resolvePath(loaded.dir, config.video.jingleImage);
  config.audio.bgm = resolvePath(loaded.dir, config.audio.bgm);
  config.audio.jingle = resolvePath(loaded.dir, config.audio.jingle);
  config.audio.jingleGeneratorScript = resolvePath(loaded.dir, config.audio.jingleGeneratorScript);

  ensureFile(config.ffmpegPath, "ffmpeg");
  ensureFile(config.video.mainVideo, "Main video");
  ensureFile(config.video.introImage, "Intro image");
  ensureFile(config.video.jingleImage, "Jingle image");
  ensureFile(config.audio.bgm, "BGM audio");
  mkdirp(config.outputDir);

  await ensureJingleAudio(config);

  const paths = {
    ffmpegPath: config.ffmpegPath,
    outputDir: config.outputDir
  };
  const useJingles = Array.isArray(config.timing.insertTimes) && config.timing.insertTimes.length > 0;

  const mainDurationSec = await probeDurationSeconds(config.ffmpegPath, config.video.mainVideo);
  const introPath = await createIntro(config, paths);
  const mainWithBgmPath = await createMainWithBgm(config, paths);
  const segments = await splitMainVideo(config, paths, mainWithBgmPath, mainDurationSec);
  const jinglePath = useJingles ? await createJingle(config, paths) : "";

  const orderedClips = [];
  orderedClips.push(introPath);
  for (let i = 0; i < segments.length; i += 1) {
    orderedClips.push(segments[i]);
    if (useJingles && i < segments.length - 1) {
      orderedClips.push(jinglePath);
    }
  }

  const finalOutput = await concatClips(config, paths, orderedClips);
  console.log(`\nDone: ${finalOutput}`);
}

main().catch((error) => {
  console.error(`\nBuild failed: ${error.message}`);
  process.exitCode = 1;
});

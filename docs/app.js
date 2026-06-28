const statusBadge = document.getElementById("statusBadge");
const form = document.getElementById("buildForm");
const buildButton = document.getElementById("buildButton");
const result = document.getElementById("result");
const resultMessage = document.getElementById("resultMessage");
const resultLinkWrap = document.getElementById("resultLinkWrap");
const resultLink = document.getElementById("resultLink");
const previewWrap = document.getElementById("previewWrap");
const previewVideo = document.getElementById("previewVideo");
const logBox = document.getElementById("logBox");
const logDetails = document.getElementById("logDetails");
const progressWrap = document.getElementById("progressWrap");
const progressTitle = document.getElementById("progressTitle");
const progressFill = document.getElementById("progressFill");
const progressNote = document.getElementById("progressNote");
const presetForm = document.getElementById("presetForm");
const presetButton = document.getElementById("presetButton");
const presetBadge = document.getElementById("presetBadge");
const presetNote = document.getElementById("presetNote");
const bgmHint = document.getElementById("bgmHint");
const introHint = document.getElementById("introHint");
const jingleImageHint = document.getElementById("jingleImageHint");
const jingleHint = document.getElementById("jingleHint");
const currentBgm = document.getElementById("currentBgm");
const currentBgmMeta = document.getElementById("currentBgmMeta");
const currentJingle = document.getElementById("currentJingle");
const currentJingleMeta = document.getElementById("currentJingleMeta");
const currentIntro = document.getElementById("currentIntro");
const currentIntroMeta = document.getElementById("currentIntroMeta");
const currentJingleImage = document.getElementById("currentJingleImage");
const currentJingleImageMeta = document.getElementById("currentJingleImageMeta");
const disableJingles = document.getElementById("disableJingles");
const insertTimesList = document.getElementById("insertTimesList");
const addInsertTimeButton = document.getElementById("addInsertTimeButton");

const DEFAULT_STAGE = { title: "準備中...", percent: 0 };
const DB_NAME = "video-podcast-tool-free";
const STORE_NAME = "assets";
const ASSET_KEYS = ["bgm", "jingle", "introImage", "jingleImage"];

let ffmpegLibPromise = null;
let ffmpegState = null;
let buildCounter = 0;
let outputObjectUrl = "";
let insertTimeCount = 0;

function setStatus(text) {
  statusBadge.textContent = text;
}

function appendLog(text) {
  logBox.textContent += `${text}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

function setProgress(title, percent, note) {
  progressWrap.classList.remove("hidden");
  progressTitle.textContent = title;
  progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (note) {
    progressNote.textContent = note;
  }
}

function showFailure(message) {
  result.classList.remove("hidden");
  resultMessage.textContent = message;
  logDetails.open = true;
}

function sanitizeFileName(name) {
  const safe = String(name || "podcast_episode.mp4").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
  return safe.toLowerCase().endsWith(".mp4") ? safe : `${safe || "podcast_episode"}.mp4`;
}

function parseTimeToSeconds(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  const parts = raw.split(":").map(Number);
  if (parts.some((item) => Number.isNaN(item))) {
    throw new Error(`時間指定を読み取れません: ${value}`);
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  throw new Error(`時間指定を読み取れません: ${value}`);
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

function buildScalePadFilter(width, height) {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`;
}

function formatDateString(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("ja-JP");
}

function applyCurrentPreset(targetName, targetMeta, asset) {
  if (!asset) {
    targetName.textContent = "未設定";
    targetMeta.textContent = "";
    return;
  }
  targetName.textContent = asset.name || "保存済み素材";
  targetMeta.textContent = asset.updatedAt ? `保存日時: ${formatDateString(asset.updatedAt)}` : "";
}

function applyDefaultHints(defaults) {
  const names = [];
  const bgm = defaults.bgm || null;
  const jingle = defaults.jingle || null;
  const introImage = defaults.introImage || null;
  const jingleImage = defaults.jingleImage || null;

  bgmHint.textContent = bgm ? `標準BGM: ${bgm.name}` : "選ばない場合は保存済みの標準BGMを使います。";
  introHint.textContent = introImage ? `標準イントロ画像: ${introImage.name}` : "選ばない場合は保存済みの標準画像を使います。";
  jingleHint.textContent = jingle ? `標準ジングル音源: ${jingle.name}` : "選ばない場合は保存済みの標準ジングルを使います。";
  jingleImageHint.textContent = jingleImage ? `標準ジングル画像: ${jingleImage.name}` : "選ばない場合は保存済みの標準画像を使います。";

  applyCurrentPreset(currentBgm, currentBgmMeta, bgm);
  applyCurrentPreset(currentJingle, currentJingleMeta, jingle);
  applyCurrentPreset(currentIntro, currentIntroMeta, introImage);
  applyCurrentPreset(currentJingleImage, currentJingleImageMeta, jingleImage);

  for (const asset of [bgm, jingle, introImage, jingleImage]) {
    if (asset?.name) {
      names.push(asset.name);
    }
  }
  presetBadge.textContent = names.length ? "保存済み" : "未設定";
}

function syncJingleInputsState() {
  const disabled = disableJingles.checked;
  document.getElementById("jingle").disabled = disabled;
  document.getElementById("jingleImage").disabled = disabled;
  insertTimesList.querySelectorAll("input").forEach((input) => {
    input.disabled = disabled;
  });
  addInsertTimeButton.disabled = disabled;
}

function createInsertTimeRow(value = "") {
  insertTimeCount += 1;
  const row = document.createElement("div");
  row.className = "time-row";

  const field = document.createElement("div");
  field.className = "field";

  const label = document.createElement("label");
  label.textContent = `ジングル位置 ${insertTimeCount}`;

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "例: 00:03:13";

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = "00:03:13";
  input.className = "insert-time-input";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ghost-button remove";
  removeButton.textContent = "削除";
  removeButton.addEventListener("click", () => {
    row.remove();
  });

  field.appendChild(label);
  field.appendChild(hint);
  field.appendChild(input);
  row.appendChild(field);
  row.appendChild(removeButton);
  insertTimesList.appendChild(row);
}

function getInsertTimes() {
  return Array.from(insertTimesList.querySelectorAll(".insert-time-input"))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveDefaultAsset(key, file) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
    const payload = {
      key,
      name: file.name,
      type: file.type,
      updatedAt: new Date().toISOString(),
      blob: file
    };
    transaction.objectStore(STORE_NAME).put(payload);
  });
}

async function loadDefaultAsset(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    transaction.onerror = () => reject(transaction.error);
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function loadAllDefaults() {
  const entries = await Promise.all(ASSET_KEYS.map((key) => loadDefaultAsset(key)));
  return {
    bgm: entries[0],
    jingle: entries[1],
    introImage: entries[2],
    jingleImage: entries[3]
  };
}

async function getDurationSeconds(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("本編動画の長さを読み取れませんでした。"));
      video.src = objectUrl;
    });
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = objectUrl;
    return await new Promise((resolve, reject) => {
      probe.onloadedmetadata = () => resolve(probe.duration);
      probe.onerror = () => reject(new Error("本編動画の長さを読み取れませんでした。"));
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function pickAsset(runFile, defaultAsset, requiredLabel) {
  if (runFile) {
    return runFile;
  }
  if (defaultAsset?.blob) {
    return new File([defaultAsset.blob], defaultAsset.name || `${requiredLabel}.bin`, {
      type: defaultAsset.type || defaultAsset.blob.type || "application/octet-stream"
    });
  }
  throw new Error(`${requiredLabel} がありません。`);
}

async function loadFfmpegLib() {
  if (!ffmpegLibPromise) {
    ffmpegLibPromise = Promise.all([
      import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"),
      import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js")
    ]);
  }
  return ffmpegLibPromise;
}

async function ensureFfmpeg() {
  if (ffmpegState?.ready) {
    return ffmpegState;
  }

  setStatus("変換エンジンを読み込み中...");
  setProgress("変換エンジンを読み込み中...", 3, "初回だけ少し時間がかかります。");

  const [{ FFmpeg }, { toBlobURL }] = await loadFfmpegLib();
  const ffmpeg = new FFmpeg();
  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
  let stage = DEFAULT_STAGE;

  ffmpeg.on("log", ({ message }) => {
    appendLog(message);
  });

  ffmpeg.on("progress", ({ progress }) => {
    if (!stage || typeof progress !== "number") {
      return;
    }
    const percent = stage.start + (stage.end - stage.start) * progress;
    setProgress(stage.title, percent, stage.note);
  });

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
  });

  ffmpegState = {
    ready: true,
    ffmpeg,
    setStage(nextStage) {
      stage = nextStage;
      setProgress(nextStage.title, nextStage.start, nextStage.note);
    }
  };

  setStatus("準備できました");
  return ffmpegState;
}

async function writeBlob(ffmpeg, path, blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  await ffmpeg.writeFile(path, buffer);
}

async function execStage(runtime, stage, args) {
  runtime.setStage(stage);
  appendLog(`[run] ${stage.title}`);
  appendLog(args.join(" "));
  await runtime.ffmpeg.exec(args);
}

async function buildPodcast(files, defaults) {
  const runtime = await ensureFfmpeg();
  const runId = `job_${Date.now()}_${++buildCounter}`;
  const scalePad = buildScalePadFilter(1280, 720);
  const outputName = sanitizeFileName(document.getElementById("outputName").value);
  const mainVideo = files.mainVideo;
  const bgm = await pickAsset(files.bgm, defaults.bgm, "BGM");
  const introImage = await pickAsset(files.introImage, defaults.introImage, "イントロ画像");
  const useJingles = !disableJingles.checked;
  const jingle = useJingles ? await pickAsset(files.jingle, defaults.jingle, "ジングル音源") : null;
  const jingleImage = useJingles ? await pickAsset(files.jingleImage, defaults.jingleImage, "ジングル画像") : null;
  const insertTimes = useJingles ? getInsertTimes().map(parseTimeToSeconds) : [];
  const mainDuration = await getDurationSeconds(mainVideo);

  if (useJingles && insertTimes.some((item) => item <= 0 || item >= mainDuration)) {
    throw new Error("ジングル位置が動画の長さを超えています。");
  }

  const mainPath = `${runId}_main.mp4`;
  const bgmPath = `${runId}_bgm`;
  const introImagePath = `${runId}_intro`;
  const introOut = `${runId}_01_intro.mp4`;
  const mainOut = `${runId}_02_main_with_bgm.mp4`;
  const jinglePath = `${runId}_jingle`;
  const jingleImagePath = `${runId}_jingle_image`;
  const jingleOut = `${runId}_03_jingle.mp4`;
  const concatListPath = `${runId}_concat.txt`;
  const finalPath = `${runId}_${outputName}`;

  await writeBlob(runtime.ffmpeg, mainPath, mainVideo);
  await writeBlob(runtime.ffmpeg, bgmPath, bgm);
  await writeBlob(runtime.ffmpeg, introImagePath, introImage);
  if (useJingles) {
    await writeBlob(runtime.ffmpeg, jinglePath, jingle);
    await writeBlob(runtime.ffmpeg, jingleImagePath, jingleImage);
  }

  await execStage(runtime, {
    title: "イントロ動画を作成中...",
    start: 6,
    end: 16,
    note: "イントロ画像にBGMを重ねています。"
  }, [
    "-y",
    "-loop", "1",
    "-i", introImagePath,
    "-stream_loop", "-1",
    "-i", bgmPath,
    "-t", "8",
    "-filter_complex", "[1:a]volume=1,afade=t=in:st=0:d=2,aformat=sample_rates=48000:channel_layouts=stereo[a]",
    "-map", "0:v:0",
    "-map", "[a]",
    "-vf", scalePad,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-threads", "1",
    "-c:a", "aac",
    "-b:a", "128k",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
    introOut
  ]);

  await execStage(runtime, {
    title: "本編にBGMを重ねています...",
    start: 16,
    end: 58,
    note: "本編音声とBGMを1本にまとめています。"
  }, [
    "-y",
    "-i", mainPath,
    "-stream_loop", "-1",
    "-i", bgmPath,
    "-filter_complex",
    "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[main];[1:a]volume=0.1,aformat=sample_rates=48000:channel_layouts=stereo[bgm];[main][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]",
    "-map", "0:v:0",
    "-map", "[aout]",
    "-vf", scalePad,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-threads", "1",
    "-c:a", "aac",
    "-b:a", "128k",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-ar", "48000",
    "-ac", "2",
    "-shortest",
    mainOut
  ]);

  const clips = [introOut];

  if (useJingles) {
    await execStage(runtime, {
      title: "ジングルを作成しています...",
      start: 58,
      end: 68,
      note: "ジングル画像と音をまとめています。"
    }, [
      "-y",
      "-loop", "1",
      "-i", jingleImagePath,
      "-i", jinglePath,
      "-t", "4",
      "-filter_complex", "[1:a]volume=0.4,aformat=sample_rates=48000:channel_layouts=stereo[a]",
      "-map", "0:v:0",
      "-map", "[a]",
      "-vf", scalePad,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "1",
      "-c:a", "aac",
      "-b:a", "128k",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-ar", "48000",
      "-ac", "2",
      "-shortest",
      jingleOut
    ]);

    const boundaries = [0, ...insertTimes.sort((a, b) => a - b), mainDuration];
    const splitSpan = Math.max(1, boundaries.length - 1);

    for (let i = 0; i < boundaries.length - 1; i += 1) {
      const segmentPath = `${runId}_segment_${String(i + 1).padStart(2, "0")}.mp4`;
      const start = boundaries[i];
      const duration = Math.max(0, boundaries[i + 1] - boundaries[i]);
      await execStage(runtime, {
        title: `本編を分割中... (${i + 1}/${splitSpan})`,
        start: 68 + (20 / splitSpan) * i,
        end: 68 + (20 / splitSpan) * (i + 1),
        note: "ジングル位置で本編を分けています。"
      }, [
        "-y",
        "-i", mainOut,
        "-ss", secondsToTimestamp(start),
        "-t", secondsToTimestamp(duration),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-threads", "1",
        "-c:a", "aac",
        "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-ar", "48000",
        "-ac", "2",
        segmentPath
      ]);
      clips.push(segmentPath);
      if (i < boundaries.length - 2) {
        clips.push(jingleOut);
      }
    }
  } else {
    clips.push(mainOut);
  }

  const concatBody = clips.map((clip) => `file '${clip}'`).join("\n");
  await runtime.ffmpeg.writeFile(concatListPath, new TextEncoder().encode(`${concatBody}\n`));

  await execStage(runtime, {
    title: "最後に1本へまとめています...",
    start: 90,
    end: 100,
    note: "完成MP4を仕上げています。"
  }, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    "-c", "copy",
    "-movflags", "+faststart",
    finalPath
  ]);

  return { data: await runtime.ffmpeg.readFile(finalPath), outputName };
}

async function refreshDefaults() {
  try {
    const defaults = await loadAllDefaults();
    applyDefaultHints(defaults);
  } catch (error) {
    applyDefaultHints({});
    presetNote.textContent = error.message;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.classList.remove("hidden");
  resultLinkWrap.classList.add("hidden");
  previewWrap.classList.add("hidden");
  logDetails.open = false;
  logBox.textContent = "";
  resultMessage.textContent = "作成を始めます。";
  progressWrap.classList.remove("hidden");
  buildButton.disabled = true;
  buildButton.textContent = "作成中...";
  setStatus("作成中...");

  try {
    if (outputObjectUrl) {
      URL.revokeObjectURL(outputObjectUrl);
      outputObjectUrl = "";
    }

    const defaults = await loadAllDefaults();
    const mainVideo = document.getElementById("mainVideo").files[0];
    if (!mainVideo) {
      throw new Error("本編動画を選んでください。");
    }

    const files = {
      mainVideo,
      bgm: document.getElementById("bgm").files[0] || null,
      introImage: document.getElementById("introImage").files[0] || null,
      jingle: document.getElementById("jingle").files[0] || null,
      jingleImage: document.getElementById("jingleImage").files[0] || null
    };

    const { data, outputName } = await buildPodcast(files, defaults);
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    outputObjectUrl = URL.createObjectURL(blob);

    resultMessage.textContent = "作成が完了しました。";
    resultLink.href = outputObjectUrl;
    resultLink.download = outputName;
    resultLinkWrap.classList.remove("hidden");
    previewVideo.src = outputObjectUrl;
    previewWrap.classList.remove("hidden");
    setProgress("完成しました", 100, "必要なら完成動画を保存してください。");
    setStatus("準備できました");
  } catch (error) {
    showFailure(error.message || "作成に失敗しました。");
    setProgress("失敗しました", 100, "詳細ログを開いて原因を確認してください。");
    setStatus("失敗しました");
  } finally {
    buildButton.disabled = false;
    buildButton.textContent = "MP4を作成する";
  }
});

presetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  presetButton.disabled = true;
  presetButton.textContent = "保存中...";
  try {
    const files = {
      bgm: document.getElementById("presetBgm").files[0],
      jingle: document.getElementById("presetJingle").files[0],
      introImage: document.getElementById("presetIntroImage").files[0],
      jingleImage: document.getElementById("presetJingleImage").files[0]
    };

    const updated = [];
    for (const [key, file] of Object.entries(files)) {
      if (file) {
        await saveDefaultAsset(key, file);
        updated.push(key);
      }
    }

    await refreshDefaults();
    presetForm.reset();
    presetNote.textContent = updated.length
      ? `保存しました: ${updated.join(", ")}`
      : "新しく保存した素材はありません。";
  } catch (error) {
    presetNote.textContent = error.message;
  } finally {
    presetButton.disabled = false;
    presetButton.textContent = "標準素材を保存する";
  }
});

addInsertTimeButton.addEventListener("click", () => {
  createInsertTimeRow("");
  syncJingleInputsState();
});

disableJingles.addEventListener("change", syncJingleInputsState);

createInsertTimeRow("00:03:13");
createInsertTimeRow("00:11:29");
syncJingleInputsState();
refreshDefaults();
setStatus("ブラウザだけで作成できます");

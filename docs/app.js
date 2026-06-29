const elements = {
  previewCanvas: document.getElementById("previewCanvas"),
  cameraCanvas: document.getElementById("cameraCanvas"),
  personCanvas: document.getElementById("personCanvas"),
  cameraVideo: document.getElementById("cameraVideo"),
  screenVideo: document.getElementById("screenVideo"),
  setupButton: document.getElementById("setupButton"),
  recordButton: document.getElementById("recordButton"),
  stopButton: document.getElementById("stopButton"),
  saveButton: document.getElementById("saveButton"),
  shareButton: document.getElementById("shareButton"),
  microphoneSelect: document.getElementById("microphoneSelect"),
  backgroundMode: document.getElementById("backgroundMode"),
  backgroundImageInput: document.getElementById("backgroundImageInput"),
  statusText: document.getElementById("statusText"),
  recordingBadge: document.getElementById("recordingBadge"),
};

const previewCtx = elements.previewCanvas.getContext("2d");
const cameraCtx = elements.cameraCanvas.getContext("2d");
const personCtx = elements.personCanvas.getContext("2d");

const TEXT = {
  ready: "\u30ab\u30e1\u30e9\u3068\u30de\u30a4\u30af\u3092\u958b\u59cb\u3057\u3066\u304f\u3060\u3055\u3044",
  startingMedia: "\u30ab\u30e1\u30e9\u3068\u30de\u30a4\u30af\u3092\u958b\u59cb\u3057\u3066\u3044\u307e\u3059",
  mediaReady: "\u30d7\u30ec\u30d3\u30e5\u30fc\u6e96\u5099\u5b8c\u4e86",
  mediaFailed: "\u30ab\u30e1\u30e9\u307e\u305f\u306f\u30de\u30a4\u30af\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f",
  sharingStart: "\u753b\u9762\u5171\u6709\u3092\u958b\u59cb\u3057\u3066\u3044\u307e\u3059",
  sharingOn: "\u753b\u9762\u5171\u6709\u4e2d",
  sharingOff: "\u753b\u9762\u5171\u6709\u3092\u505c\u6b62\u3057\u307e\u3057\u305f",
  sharingFailed: "\u753b\u9762\u5171\u6709\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f",
  recording: "\u9332\u753b\u4e2d",
  recordFailed: "\u9332\u753b\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f",
  recordStopped: "\u9332\u753b\u505c\u6b62\u3002\u4fdd\u5b58\u3067\u304d\u307e\u3059",
  savePreparing: "MP4\u4fdd\u5b58\u306e\u6e96\u5099\u3092\u3057\u3066\u3044\u307e\u3059",
  saving: "\u4fdd\u5b58\u30d5\u30a1\u30a4\u30eb\u3092\u6e96\u5099\u3057\u3066\u3044\u307e\u3059",
  saveDone: "\u4fdd\u5b58\u3057\u307e\u3057\u305f",
  saveFailed: "\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
  bgNone: "\u80cc\u666f\u305d\u306e\u307e\u307e",
  bgBlur: "\u80cc\u666f\u307c\u304b\u3057",
  bgImage: "\u753b\u50cf\u80cc\u666f",
  bgLoaded: "\u80cc\u666f\u753b\u50cf\u3092\u8aad\u307f\u8fbc\u307f\u307e\u3057\u305f",
  bgFailed: "\u80cc\u666f\u753b\u50cf\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f",
  shareStartButton: "\u753b\u9762\u5171\u6709\u3092\u958b\u59cb",
  shareStopButton: "\u753b\u9762\u5171\u6709\u3092\u505c\u6b62",
  micReady: "\u30de\u30a4\u30af\u3092\u5207\u308a\u66ff\u3048\u307e\u3057\u305f",
  micFailed: "\u30de\u30a4\u30af\u3092\u5207\u308a\u66ff\u3048\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f",
};

const state = {
  cameraStream: null,
  microphoneStream: null,
  screenStream: null,
  recorder: null,
  recordedChunks: [],
  recordedBlob: null,
  recordedMimeType: "",
  backgroundImage: null,
  backgroundMode: "none",
  segmentation: null,
  segmentationBusy: false,
  renderIntervalId: null,
  mixedAudioContext: null,
  ffmpeg: null,
  ffmpegUtil: null,
  recordingStartedAt: 0,
  recordingTimerId: null,
  canvasCaptureTrack: null,
};

function setStatus(message) {
  elements.statusText.textContent = message;
}

function setButtons() {
  const hasCamera = Boolean(state.cameraStream);
  const isRecording = state.recorder?.state === "recording";
  const hasRecording = Boolean(state.recordedBlob);

  elements.recordButton.disabled = !hasCamera || isRecording;
  elements.stopButton.disabled = !isRecording;
  elements.saveButton.disabled = !hasRecording || isRecording;
  elements.shareButton.disabled = !hasCamera;
  elements.shareButton.textContent = state.screenStream ? TEXT.shareStopButton : TEXT.shareStartButton;
}

function formatElapsedTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateRecordingBadge() {
  const elapsed = Date.now() - state.recordingStartedAt;
  elements.recordingBadge.textContent = `\u9332\u753b\u4e2d ${formatElapsedTime(elapsed)}`;
}

function startRecordingTimer() {
  state.recordingStartedAt = Date.now();
  updateRecordingBadge();
  elements.recordingBadge.hidden = false;
  stopRecordingTimer();
  state.recordingTimerId = window.setInterval(updateRecordingBadge, 1000);
}

function stopRecordingTimer() {
  if (state.recordingTimerId) {
    clearInterval(state.recordingTimerId);
    state.recordingTimerId = null;
  }
}

async function initializeSegmentation() {
  if (state.segmentation) {
    return;
  }

  if (typeof SelfieSegmentation !== "function") {
    throw new Error("SelfieSegmentation is not available");
  }

  const segmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
  });

  segmentation.setOptions({ modelSelection: 1 });
  segmentation.onResults(handleSegmentationResults);
  state.segmentation = segmentation;
}

async function setupMedia() {
  try {
    if (state.cameraStream) {
      return;
    }

    setStatus(TEXT.startingMedia);
    await initializeSegmentation();

    const selectedMicrophoneId = elements.microphoneSelect.value;
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });

    state.microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    state.microphoneStream.getAudioTracks().forEach((track) => {
      state.cameraStream.addTrack(track);
    });

    elements.cameraVideo.srcObject = state.cameraStream;
    await elements.cameraVideo.play();

    state.recordedBlob = null;
    state.recordedMimeType = "";
    await populateMicrophoneDevices();
    startRenderLoop();
    setStatus(TEXT.mediaReady);
    setButtons();
  } catch (error) {
    console.error(error);
    setStatus(TEXT.mediaFailed);
  }
}

async function populateMicrophoneDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const microphoneDevices = devices.filter((device) => device.kind === "audioinput");
  const currentValue = elements.microphoneSelect.value;

  elements.microphoneSelect.innerHTML = "";

  if (microphoneDevices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "標準マイク";
    elements.microphoneSelect.appendChild(option);
    return;
  }

  microphoneDevices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `マイク ${index + 1}`;
    elements.microphoneSelect.appendChild(option);
  });

  if (microphoneDevices.some((device) => device.deviceId === currentValue)) {
    elements.microphoneSelect.value = currentValue;
  }
}

async function switchMicrophone() {
  if (!state.cameraStream || state.recorder?.state === "recording") {
    return;
  }

  try {
    const selectedMicrophoneId = elements.microphoneSelect.value;
    const nextMicrophoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    state.cameraStream.getAudioTracks().forEach((track) => {
      state.cameraStream.removeTrack(track);
      track.stop();
    });

    if (state.microphoneStream) {
      state.microphoneStream.getTracks().forEach((track) => track.stop());
    }

    state.microphoneStream = nextMicrophoneStream;
    state.microphoneStream.getAudioTracks().forEach((track) => {
      state.cameraStream.addTrack(track);
    });

    await populateMicrophoneDevices();
    setStatus(TEXT.micReady);
  } catch (error) {
    console.error(error);
    setStatus(TEXT.micFailed);
  }
}

async function toggleScreenShare() {
  if (state.screenStream) {
    stopScreenShare();
    return;
  }

  try {
    setStatus(TEXT.sharingStart);
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 30 },
      },
      audio: true,
    });

    const [screenTrack] = state.screenStream.getVideoTracks();
    if (screenTrack) {
      screenTrack.addEventListener("ended", stopScreenShare, { once: true });
    }

    elements.screenVideo.srcObject = state.screenStream;
    await elements.screenVideo.play();
    setStatus(TEXT.sharingOn);
    setButtons();
  } catch (error) {
    console.error(error);
    setStatus(TEXT.sharingFailed);
  }
}

function stopScreenShare() {
  if (!state.screenStream) {
    return;
  }

  state.screenStream.getTracks().forEach((track) => track.stop());
  state.screenStream = null;
  elements.screenVideo.srcObject = null;
  setStatus(TEXT.sharingOff);
  setButtons();
}

function drawRoundedFrame(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCoverImage(ctx, image, targetWidth, targetHeight) {
  const targetRatio = targetWidth / targetHeight;
  const imageRatio = image.width / image.height;
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;

  if (imageRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
}

function redrawCameraCanvasWithoutSegmentation() {
  const { width, height } = elements.cameraCanvas;
  cameraCtx.clearRect(0, 0, width, height);

  if (state.backgroundMode === "image" && state.backgroundImage) {
    drawCoverImage(cameraCtx, state.backgroundImage, width, height);
    if (elements.cameraVideo.readyState >= 2) {
      cameraCtx.drawImage(elements.cameraVideo, 0, 0, width, height);
    }
    return;
  }

  if (elements.cameraVideo.readyState >= 2) {
    cameraCtx.drawImage(elements.cameraVideo, 0, 0, width, height);
  }
}

function handleSegmentationResults(results) {
  const { width, height } = elements.cameraCanvas;

  personCtx.clearRect(0, 0, width, height);
  personCtx.drawImage(results.segmentationMask, 0, 0, width, height);
  personCtx.globalCompositeOperation = "source-in";
  personCtx.drawImage(elements.cameraVideo, 0, 0, width, height);
  personCtx.globalCompositeOperation = "source-over";

  cameraCtx.clearRect(0, 0, width, height);

  if (state.backgroundMode === "blur") {
    cameraCtx.filter = "blur(18px)";
    cameraCtx.drawImage(elements.cameraVideo, 0, 0, width, height);
    cameraCtx.filter = "none";
    cameraCtx.drawImage(elements.personCanvas, 0, 0, width, height);
  } else if (state.backgroundMode === "image" && state.backgroundImage) {
    drawCoverImage(cameraCtx, state.backgroundImage, width, height);
    cameraCtx.drawImage(elements.personCanvas, 0, 0, width, height);
  } else {
    cameraCtx.drawImage(elements.cameraVideo, 0, 0, width, height);
  }

  state.segmentationBusy = false;
}

function composePreview() {
  const { width, height } = elements.previewCanvas;
  previewCtx.clearRect(0, 0, width, height);

  if (state.screenStream && elements.screenVideo.readyState >= 2) {
    previewCtx.drawImage(elements.screenVideo, 0, 0, width, height);

    const insetWidth = width * 0.28;
    const insetHeight = insetWidth * 9 / 16;
    const insetX = width - insetWidth - 40;
    const insetY = height - insetHeight - 40;

    previewCtx.save();
    drawRoundedFrame(previewCtx, insetX, insetY, insetWidth, insetHeight, 24);
    previewCtx.clip();
    previewCtx.drawImage(elements.cameraCanvas, insetX, insetY, insetWidth, insetHeight);
    previewCtx.restore();

    previewCtx.lineWidth = 4;
    previewCtx.strokeStyle = "rgba(255, 248, 238, 0.92)";
    drawRoundedFrame(previewCtx, insetX, insetY, insetWidth, insetHeight, 24);
    previewCtx.stroke();
    return;
  }

  previewCtx.drawImage(elements.cameraCanvas, 0, 0, width, height);
}

async function renderFrame() {
  if (!state.cameraStream) {
    return;
  }

  if (elements.cameraVideo.readyState >= 2) {
    if (state.segmentation && !state.segmentationBusy) {
      state.segmentationBusy = true;
      state.segmentation.send({ image: elements.cameraVideo }).catch((error) => {
        console.error(error);
        state.segmentationBusy = false;
        redrawCameraCanvasWithoutSegmentation();
      });
    } else if (!state.segmentation) {
      redrawCameraCanvasWithoutSegmentation();
    }
  }

  composePreview();
  if (state.canvasCaptureTrack?.requestFrame) {
    state.canvasCaptureTrack.requestFrame();
  }
}

function startRenderLoop() {
  if (state.renderIntervalId) {
    clearInterval(state.renderIntervalId);
  }

  renderFrame().catch((error) => {
    console.error(error);
  });

  state.renderIntervalId = window.setInterval(() => {
    renderFrame().catch((error) => {
      console.error(error);
    });
  }, 1000 / 30);
}

async function buildAudioStream() {
  const micTracks = state.microphoneStream ? state.microphoneStream.getAudioTracks().filter((track) => track.readyState === "live" && track.enabled) : [];
  const shareTracks = state.screenStream ? state.screenStream.getAudioTracks().filter((track) => track.readyState === "live" && track.enabled) : [];

  if (micTracks.length === 0 && shareTracks.length === 0) {
    return new MediaStream();
  }

  if (shareTracks.length === 0 && micTracks.length > 0) {
    return new MediaStream([micTracks[0]]);
  }

  const audioContext = new AudioContext();
  await audioContext.resume();
  const destination = audioContext.createMediaStreamDestination();

  micTracks.forEach((track) => {
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
    const gain = audioContext.createGain();
    gain.gain.value = 1.25;
    source.connect(gain).connect(destination);
  });

  shareTracks.forEach((track) => {
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
    const gain = audioContext.createGain();
    gain.gain.value = 1;
    source.connect(gain).connect(destination);
  });

  state.mixedAudioContext = audioContext;
  return destination.stream;
}

function buildRecorderOptions() {
  const mimeTypes = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  const options = {
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 192_000,
  };

  const supported = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
  if (supported) {
    options.mimeType = supported;
  }

  return options;
}

async function startRecording() {
  if (!state.cameraStream) {
    await setupMedia();
  }

  if (!state.cameraStream) {
    return;
  }

  try {
    state.recordedChunks = [];
    state.recordedBlob = null;
    state.recordedMimeType = "";
    elements.saveButton.disabled = true;

    const canvasStream = elements.previewCanvas.captureStream(30);
    state.canvasCaptureTrack = canvasStream.getVideoTracks()[0] || null;
    const audioStream = await buildAudioStream();
    const outputStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);

    const recorderOptions = buildRecorderOptions();
    state.recorder = new MediaRecorder(outputStream, recorderOptions);
    state.recordedMimeType = recorderOptions.mimeType || "video/webm";

    state.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.recordedChunks.push(event.data);
      }
    };

    state.recorder.onstop = async () => {
      const mimeType = state.recordedChunks[0]?.type || state.recordedMimeType || "video/webm";
      state.recordedMimeType = mimeType;
      state.recordedBlob = new Blob(state.recordedChunks, { type: mimeType });
      stopRecordingTimer();
      elements.recordingBadge.hidden = true;
      state.canvasCaptureTrack = null;

      if (state.mixedAudioContext) {
        await state.mixedAudioContext.close();
        state.mixedAudioContext = null;
      }

      setStatus(TEXT.recordStopped);
      setButtons();
    };

    state.recorder.start(1000);
    startRecordingTimer();
    setStatus(TEXT.recording);
    setButtons();
  } catch (error) {
    console.error(error);
    stopRecordingTimer();
    elements.recordingBadge.hidden = true;
    state.canvasCaptureTrack = null;

    if (state.mixedAudioContext) {
      await state.mixedAudioContext.close().catch(() => {});
      state.mixedAudioContext = null;
    }

    setStatus(TEXT.recordFailed);
  }
}

function stopRecording() {
  if (state.recorder?.state === "recording") {
    state.recorder.stop();
  }
}

async function ensureFfmpeg() {
  if (state.ffmpeg && state.ffmpegUtil) {
    return { ffmpeg: state.ffmpeg, util: state.ffmpegUtil };
  }

  setStatus(TEXT.savePreparing);
  const [{ FFmpeg }, util] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/ffmpeg.js"),
    import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js"),
  ]);

  const ffmpeg = new FFmpeg();
  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";

  await ffmpeg.load({
    coreURL: await util.toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await util.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  state.ffmpeg = ffmpeg;
  state.ffmpegUtil = util;
  return { ffmpeg, util };
}

function triggerDownload(blob, extension) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `podcast-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}

async function saveViaFilePicker(blob, extension) {
  if (typeof window.showSaveFilePicker !== "function") {
    return false;
  }

  const handle = await window.showSaveFilePicker({
    suggestedName: `podcast-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
    types: [
      {
        description: extension.toUpperCase(),
        accept: {
          [blob.type || "application/octet-stream"]: [`.${extension}`],
        },
      },
    ],
  });

  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

async function saveOriginalRecording() {
  const extension = state.recordedMimeType.includes("webm") ? "webm" : "mp4";
  const saved = await saveViaFilePicker(state.recordedBlob, extension).catch(() => false);
  if (!saved) {
    triggerDownload(state.recordedBlob, extension);
  }
}

async function saveRecording() {
  if (!state.recordedBlob) {
    return;
  }

  try {
    setStatus(TEXT.saving);
    elements.saveButton.disabled = true;

    if (state.recordedMimeType.includes("mp4")) {
      const savedMp4 = await saveViaFilePicker(state.recordedBlob, "mp4").catch(() => false);
      if (!savedMp4) {
        triggerDownload(state.recordedBlob, "mp4");
      }
      setStatus(TEXT.saveDone);
      return;
    }

    const { ffmpeg, util } = await ensureFfmpeg();
    await ffmpeg.writeFile("input.webm", await util.fetchFile(state.recordedBlob));
    await ffmpeg.exec([
      "-y",
      "-i", "input.webm",
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-ac", "2",
      "-shortest",
      "podcast-recording.mp4",
    ]);

    const data = await ffmpeg.readFile("podcast-recording.mp4");
    const blob = new Blob([data], { type: "video/mp4" });
    const savedConverted = await saveViaFilePicker(blob, "mp4").catch(() => false);
    if (!savedConverted) {
      triggerDownload(blob, "mp4");
    }

    await ffmpeg.deleteFile("input.webm").catch(() => {});
    await ffmpeg.deleteFile("podcast-recording.mp4").catch(() => {});
    setStatus(TEXT.saveDone);
  } catch (error) {
    console.error(error);
    await saveOriginalRecording();
    setStatus("MP4保存に失敗したため、元の録画を保存しました");
  } finally {
    setButtons();
  }
}

function loadBackgroundImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

elements.setupButton.addEventListener("click", setupMedia);
elements.recordButton.addEventListener("click", startRecording);
elements.stopButton.addEventListener("click", stopRecording);
elements.saveButton.addEventListener("click", saveRecording);
elements.shareButton.addEventListener("click", toggleScreenShare);
elements.microphoneSelect.addEventListener("change", switchMicrophone);

elements.backgroundMode.addEventListener("change", (event) => {
  state.backgroundMode = event.target.value;

  if (state.backgroundMode === "none") {
    setStatus(TEXT.bgNone);
  } else if (state.backgroundMode === "blur") {
    setStatus(TEXT.bgBlur);
  } else {
    setStatus(TEXT.bgImage);
  }

  redrawCameraCanvasWithoutSegmentation();
});

elements.backgroundImageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) {
    state.backgroundImage = null;
    return;
  }

  try {
    state.backgroundImage = await loadBackgroundImage(file);
    state.backgroundMode = "image";
    elements.backgroundMode.value = "image";
    redrawCameraCanvasWithoutSegmentation();
    setStatus(TEXT.bgLoaded);
  } catch (error) {
    console.error(error);
    setStatus(TEXT.bgFailed);
  }
});

setButtons();
setStatus(TEXT.ready);
populateMicrophoneDevices().catch(() => {});
navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  populateMicrophoneDevices().catch(() => {});
});

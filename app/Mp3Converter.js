"use client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance = null;
let loadingPromise = null;

export function isFFmpegLoaded() {
  return !!ffmpegInstance;
}

export async function getFFmpeg(onLog) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on("log", ({ message }) => onLog && onLog(message));
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ffmpeg;
    loadingPromise = null;
    return ffmpeg;
  })();
  return loadingPromise;
}

export async function convertWebmToMp3(webmBlob, opts = {}) {
  const bitrate = opts.bitrate || "128k";
  const ffmpeg = await getFFmpeg(opts.onLog);
  const ts = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const inputName = `in_${ts}.webm`;
  const outputName = `out_${ts}.mp3`;
  await ffmpeg.writeFile(inputName, await fetchFile(webmBlob));
  await ffmpeg.exec(["-i", inputName, "-vn", "-c:a", "libmp3lame", "-b:a", bitrate, outputName]);
  const data = await ffmpeg.readFile(outputName);
  try { await ffmpeg.deleteFile(inputName); } catch {}
  try { await ffmpeg.deleteFile(outputName); } catch {}
  return new Blob([data.buffer], { type: "audio/mpeg" });
}

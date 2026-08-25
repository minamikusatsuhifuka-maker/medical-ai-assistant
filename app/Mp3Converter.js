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

// EBML の可変長整数（vint）を読む。返り値の len は先頭バイトを含む長さ。
function readVint(buf, pos) {
  const first = buf[pos];
  if (first === undefined || first === 0) return null;
  let len = 1, mask = 0x80;
  while (len <= 8 && !(first & mask)) { mask >>= 1; len++; }
  if (len > 8 || pos + len > buf.length) return null;
  let val = first & (mask - 1);
  for (let i = 1; i < len; i++) val = val * 256 + buf[pos + i];
  return { val, len };
}

/**
 * 連結された WebM の切れ目を探す。
 *
 * 議事録・セミナーの旧録音は「書き起こし用MRを10秒ごとに stop/start した結果できた
 * 独立した WebM ファイル」をそのまま Blob で繋げたもの。ffmpeg は通常入力として渡すと
 * 先頭セグメントしか読まないため、mp3 が十数秒で切れていた（実測: 19分の録音→19.8秒）。
 * ここで境界を検出し、複数あれば concat デマクサで全長を変換する。
 *
 * EBMLヘッダのマジック(1A 45 DF A3)はopusペイロード中に偶然現れうるので、
 * 「ヘッダ本体の直後に Segment 要素ID(18 53 80 67) が来ること」まで確認して誤検出を防ぐ。
 */
export function findWebmSegmentOffsets(buf) {
  const offsets = [];
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] !== 0x1a || buf[i + 1] !== 0x45 || buf[i + 2] !== 0xdf || buf[i + 3] !== 0xa3) continue;
    const size = readVint(buf, i + 4);
    if (!size) continue;
    const seg = i + 4 + size.len + size.val;
    if (seg + 4 > buf.length) continue;
    if (buf[seg] !== 0x18 || buf[seg + 1] !== 0x53 || buf[seg + 2] !== 0x80 || buf[seg + 3] !== 0x67) continue;
    offsets.push(i);
    i = seg + 3;
  }
  return offsets;
}

export async function convertWebmToMp3(webmBlob, opts = {}) {
  // 会話音声は 64kbps モノラルで十分（従来128k）。長時間の会議録音でファイルサイズが半分になる。
  const bitrate = opts.bitrate || "64k";
  const mono = opts.mono !== false;
  const ffmpeg = await getFFmpeg(opts.onLog);
  const ts = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const outputName = `out_${ts}.mp3`;
  const encArgs = ["-vn", "-c:a", "libmp3lame", "-b:a", bitrate];
  if (mono) encArgs.push("-ac", "1");

  const raw = await fetchFile(webmBlob);
  const offsets = findWebmSegmentOffsets(raw);
  // 呼び出し側のサニティチェック用に構造を知らせる（連結webmだったかどうか）
  if (opts.onInfo) { try { opts.onInfo({ segments: offsets.length }); } catch {} }
  const written = [];
  let args;

  if (offsets.length > 1) {
    // 連結webm: セグメントごとにFSへ書き出し、concatデマクサで1本として読ませる
    const listLines = [];
    for (let i = 0; i < offsets.length; i++) {
      const end = i + 1 < offsets.length ? offsets[i + 1] : raw.length;
      const name = `seg_${ts}_${String(i).padStart(4, "0")}.webm`;
      await ffmpeg.writeFile(name, raw.subarray(offsets[i], end));
      written.push(name);
      listLines.push(`file '${name}'`);
    }
    const listName = `list_${ts}.txt`;
    await ffmpeg.writeFile(listName, new TextEncoder().encode(listLines.join("\n") + "\n"));
    written.push(listName);
    args = ["-f", "concat", "-safe", "0", "-i", listName, ...encArgs, outputName];
    if (opts.onLog) opts.onLog(`[mp3] 連結webmを検出: ${offsets.length}セグメントを結合して変換します`);
  } else {
    const inputName = `in_${ts}.webm`;
    await ffmpeg.writeFile(inputName, raw);
    written.push(inputName);
    args = ["-i", inputName, ...encArgs, outputName];
  }

  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile(outputName);
  for (const name of written) { try { await ffmpeg.deleteFile(name); } catch {} }
  try { await ffmpeg.deleteFile(outputName); } catch {}
  return new Blob([data.buffer], { type: "audio/mpeg" });
}

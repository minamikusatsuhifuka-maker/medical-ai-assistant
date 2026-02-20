"use client";
import { useState, useRef, useEffect, useCallback } from "react";

export default function Home() {
  // === State ===
  const [recState, setRecState] = useState("inactive");
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [interim, setInterim] = useState("");
  const [status, setStatus] = useState("待機中");
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [mode, setMode] = useState("gemini");

  // === Refs ===
  const mediaRecRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const levelAnimRef = useRef(null);
  const timerRef = useRef(null);
  const chunksRef = useRef([]);
  const chunkTimerRef = useRef(null);

  // === Timer ===
  useEffect(() => {
    if (recState === "recording") {
      timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      if (recState === "inactive") setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [recState]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // === Audio Level Monitor ===
  const startAudioMonitor = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setAudioLevel(Math.min(100, Math.round((sum / data.length / 128) * 100)));
        levelAnimRef.current = requestAnimationFrame(tick);
      };
      levelAnimRef.current = requestAnimationFrame(tick);
      return stream;
    } catch {
      setStatus("マイク取得失敗");
      return null;
    }
  };

  const stopAudioMonitor = () => {
    if (levelAnimRef.current) cancelAnimationFrame(levelAnimRef.current);
    levelAnimRef.current = null;
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  // === Whisper Transcription ===
  const transcribeChunk = async (blob) => {
    if (blob.size < 1000) return;
    try {
      const formData = new FormData();
      formData.append("audio", blob, "audio.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await res.json();
      if (data.text && data.text.trim()) {
        setInputText(prev => prev + (prev ? "\n" : "") + data.text.trim());
      }
    } catch (e) {
      console.error("Transcription error:", e);
    }
  };

  // === Recording with auto-chunk (every 30s) ===
  const startRecording = async () => {
    const stream = await startAudioMonitor();
    if (!stream) return;

    chunksRef.current = [];
    setRecState("recording");
    setStatus("録音中");
    setInterim("");

    const startNewChunk = () => {
      if (mediaRecRef.current && mediaRecRef.current.state === "recording") {
        mediaRecRef.current.stop();
      }
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus" : "audio/webm"
      });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          transcribeChunk(e.data);
        }
      };
      mr.start();
      mediaRecRef.current = mr;
    };

    startNewChunk();
    chunkTimerRef.current = setInterval(() => {
      if (mediaRecRef.current && mediaRecRef.current.state === "recording") {
        startNewChunk();
      }
    }, 30000);
  };

  const stopRecording = () => {
    clearInterval(chunkTimerRef.current);
    if (mediaRecRef.current && mediaRecRef.current.state === "recording") {
      mediaRecRef.current.stop();
    }
    mediaRecRef.current = null;
    stopAudioMonitor();
    setRecState("inactive");
    setStatus("待機中");
    setInterim("");
  };

  const pauseRecording = () => {
    clearInterval(chunkTimerRef.current);
    if (mediaRecRef.current && mediaRecRef.current.state === "recording") {
      mediaRecRef.current.stop();
    }
    setRecState("paused");
    setStatus("一時停止");
  };

  const resumeRecording = () => {
    if (!micStreamRef.current) return;
    setRecState("recording");
    setStatus("録音中");

    const mr = new MediaRecorder(micStreamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm"
    });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) transcribeChunk(e.data);
    };
    mr.start();
    mediaRecRef.current = mr;
    chunkTimerRef.current = setInterval(() => {
      if (mediaRecRef.current && mediaRecRef.current.state === "recording") {
        mediaRecRef.current.stop();
        const mr2 = new MediaRecorder(micStreamRef.current, {
          mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus" : "audio/webm"
        });
        mr2.ondataavailable = (e) => { if (e.data.size > 0) transcribeChunk(e.data); };
        mr2.start();
        mediaRecRef.current = mr2;
      }
    }, 30000);
  };

  // === Summarize ===
  const summarize = async () => {
    if (!inputText.trim()) { setStatus("テキストを入力してください"); return; }
    setIsLoading(true);
    setStatus(mode === "claude" ? "Claude で要約中..." : "Gemini で要約中...");
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, mode }),
      });
      const data = await res.json();
      setOutputText(data.summary);
      try { await navigator.clipboard.writeText(data.summary); setStatus("要約完了・コピー済み ✓"); } catch { setStatus("要約完了"); }
    } catch { setStatus("エラーが発生しました"); }
    finally { setIsLoading(false); }
  };

  const stopAndSummarize = () => {
    stopRecording();
    setTimeout(() => summarize(), 500);
  };

  const clear = () => {
    setInputText(""); setOutputText(""); setStatus("待機中"); setInterim(""); setElapsed(0);
  };

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); setStatus("コピー済み ✓"); } catch {}
  };

  // === Styles ===
  const ac = "#6366f1";
  const acD = "#4338ca";
  const acS = "#eef2ff";
  const rG = "#22c55e";

  const roundBtn = {
    width: 74, height: 74, borderRadius: "50%", border: "none",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 2, fontFamily: "inherit", fontWeight: 700, fontSize: 10,
    boxShadow: "0 4px 14px rgba(99,102,241,.25)", cursor: "pointer",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "12px 20px", background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: ac }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>AI診療アシスタント</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: ac, color: "#fff", fontWeight: 700 }}>v2.0</span>
        </div>
        <span style={{ fontSize: 13, color: "#64748b" }}>{status}</span>
      </header>

      {/* Main Card */}
      <div style={{ background: "#fff", borderRadius: 22, padding: "24px", boxShadow: "0 4px 24px rgba(0,0,0,.06)" }}>
        {/* Recording Controls */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {recState !== "inactive" && (
            <span style={{ fontSize: 28, fontWeight: 700, color: recState === "recording" ? rG : "#d97706", fontVariantNumeric: "tabular-nums" }}>
              {fmt(elapsed)}
            </span>
          )}

          {recState === "recording" && (
            <div style={{ width: "60%", height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
              <div style={{ width: `${audioLevel}%`, height: "100%", background: rG, borderRadius: 3, transition: "width 0.1s" }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {recState === "inactive" ? (
              <button onClick={startRecording} style={{ ...roundBtn, background: ac, color: "#fff" }}>
                <span style={{ fontSize: 24 }}>🎙</span>
                <span>タップで開始</span>
              </button>
            ) : (
              <>
                {recState === "recording" ? (
                  <button onClick={pauseRecording} style={{ ...roundBtn, width: 56, height: 56, background: "#fbbf24", color: "#78350f" }}>
                    <span style={{ fontSize: 22 }}>⏸</span>
                  </button>
                ) : (
                  <button onClick={resumeRecording} style={{ ...roundBtn, width: 56, height: 56, background: rG, color: "#fff" }}>
                    <span style={{ fontSize: 22 }}>▶</span>
                  </button>
                )}
                <button onClick={stopAndSummarize} style={{ ...roundBtn, background: acD, color: "#fff" }}>
                  <span style={{ fontSize: 16 }}>✓</span>
                  <span>要約</span>
                </button>
                <button onClick={stopRecording} style={{ ...roundBtn, width: 56, height: 56, background: "#ef4444", color: "#fff" }}>
                  <span style={{ fontSize: 22 }}>⏹</span>
                </button>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 2, background: "#f1f5f9", borderRadius: 20, padding: 2 }}>
            <button onClick={() => setMode("gemini")} style={{ padding: "6px 16px", borderRadius: 18, border: "none", fontSize: 13, fontWeight: mode === "gemini" ? 700 : 400, background: mode === "gemini" ? "#fff" : "transparent", color: mode === "gemini" ? acD : "#64748b", fontFamily: "inherit", cursor: "pointer", boxShadow: mode === "gemini" ? "0 1px 4px rgba(0,0,0,.08)" : "none" }}>⚡ Gemini</button>
            <button onClick={() => setMode("claude")} style={{ padding: "6px 16px", borderRadius: 18, border: "none", fontSize: 13, fontWeight: mode === "claude" ? 700 : 400, background: mode === "claude" ? "#fff" : "transparent", color: mode === "claude" ? acD : "#64748b", fontFamily: "inherit", cursor: "pointer", boxShadow: mode === "claude" ? "0 1px 4px rgba(0,0,0,.08)" : "none" }}>🧠 Claude</button>
          </div>
        </div>

        {/* Transcription */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#64748b" }}>📝 書き起こし</label>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{inputText.length}文字</span>
          </div>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="録音ボタンで音声を書き起こし、または直接入力..."
            style={{ width: "100%", height: 160, padding: 12, borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, color: "#1a1a1a", fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, boxSizing: "border-box" }}
          />
          {interim && <div style={{ fontSize: 13, color: rG, fontStyle: "italic", marginTop: 4 }}>{interim}...</div>}
        </div>

        {/* Manual summarize buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={summarize} disabled={isLoading || !inputText.trim()} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: isLoading ? "#e2e8f0" : ac, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", opacity: !inputText.trim() ? .45 : 1 }}>
            {isLoading ? "⏳ 処理中..." : `${mode === "claude" ? "🧠 Claude" : "⚡ Gemini"} で要約`}
          </button>
          <button onClick={clear} style={{ padding: "10px 20px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 600, color: "#64748b", fontFamily: "inherit", cursor: "pointer" }}>🗑 クリア</button>
        </div>

        {/* Output */}
        {outputText && (
          <div style={{ borderRadius: 14, border: `1px solid ${ac}33`, padding: 16, background: acS }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: acD }}>📋 要約結果</span>
              <button onClick={() => copyText(outputText)} style={{ padding: "4px 12px", borderRadius: 10, border: `1px solid ${ac}44`, background: "#fff", fontSize: 12, fontWeight: 600, color: acD, fontFamily: "inherit", cursor: "pointer" }}>📋 コピー</button>
            </div>
            <textarea
              value={outputText}
              onChange={e => setOutputText(e.target.value)}
              style={{ width: "100%", height: 200, padding: 12, borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, color: "#1a1a1a", fontFamily: "inherit", resize: "vertical", lineHeight: 1.7, boxSizing: "border-box" }}
            />
          </div>
        )}

        {isLoading && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTop: `3px solid ${ac}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 10px" }} />
            <span style={{ color: "#64748b" }}>AIが要約を作成中...</span>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

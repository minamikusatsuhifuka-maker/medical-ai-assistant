// クリップボードには書式なしの文字（text/plain）だけを入れる。
// 画面の文字を直接選んでコピーすると、ブラウザは text/html も一緒に入れる。
// カルテの欄に貼ると font-size・color（暗いテーマでは白）が持ち込まれ、改行も潰れるため、copy イベントで置き換える。

// Windows の入力欄には \n だけだと改行として扱わないものがあるので CRLF に揃える。
// textarea と Chrome の貼り付けは CRLF を 1 つの改行として読むので、空行は増えない。
export const toClipboardText = (text) => String(text == null ? "" : text).replace(/\r\n|\r|\n/g, "\r\n");

// 文書ごとに 1 回つなぐ。⌘C / Ctrl+C・右クリックのコピー・execCommand("copy") のすべてがここを通る。
// 戻り値は外すための関数。失敗したらブラウザの既定のコピーに任せる（fail-open）。
export const attachPlainTextCopy = (doc) => {
  const onCopy = (e) => {
    try {
      if (!e.clipboardData) return;
      const el = doc.activeElement;
      if (el && el.tagName === "INPUT") return; // 1 行の欄は書式も改行も無い。password の扱いもブラウザに任せる
      let text = "";
      if (el && el.tagName === "TEXTAREA") text = el.value.slice(el.selectionStart, el.selectionEnd);
      else { const sel = doc.getSelection(); text = sel ? sel.toString() : ""; }
      if (!text) return;
      e.clipboardData.setData("text/plain", toClipboardText(text));
      e.preventDefault();
    } catch (err) { console.warn("[plainCopy] 既定のコピーに任せます:", err); }
  };
  doc.addEventListener("copy", onCopy, true);
  return () => doc.removeEventListener("copy", onCopy, true);
};

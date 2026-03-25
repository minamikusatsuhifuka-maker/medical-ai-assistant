export const maxDuration = 60;

const SCAN_CHUNK_SIZE = 5000;

const SYSTEM_PROMPT = `あなたはクリニック経営・医療・マーケティング分野の音声書き起こし校正の専門家です。
会議・ミーティングの音声認識で発生しやすい誤変換を検出し、正しい用語に修正してください。

【検出対象の用語カテゴリ】
■ 医療・クリニック用語
疾患名: アトピー性皮膚炎、蕁麻疹、痤瘡、酒さ、白癬、乾癬、脂漏性皮膚炎、接触性皮膚炎、帯状疱疹
薬品名: デュピクセント、コレクチム、ミチーガ、プロトピック、ステロイド、ヒアルロン酸、ボトックス、イソトレチノイン
施術名: フォトフェイシャル、ケミカルピーリング、ダーマペン、ナローバンドUVB、液体窒素、ダーモスコピー
医療資格: 皮膚科専門医、美容皮膚科、形成外科

■ 経営・マーケティング用語
経営: 損益計算書、貸借対照表、キャッシュフロー、ROI、KPI、PDCAサイクル、OKR
マーケティング: AIDMA、LTV（顧客生涯価値）、CPA（顧客獲得コスト）、CVR（コンバージョン率）、SEO、MEO
採用: オンボーディング、リテンション、エンゲージメント、ペルソナ
業務: オペレーション、コンプライアンス、インシデント、リスクマネジメント

■ よくある音声誤変換パターン
「けいえい」→「経営」、「マーケ」→「マーケティング」、「えるてぃーぶい」→「LTV」
「けいぴーあい」→「KPI」、「ぴーでぃーしーえー」→「PDCAサイクル」
「デュピク」→「デュピクセント」、「いそとれ」→「イソトレチノイン」

【ルール】
- 医療・経営・マーケティング用語の誤変換のみ検出する
- 一般的な日本語の言い間違いは検出しない
- 確信度が高い候補のみ返す
- JSON形式のみで返す
- 形式: {"corrections":[{"from":"誤り語句","candidates":[{"to":"正しい用語","reason":"理由（カテゴリも明記）"}]}]}`;

async function scanChunk(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: `以下はクリニックの会議・ミーティングの音声書き起こしテキストです。\n医療・経営・マーケティング用語の音声認識誤りを全て見つけてください：\n\n${text}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts.filter(p => !p.thought).map(p => p.text || "").join("");
  if (!content.trim()) return [];

  let parsed = { corrections: [] };
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    const m1 = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m1) { try { parsed = JSON.parse(m1[1].trim()); } catch {} }
    else {
      const m2 = content.match(/\{[\s\S]*"corrections"[\s\S]*\}/);
      if (m2) { try { parsed = JSON.parse(m2[0]); } catch {} }
    }
  }
  return Array.isArray(parsed.corrections) ? parsed.corrections : [];
}

export async function POST(request) {
  try {
    const { text, dictionary } = await request.json();
    if (!text || !text.trim()) {
      return Response.json({ corrections: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    // テキストをチャンク分割
    const chunks = [];
    for (let i = 0; i < text.length; i += SCAN_CHUNK_SIZE) {
      chunks.push(text.slice(i, i + SCAN_CHUNK_SIZE));
    }

    // 辞書登録済みのセット
    const registeredFroms = new Set(
      (dictionary && Array.isArray(dictionary)) ? dictionary.map(d => d.from) : []
    );

    // 全チャンクをスキャンして結果を統合（重複除去）
    const allCorrections = [];
    const seenFroms = new Set();

    for (let i = 0; i < chunks.length; i++) {
      try {
        const corrections = await scanChunk(chunks[i], apiKey);
        for (const c of corrections) {
          // 辞書登録済み・スキャン済みは除外
          if (registeredFroms.has(c.from) || seenFroms.has(c.from)) continue;
          seenFroms.add(c.from);
          allCorrections.push(c);
        }
      } catch (e) {
        console.error(`minutes-typos chunk ${i} error:`, e.message);
        // チャンクエラーは無視して続行
      }
    }

    return Response.json({
      corrections: allCorrections,
      scannedChunks: chunks.length,
      totalLength: text.length
    });

  } catch (e) {
    console.error("minutes-typos error:", e);
    return Response.json({ error: "サーバーエラー" }, { status: 500 });
  }
}

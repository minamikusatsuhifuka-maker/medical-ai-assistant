# タスク生成修正・進捗バー・クリニック経営基準

app/page.jsとapp/api/summarize/route.jsを修正してください。既存機能は壊さないでください。

## 問題1: タスク生成が動かない

generateTasksFromMinute関数を確認し、以下の点を修正:

1. /api/summarizeのレスポンスからJSONを正しくパースできていない可能性がある
2. Geminiの返すJSONにマークダウンのコードブロックや余計なテキストが含まれる場合の処理を強化
3. パース失敗時にconsole.errorだけでなくsSt("タスク生成エラー")で画面にも通知

### generateTasksFromMinute関数を以下に完全置換:

```js
const generateTasksFromMinute=async(minute)=>{
  if(!supabase||!minute.output_text)return;
  sSt("タスク生成中...");setProg(10);
  try{
    const taskPrompt=`以下の皮膚科・美容皮膚科クリニックの議事録からタスクとTODOを抽出してください。

【判断基準】
- 患者対応・医療安全に関するタスク（重要度:高）
- スタッフ教育・採用・労務管理（重要度:中〜高）
- 売上・集患・マーケティング施策（重要度:中〜高）
- 設備・機器の導入・メンテナンス（重要度:中）
- 院内オペレーション改善（重要度:中）
- 法令遵守・届出・保険請求（重要度:高）
- 患者満足度向上・クレーム対応（重要度:高）
- 美容メニュー開発・価格設定（重要度:中）

必ず以下のJSON配列のみを返してください。説明文やマークダウンは不要です。
[{"title":"タスク名","assignee":"","due_date":null,"urgency":2,"importance":2,"category":"operations"}]

categoryは: operations(運営), medical(医療), hr(人事), finance(経理)
urgency: 1=低 2=やや低 3=やや高 4=高
importance: 1=低 2=やや低 3=やや高 4=高

議事録:
`+minute.output_text;

    setProg(40);
    const tr=await fetch("/api/summarize",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:taskPrompt,mode:"gemini",prompt:"JSONの配列のみ返してください。他のテキストは一切不要です。"})
    });
    const td=await tr.json();
    setProg(70);
    
    if(td.error){sSt("タスク生成エラー: "+td.error);return}
    if(td.summary){
      let jsonStr=td.summary;
      // マークダウンコードブロック除去
      jsonStr=jsonStr.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
      // 配列の開始位置を探す
      const startIdx=jsonStr.indexOf("[");
      const endIdx=jsonStr.lastIndexOf("]");
      if(startIdx!==-1&&endIdx!==-1){
        jsonStr=jsonStr.substring(startIdx,endIdx+1);
      }
      try{
        const parsed=JSON.parse(jsonStr);
        if(Array.isArray(parsed)&&parsed.length>0){
          let count=0;
          for(const t of parsed){
            await supabase.from("tasks").insert({
              minute_id:minute.id,
              title:t.title||"未定",
              assignee:t.assignee||"",
              due_date:t.due_date||null,
              urgency:Math.min(4,Math.max(1,parseInt(t.urgency)||2)),
              importance:Math.min(4,Math.max(1,parseInt(t.importance)||2)),
              category:["operations","medical","hr","finance"].includes(t.category)?t.category:"operations"
            });
            count++;
          }
          setProg(90);
          await loadTasks();
          sSt(`✓ ${count}件のタスクを生成しました`);
        }else{
          sSt("タスクが抽出できませんでした");
        }
      }catch(e){
        console.error("JSON parse error:",e,"Raw:",jsonStr);
        sSt("タスク生成エラー: JSON解析失敗");
      }
    }
  }catch(e){
    console.error("Task gen error:",e);
    sSt("タスク生成エラー: "+e.message);
  }finally{setProg(0)}
};
```

## 問題2: 進捗バーが各ページで見えない

現在prog>0の進捗バーはメインページのheader直後にしかない。
議事録ページ、タスク管理ページにも同じ進捗バーを追加してください。

議事録ページのreturn文の先頭（最初のdivの直後）に追加:
```jsx
{prog>0&&<div style={{width:"100%",height:4,background:"#d8ddd0",borderRadius:2,marginBottom:8,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#7ba83e,#6a9e3a)",borderRadius:2,transition:"width 0.5s ease"}}/></div>}
```

タスク管理ページのreturn文の先頭にも同じ進捗バーを追加してください。

## 問題3: minSum内のタスク生成プロンプトも同じ基準に更新

minSum関数内でタスク生成している部分のプロンプトも上記と同じクリニック経営基準のプロンプトに更新してください。

ビルドが通ることを確認してください。

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasGemini: !!process.env.GEMINI_API_KEY,
    hasClaude: !!process.env.CLAUDE_API_KEY,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "未設定",
  });
}
```

「**Commit changes...**」→「**Commit changes**」

ビルドがReadyになったら、ブラウザで以下にアクセス：
```
https://medical-ai-assistant-nine.vercel.app/api/check-env

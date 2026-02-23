import { NextResponse } from "next/server";
export async function GET() {
  const gk = process.env.GEMINI_API_KEY || "";
  return NextResponse.json({
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasGemini: !!process.env.GEMINI_API_KEY,
    geminiKeyPrefix: gk.substring(0, 10) + "...",
    hasClaude: !!process.env.CLAUDE_API_KEY,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

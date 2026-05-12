"use client";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

const CS_SCORE_ITEMS = ["傾聴力","共感力","質問の質","ニーズ把握","説明力","信頼関係構築","提案力","クロージング"];

export default function ScoreRadar({ scores, compact = false }) {
  if (!scores || Object.keys(scores).length === 0) return null;
  const data = CS_SCORE_ITEMS.map(k => ({ subject: k, score: Number(scores[k])||0, fullMark: 10 }));
  const height = compact ? 220 : 320;
  const angleFontSize = compact ? 9 : 11;
  const radiusFontSize = compact ? 8 : 10;
  const dotR = compact ? 2 : 2.5;
  const padding = compact ? 4 : 8;
  return (
    <div style={{width:"100%",height,background:"#faf9ff",borderRadius:10,padding:padding,border:"1px solid #e9e6ff"}}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius={compact?"68%":"72%"}>
          <PolarGrid stroke="#cdc6f0" strokeWidth={0.8}/>
          <PolarAngleAxis dataKey="subject" tick={{fontSize:angleFontSize,fill:"#5a4f9c"}}/>
          <PolarRadiusAxis domain={[0,10]} tick={{fontSize:radiusFontSize,fill:"#8a82c2"}} axisLine={false} tickCount={6}/>
          <Radar name="スコア" dataKey="score" stroke="#7f77dd" strokeWidth={1.2} fill="#9d96e6" fillOpacity={0.28} dot={{r:dotR,fill:"#7f77dd"}}/>
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function UsageDailyChart({ data }) {
  return (
    <div style={{width:"100%",height:220}}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{top:8,right:8,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9e6ff"/>
          <XAxis dataKey="day" interval={2} tick={{fontSize:10,fill:"#5a4f9c"}}/>
          <YAxis tick={{fontSize:10,fill:"#8a82c2"}} tickFormatter={v=>`¥${Number(v).toLocaleString()}`}/>
          <Tooltip formatter={v=>`¥${Number(v).toLocaleString()}`} contentStyle={{fontSize:12,borderRadius:8,border:"1px solid #d4cce8"}}/>
          <Bar dataKey="jpy" fill="#a78bfa" radius={[3,3,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

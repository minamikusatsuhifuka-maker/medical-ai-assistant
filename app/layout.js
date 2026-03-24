export const metadata = {
  title: 'AI診療アシスタント',
  description: '音声書き起こし・カルテ要約AI',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&family=M+PLUS+Rounded+1c:wght@400;500;700&family=BIZ+UDGothic:wght@400;700&family=Noto+Sans+JP:wght@400;500;700&family=Shippori+Mincho:wght@400;500;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{__html: `(function(){try{var t=localStorage.getItem('mk_theme')||'pearl';var m={'pearl':'linear-gradient(135deg, #e8f8e0, #d8f4a8)','ultra-cream':'#fffefc','soft-linen':'#fefdf8','morning-cream':'#fffefc'};var b=m[t]||m['pearl'];document.documentElement.style.background=b;document.body&&(document.body.style.background=b)}catch(e){}})();`}} />
      </head>
      <body suppressHydrationWarning={true} style={{ margin: 0, fontFamily: "'Zen Maru Gothic', sans-serif", background: "transparent", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  )
}

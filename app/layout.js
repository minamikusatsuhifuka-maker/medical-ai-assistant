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
      </head>
      <body style={{ margin: 0, fontFamily: "'Zen Maru Gothic', sans-serif", background: "#ffffff", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  )
}

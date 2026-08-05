import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '임용고시 중국어',
  description: '매일 15분, 임용고시 중국어 대비 학습 앱',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

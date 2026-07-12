import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "蛙の葉書 — Kaeru Portfolio",
  description:
    "Helena — brand designer from Taiwan. Thoughtful brand experiences inspired by people, places, and everyday moments.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500&family=Zen+Kaku+Gothic+New:wght@400;700&family=Zen+Maru+Gothic:wght@700&family=Noto+Serif+TC:wght@500;600&family=Noto+Serif+JP:wght@500;600&family=Cormorant+Garamond:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

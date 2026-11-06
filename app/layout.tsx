import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Злой инвестор — твой стартап выдержит 5 вопросов?",
  description: "Тренажёр защиты стартапа: пять вопросов, десять критериев и три конкретных шага к сильному питчу.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}

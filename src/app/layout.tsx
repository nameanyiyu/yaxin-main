import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "亚信前置审批",
  description: "亚信科技合同前置审批与 AI 信息采集平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "亚信科技 - 合同审批信息填写",
  description: "请通过语音或文字回答以下问题，完成合同审批信息填写",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1E40AF",
  viewportFit: "cover",
};

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {children}
    </div>
  );
}

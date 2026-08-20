import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理后台 - 亚信科技域外合同前置审批语音 AI 助手",
  description: "亚信科技管理后台 - 模板管理、回传数据、系统设置",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

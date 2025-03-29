import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "飞书文档生成助手",
  description: "基于多维表格数据，快速生成标准文档",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 飞书多维表格SDK - 支持多版本 */}
        {/* 最新版官方SDK */}
        <Script 
          src="https://lf-cdn-tos.bytescm.com/obj/static/lark/js-sdk/custom-app-plugin-sdk.js"
          strategy="beforeInteractive"
        />
        
        {/* 旧版本兼容SDK - 作为备选 */}
        <Script 
          src="https://lf-cdn-tos.bytescm.com/obj/static/bitable-sdk/static-cdn/lark/js-sdk/0.6.31/bitable-sdk.umd.min.js" 
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

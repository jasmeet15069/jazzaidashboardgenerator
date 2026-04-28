import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Dashboard Generator",
  description: "Natural language analytics dashboard for MySQL data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omni Fabric",
  description: "AI agent team collaboration platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased text-sm">{children}</body>
    </html>
  );
}

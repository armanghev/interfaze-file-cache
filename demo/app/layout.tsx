import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interfaze cache check",
  description: "Does the bypass header work, and does vcache match what the cache does?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

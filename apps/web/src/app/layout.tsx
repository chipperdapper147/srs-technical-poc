import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Providers } from "@/platform/providers";
import { AppShell } from "@/views/app-shell/app-shell";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "SRS",
  description: "Spaced-repetition language learning tools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`font-sans ${geist.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

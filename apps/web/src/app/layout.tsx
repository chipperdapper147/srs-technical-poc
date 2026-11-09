import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { cn } from "@/lib/utils";
import "./globals.css";
import { Providers } from "./providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "SRS",
  description: "Spaced-repetition language learning tools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <header className="border-b">
            <nav className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3 text-sm">
              <Link href="/" className="font-semibold">
                SRS
              </Link>
              <Link href="/" className="text-muted-foreground hover:text-foreground">
                Courses
              </Link>
              <Link href="/settings" className="text-muted-foreground hover:text-foreground">
                Settings
              </Link>
            </nav>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

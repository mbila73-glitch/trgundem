import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Haber Özet — RSS Kaynaklı AI Özet Haber Sitesi",
  description:
    "RSS beslemelerinden haber içeriği çeken, her haberi yapay zeka ile 3 cümlede özetleyen modern bir Türkçe haber sitesi.",
  keywords: [
    "haber",
    "RSS",
    "AI özet",
    "yapay zeka",
    "haber özeti",
    "Türkçe haber",
    "Next.js",
  ],
  authors: [{ name: "Haber Özet" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Haber Özet — RSS + AI Özet",
    description:
      "RSS beslemelerinden haber içeriği çeken, yapay zeka ile 3 cümlede özetleyen haber sitesi.",
    siteName: "Haber Özet",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Haber Özet",
    description: "RSS + AI özetlenen Türkçe haber sitesi",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

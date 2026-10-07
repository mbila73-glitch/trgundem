import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
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
  title: "TÜRKİYEDEN HABER TRGUNDEM.NET",
  description:
    "Türkiye'nin gündeminden haberler. RSS kaynaklarından derlenen, yapay zeka ile özetlenen güncel haber sitesi.",
  keywords: [
    "Türkiye haber",
    "güncel haber",
    "trgundem",
    "Türkçe haber",
    "son dakika",
    "AI özet",
    "yapay zeka",
    "haber sitesi",
  ],
  authors: [{ name: "TRGUNDEM.NET" }],
  icons: {
    icon: "/trlogo2.jpg",
    apple: "/trlogo2.jpg",
  },
  openGraph: {
    title: "TÜRKİYEDEN HABER TRGUNDEM.NET",
    description:
      "Türkiye'nin gündeminden yapay zeka ile özetlenen güncel haber sitesi.",
    siteName: "TRGUNDEM.NET",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TÜRKİYEDEN HABER TRGUNDEM.NET",
    description: "Türkiye'nin gündeminden AI özetlenen haber sitesi",
  },
  alternates: {
    // RSS feed keşfi — tarayıcılar ve feed reader'lar otomatik algılar
    types: {
      "application/rss+xml": "https://trgundem.net/rss.xml",
    },
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
          <SonnerToaster position="top-center" richColors style={{ top: '40vh' }} duration={1000} />
        </ThemeProvider>
      </body>
    </html>
  );
}

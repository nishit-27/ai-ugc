import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import AuthSessionProvider from "@/components/auth/SessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI UGC Generator",
  description: "Create AI-powered UGC videos from TikTok content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://pub-dc1f12839d7f4746bd2b2974c8455b3d.r2.dev" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://pub-dc1f12839d7f4746bd2b2974c8455b3d.r2.dev" />
      </head>
      <body className="antialiased">
        <AuthSessionProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}

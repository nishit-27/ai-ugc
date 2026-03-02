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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@700&family=Oswald:wght@700&family=Playfair+Display:wght@700&family=Poppins:wght@700&family=Raleway:wght@700&family=Roboto:wght@700&display=swap"
          rel="stylesheet"
        />
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

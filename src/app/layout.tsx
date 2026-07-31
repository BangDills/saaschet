import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Google_Sans_Code } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  display: "swap",
});

const googleSansCode = Google_Sans_Code({
  variable: "--font-google-sans-code",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Celiuz AI — Create, Build, and Ship with AI",
  description:
    "One focused AI workspace for chat, code, product documents, images, copy, and natural speech.",
};

// interactiveWidget: the on-screen keyboard resizes the layout viewport instead
// of overlaying it, so the composer stays put when the keyboard opens.
// maximumScale 5 keeps pinch-zoom available (never disable it).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="bg-background" suppressHydrationWarning>
      <body
        className={`${plusJakartaSans.variable} ${googleSansCode.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

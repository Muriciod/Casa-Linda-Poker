import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#09090b" };

export const metadata: Metadata = {
  title: "Casa Linda Poker",
  description: "Administración simple y elegante para partidas privadas de póker.",
  icons: {
    icon: [{ url: "/casa-linda-icon.png", type: "image/png", sizes: "512x512" }],
    shortcut: "/casa-linda-icon.png",
    apple: [{ url: "/casa-linda-icon.png", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body></html>;
}

import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#09090b" };

export const metadata: Metadata = {
  title: "Casa Linda Poker",
  description: "Administración simple y elegante para partidas privadas de póker.",
  icons: {
    icon: [{ url: "/images/brand/favicon-48.png", type: "image/png", sizes: "48x48" }],
    shortcut: "/images/brand/favicon-48.png",
    apple: [{ url: "/images/brand/apple-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${geistSans.variable} antialiased`}>{children}</body></html>;
}

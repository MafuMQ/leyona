import type { Metadata } from "next";
import "./globals.css";
import "./trending.css";
import "./compact-cards.css";
import "./market-carousel.css";
export const metadata: Metadata = {
  title: "Leyona — Make your prediction",
  description:
    "Explore prediction markets. Trade ideas with simulated credits.",
  icons: {
    icon: [
      { url: "/brand/abacus.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/brand/icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico",
    apple: {
      url: "/brand/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

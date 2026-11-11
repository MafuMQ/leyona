import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Leyona — Make your prediction",
  description:
    "Explore prediction markets. Trade ideas with simulated credits.",
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

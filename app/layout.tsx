import type { Metadata } from "next";
import localFont from "next/font/local";
import Nav from "./nav";
import { siteUrl, siteTitle, siteDescription } from "@/lib/site";
import "./globals.css";

const newsreader = localFont({
  src: [
    { path: "./fonts/newsreader-latin-wght-normal.woff2", style: "normal" },
    { path: "./fonts/newsreader-latin-wght-italic.woff2", style: "italic" },
  ],
  weight: "200 800",
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s · ${siteTitle}`,
  },
  description: siteDescription,
  alternates: {
    types: { "application/rss+xml": "/rss.xml" },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body>
        <header>
          <Nav />
        </header>
        <main>{children}</main>
        <footer>
          <a href="https://github.com/pablopupo">GitHub</a>
          <a href="https://linkedin.com/in/pablopupo">LinkedIn</a>
          <a href="https://huggingface.co/Pablo305">Hugging Face</a>
          <a href="/rss.xml">RSS</a>
        </footer>
      </body>
    </html>
  );
}

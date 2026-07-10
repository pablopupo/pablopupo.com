import type { Metadata } from "next";
import Nav from "./nav";
import { siteUrl, siteTitle, siteDescription } from "@/lib/site";
import "./globals.css";

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
    <html lang="en">
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

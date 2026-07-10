import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/posts";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/projects", "/contributions", "/writing", "/about"].map((path) => ({
    url: `${siteUrl}${path}`,
  }));

  const posts = getPosts().map((post) => ({
    url: `${siteUrl}/writing/${post.slug}`,
    lastModified: post.date,
  }));

  return [...pages, ...posts];
}

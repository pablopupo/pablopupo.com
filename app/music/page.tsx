import type { Metadata } from "next";
import Link from "next/link";
import { getPosts, formatDate } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Music",
};

export default function Music() {
  const posts = getPosts().filter((post) => post.tags.includes("music"));

  return (
    <>
      <h1>Music</h1>
      <p>
        I&rsquo;m a classical pianist. Recordings, program notes, and thoughts
        on music land here, next to the theory work that feeds{" "}
        <a href="https://github.com/pablopupo/gradus-ad-parnassum">
          gradus-ad-parnassum
        </a>
        .
      </p>
      {posts.length > 0 ? (
        <ul className="posts">
          {posts.map((post) => (
            <li key={post.slug}>
              <div className="head">
                <Link href={`/writing/${post.slug}`}>{post.title}</Link>
              </div>
              <span className="meta">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                {" · "}
                {post.readMinutes} min read
              </span>
              {post.description && <p className="excerpt">{post.description}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="graph-note">Nothing posted yet.</p>
      )}
    </>
  );
}

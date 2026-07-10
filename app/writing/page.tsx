import type { Metadata } from "next";
import Link from "next/link";
import { getPosts, formatDate } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Writing",
};

export default function Writing() {
  const posts = getPosts();

  return (
    <>
      <h1>Writing</h1>
      <p>
        Essays land here. Rough notes are already public at{" "}
        <a href="https://github.com/pablopupo/notes">
          github.com/pablopupo/notes
        </a>
        .
      </p>
      {posts.length > 0 && (
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
      )}
    </>
  );
}

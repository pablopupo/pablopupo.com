import type { Metadata } from "next";
import Editor from "./editor";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function Admin() {
  return <Editor />;
}

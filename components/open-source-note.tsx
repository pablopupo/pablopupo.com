import Link from "@/components/page-link";
import { getContributions } from "@/lib/contributions";

export default function OpenSourceNote() {
  if (getContributions().length === 0) return null;

  return <p id="open-source" className="open-source-note">
    <span>I also enjoy contributing to open source.</span>
    <Link href="/work/contributions">View contributions</Link>
  </p>;
}

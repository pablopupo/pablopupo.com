import Link from "@/components/page-link";

export default function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p>
        Nothing lives at this address. Head back to the{" "}
        <Link href="/">front page</Link>.
      </p>
    </>
  );
}

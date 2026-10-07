import Image from "next/image";

export default function AccordoLogo() {
  return <Image
    className="accordo-logo"
    src="/brand/accordo-wordmark.png"
    alt="Accordo"
    width={4000}
    height={1129}
    sizes="240px"
  />;
}

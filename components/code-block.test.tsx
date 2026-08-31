import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

async function moduleUnderTest() {
  const module = await import("./code-block").catch(() => undefined);
  expect(module?.default).toBeTypeOf("function");
  expect(module?.copyCode).toBeTypeOf("function");
  expect(module?.copyButtonLabel).toBeTypeOf("function");
  return module!;
}

describe("CodeBlock", () => {
  it("renders the language class and an accessible copy control", async () => {
    const { default: CodeBlock } = await moduleUnderTest();

    const html = renderToStaticMarkup(
      <CodeBlock code={"const answer = 42;\n"} language="ts" />
    );

    expect(html).toContain('class="code-block"');
    expect(html).toContain('type="button"');
    expect(html).toContain('class="code-copy-button"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="language-ts"');
    expect(html).toContain("const answer = 42;");
    expect(html).toContain(">Copy</span>");
  });

  it("copies the exact source and reports success", async () => {
    const { copyCode } = await moduleUnderTest();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const code = "first line\nsecond line  \n";

    await expect(copyCode(code, { writeText })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledExactlyOnceWith(code);
  });

  it("reports unavailable or rejected clipboard writes without throwing", async () => {
    const { copyCode } = await moduleUnderTest();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));

    await expect(copyCode("source", { writeText })).resolves.toBe("failed");
    await expect(copyCode("source", undefined)).resolves.toBe("failed");
  });

  it("provides labels for every copy state", async () => {
    const { copyButtonLabel } = await moduleUnderTest();

    expect(copyButtonLabel("idle")).toBe("Copy");
    expect(copyButtonLabel("copied")).toBe("Copied");
    expect(copyButtonLabel("failed")).toBe("Copy failed");
  });
});

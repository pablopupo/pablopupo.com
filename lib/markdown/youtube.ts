import type { Root } from "mdast";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export type YoutubeDirectiveModel = {
  id: string;
  title: string | null;
};

type DirectiveNode = {
  type: "leafDirective" | "containerDirective" | "textDirective";
  name?: string;
  attributes?: Record<string, string | null> | null;
  children?: MarkdownNode[];
};

type ImageNode = {
  type: "image";
  url?: string;
};

type ImageReferenceNode = {
  type: "imageReference";
  identifier?: string;
};

type DefinitionNode = {
  type: "definition";
  identifier?: string;
  url?: string;
};

type HtmlNode = {
  type: "html";
  value?: string;
};

type MarkdownNode = {
  type: string;
  value?: string;
  name?: string;
  attributes?: Record<string, string | null> | null;
  children?: MarkdownNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

type WikilinkRange = {
  canonical: string;
  end: number;
  escaped: boolean;
  start: number;
};

type SourcePatch = {
  end: number;
  replacement: string;
  start: number;
};

const voidHtmlTags = new Set([
  "area",
  "base",
  "basefont",
  "bgsound",
  "link",
  "meta",
  "input",
  "embed",
  "param",
  "hr",
  "img",
  "source",
  "track",
  "br",
  "wbr",
  "col",
  "command",
  "keygen",
  "menuitem",
]);

export const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkStringify, {
    bullet: "-",
    fences: true,
    quote: '"',
  });

export function restoreAuthoringSyntax(markdown: string) {
  const tree = markdownProcessor.parse(markdown);
  const patches: SourcePatch[] = [];

  collectAuthoringRestorationPatches(
    tree as unknown as MarkdownNode,
    markdown,
    patches
  );

  return patches
    .sort((left, right) => right.start - left.start)
    .reduce(
      (restored, patch) =>
        restored.slice(0, patch.start) +
        patch.replacement +
        restored.slice(patch.end),
      markdown
    );
}

export function shouldPublishMarkdownUpdate(
  serialized: string,
  latest: string
) {
  return serialized !== latest;
}

function isDirectiveNode(node: { type?: string }): node is DirectiveNode {
  return (
    node.type === "leafDirective" ||
    node.type === "containerDirective" ||
    node.type === "textDirective"
  );
}

function isEscapedAt(source: string, index: number) {
  let backslashes = 0;
  let cursor = index;
  while (cursor > 0 && source[--cursor] === "\\") backslashes += 1;
  return backslashes % 2 === 1;
}

function findWikilinkRanges(source: string, includeEscaped: boolean) {
  const ranges: WikilinkRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const escapedOpening =
      includeEscaped &&
      source.startsWith("\\[\\[", cursor) &&
      !isEscapedAt(source, cursor);
    const plainOpening =
      source.startsWith("[[", cursor) && !isEscapedAt(source, cursor);

    if (!escapedOpening && !plainOpening) {
      cursor += 1;
      continue;
    }

    const contentStart = cursor + (escapedOpening ? 4 : 2);
    let closing = contentStart;
    while (closing < source.length) {
      if (source[closing] === "\n" || source[closing] === "\r") break;
      if (
        source.startsWith("]]", closing) &&
        !isEscapedAt(source, closing)
      ) {
        break;
      }
      closing += 1;
    }

    if (closing === contentStart || !source.startsWith("]]", closing)) {
      cursor += escapedOpening ? 4 : 2;
      continue;
    }

    const end = closing + 2;
    ranges.push({
      canonical: `[[${source.slice(contentStart, closing)}]]`,
      end,
      escaped: escapedOpening,
      start: cursor,
    });
    cursor = end;
  }

  return ranges;
}

function decodeTextSource(source: string) {
  const prefix = "a";
  const suffix = "b";
  const tree = markdownProcessor.parse(`${prefix}${source}${suffix}`);
  const root = tree as unknown as MarkdownNode;
  const paragraph = root.children?.[0];
  const paragraphChildren = paragraph?.children;

  if (
    root.children?.length !== 1 ||
    paragraph?.type !== "paragraph" ||
    paragraphChildren === undefined ||
    paragraphChildren.some((child) => child.type !== "text")
  ) {
    return null;
  }

  const decoded = paragraphChildren
    .map((child) => child.value ?? "")
    .join("");
  if (!decoded.startsWith(prefix) || !decoded.endsWith(suffix)) return null;
  return decoded.slice(prefix.length, -suffix.length);
}

function splitTextWikilinks(node: MarkdownNode, markdown: string) {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (
    node.type !== "text" ||
    typeof node.value !== "string" ||
    typeof start !== "number" ||
    typeof end !== "number"
  ) {
    return [node];
  }

  const source = markdown.slice(start, end);
  const ranges = findWikilinkRanges(source, false);
  if (ranges.length === 0) return [node];

  const children: MarkdownNode[] = [];
  let sourceCursor = 0;
  let valueCursor = 0;

  for (const range of ranges) {
    const before = decodeTextSource(source.slice(sourceCursor, range.start));
    const wikilink = decodeTextSource(source.slice(range.start, range.end));
    if (before === null || wikilink === null) return [node];
    if (!node.value.startsWith(before, valueCursor)) return [node];
    valueCursor += before.length;
    if (!node.value.startsWith(wikilink, valueCursor)) return [node];

    if (before.length > 0) children.push({ type: "text", value: before });
    children.push({ type: "html", value: range.canonical });
    valueCursor += wikilink.length;
    sourceCursor = range.end;
  }

  const after = decodeTextSource(source.slice(sourceCursor));
  if (after === null || node.value.slice(valueCursor) !== after) return [node];
  if (after.length > 0) children.push({ type: "text", value: after });
  return children;
}

function encodeDirectiveAttribute(value: string) {
  return value.replace(/["\n\r]/g, (character) =>
    `&#x${character.charCodeAt(0).toString(16).toUpperCase()};`
  );
}

function canonicalYoutubeDirective(node: MarkdownNode) {
  if (
    node.type !== "leafDirective" ||
    node.name !== "youtube" ||
    (node.children?.length ?? 0) > 0
  ) {
    return null;
  }

  const attributes = node.attributes ?? {};
  if (Object.keys(attributes).some((key) => key !== "id" && key !== "title")) {
    return null;
  }
  const id = attributes.id;
  if (typeof id !== "string" || !youtubeVideoIdPattern.test(id)) return null;

  const title = attributes.title;
  if (title !== undefined && title !== null && typeof title !== "string") {
    return null;
  }

  const titleAttribute =
    title === null
      ? " title"
      : typeof title === "string"
        ? ` title="${encodeDirectiveAttribute(title)}"`
        : "";
  return `::youtube{id="${id}"${titleAttribute}}`;
}

function updateRawHtmlStack(node: MarkdownNode, stack: string[]) {
  if (node.type !== "html" || typeof node.value !== "string") return;

  const tags = node.value.matchAll(
    /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*?)?(\/?)\s*>/g
  );
  for (const tag of tags) {
    const closing = tag[1] === "/";
    const name = tag[2]!.toLowerCase();
    const selfClosing = tag[3] === "/" || voidHtmlTags.has(name);
    if (closing) {
      const index = stack.lastIndexOf(name);
      if (index >= 0) stack.splice(index);
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
}

function sourceBackedHtmlNode(node: MarkdownNode, markdown: string) {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return node;
  return { type: "html", value: markdown.slice(start, end) };
}

function canonicalizeAuthoringTree(node: MarkdownNode, markdown: string) {
  if (!node.children) return;

  const rawHtmlStack: string[] = [];
  node.children = node.children.flatMap((child) => {
    const insideRawHtml = rawHtmlStack.length > 0;
    if (insideRawHtml) {
      updateRawHtmlStack(child, rawHtmlStack);
      return [sourceBackedHtmlNode(child, markdown)];
    }

    canonicalizeAuthoringTree(child, markdown);
    if (child.type === "html") {
      updateRawHtmlStack(child, rawHtmlStack);
      return [child];
    }
    if (child.type === "text") return splitTextWikilinks(child, markdown);

    const youtube = canonicalYoutubeDirective(child);
    return youtube === null ? [child] : [{ type: "html", value: youtube }];
  });
}

function collectAuthoringRestorationPatches(
  node: MarkdownNode,
  markdown: string,
  patches: SourcePatch[]
) {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;

  if (
    node.type === "text" &&
    typeof start === "number" &&
    typeof end === "number"
  ) {
    const source = markdown.slice(start, end);
    for (const range of findWikilinkRanges(source, true)) {
      if (!range.escaped) continue;
      patches.push({
        end: start + range.end,
        replacement: range.canonical,
        start: start + range.start,
      });
    }
  }

  const youtube = canonicalYoutubeDirective(node);
  if (
    youtube !== null &&
    typeof start === "number" &&
    typeof end === "number"
  ) {
    patches.push({ end, replacement: youtube, start });
    return;
  }

  const rawHtmlStack: string[] = [];
  for (const child of node.children ?? []) {
    if (rawHtmlStack.length > 0) {
      updateRawHtmlStack(child, rawHtmlStack);
      continue;
    }
    collectAuthoringRestorationPatches(child, markdown, patches);
    updateRawHtmlStack(child, rawHtmlStack);
  }
}

function normalizeReferenceIdentifier(value: string) {
  return value.replace(/[\t\n\r ]+/g, " ").trim().toLowerCase();
}

export function isSafeMarkdownImageUrl(value: string) {
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function analyzeAuthoringMarkdown(markdown: string) {
  const tree = markdownProcessor.parse(markdown);
  const youtube: YoutubeDirectiveModel[] = [];
  const issues: string[] = [];
  const definitions = new Map<string, string>();

  visit(tree, "definition", (node) => {
    const definition = node as DefinitionNode;
    if (
      typeof definition.identifier !== "string" ||
      typeof definition.url !== "string"
    ) {
      return;
    }
    const identifier = normalizeReferenceIdentifier(definition.identifier);
    if (!definitions.has(identifier)) {
      definitions.set(identifier, definition.url);
    }
  });

  visit(tree, (node) => {
    if (isDirectiveNode(node) && node.name === "youtube") {
      if (node.type !== "leafDirective") {
        issues.push("YouTube embeds must be a leaf directive");
        return;
      }
      if ((node.children?.length ?? 0) > 0) {
        issues.push("YouTube directives cannot contain caption text");
        return;
      }
      const attributes = node.attributes ?? {};
      if (Object.keys(attributes).some((key) => key !== "id" && key !== "title")) {
        issues.push("YouTube directives accept only id and title");
        return;
      }
      const id = attributes.id;
      if (typeof id !== "string" || !youtubeVideoIdPattern.test(id)) {
        issues.push("YouTube directives need an 11-character video ID");
        return;
      }
      const title = attributes.title;
      if (title !== undefined && title !== null && typeof title !== "string") {
        issues.push("YouTube directive titles must be text");
        return;
      }
      youtube.push({ id, title: title ?? null });
      return;
    }
    if (node.type === "image") {
      const image = node as ImageNode;
      if (typeof image.url !== "string" || !isSafeMarkdownImageUrl(image.url)) {
        issues.push("Markdown image URLs must use HTTP(S) or a site-relative path");
      }
      return;
    }
    if (node.type === "imageReference") {
      const image = node as ImageReferenceNode;
      if (typeof image.identifier !== "string") return;
      const url = definitions.get(normalizeReferenceIdentifier(image.identifier));
      if (url !== undefined && !isSafeMarkdownImageUrl(url)) {
        issues.push("Markdown image URLs must use HTTP(S) or a site-relative path");
      }
      return;
    }
    if (node.type === "html") {
      const html = node as HtmlNode;
      if (typeof html.value === "string" && /<\s*iframe\b/i.test(html.value)) {
        issues.push("YouTube iframe HTML is not allowed");
      }
    }
  });

  canonicalizeAuthoringTree(tree as unknown as MarkdownNode, markdown);

  return {
    canonicalMarkdown: markdownProcessor.stringify(tree as Root),
    issues,
    youtube,
  };
}

export function youtubeRenderModel(directive: YoutubeDirectiveModel) {
  if (!youtubeVideoIdPattern.test(directive.id)) {
    throw new Error("Invalid YouTube video ID");
  }
  return {
    id: directive.id,
    title: directive.title,
    embedUrl: `https://www.youtube-nocookie.com/embed/${directive.id}`,
  };
}

import {
  Fragment,
  createElement,
  type ReactNode,
} from "react";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  isSafeMarkdownImageUrl,
  youtubeRenderModel,
  youtubeVideoIdPattern,
} from "@/lib/markdown/youtube";

type MarkdownNode = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  lang?: string | null;
  url?: string;
  title?: string | null;
  alt?: string;
  name?: string;
  identifier?: string;
  attributes?: Record<string, string | null> | null;
  children?: MarkdownNode[];
};

type Definition = {
  url: string;
  title: string | null;
};

type RenderContext = {
  definitions: Map<string, Definition>;
  escapedWikilinkMarker: string;
};

const parser = unified().use(remarkParse).use(remarkDirective);
const wikilinkPattern = /\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g;

function safeLinkUrl(value: string) {
  if (/^\/(?!\/)/.test(value) || value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "mailto:") return value;
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    ) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeIdentifier(value: string) {
  return value.replace(/[\t\n\r ]+/g, " ").trim().toLowerCase();
}

function restoreEscapedWikilinks(value: string, marker: string) {
  return value.split(marker).join("[[");
}

function textWithWikilinks(
  value: string,
  key: string,
  context: RenderContext
): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  wikilinkPattern.lastIndex = 0;

  while ((match = wikilinkPattern.exec(value))) {
    if (match.index > cursor) {
      parts.push(
        restoreEscapedWikilinks(
          value.slice(cursor, match.index),
          context.escapedWikilinkMarker
        )
      );
    }
    const target = match[1]!.trim();
    const label = (match[2] || target).trim();
    const slug = target.toLowerCase().replace(/\s+/g, "-");
    parts.push(
      <a key={`${key}-${match.index}`} href={`/writing/${slug}`}>
        {label}
      </a>
    );
    cursor = match.index + match[0].length;
  }

  if (cursor === 0) {
    return restoreEscapedWikilinks(value, context.escapedWikilinkMarker);
  }
  if (cursor < value.length) {
    parts.push(
      restoreEscapedWikilinks(
        value.slice(cursor),
        context.escapedWikilinkMarker
      )
    );
  }
  return parts;
}

function children(node: MarkdownNode, key: string, context: RenderContext) {
  return (node.children ?? []).map((child, index) =>
    renderNode(child, `${key}-${index}`, context)
  );
}

function youtube(node: MarkdownNode, key: string) {
  if (
    node.type !== "leafDirective" ||
    node.name !== "youtube" ||
    (node.children?.length ?? 0) > 0
  ) {
    return null;
  }
  const attributes = node.attributes ?? {};
  if (Object.keys(attributes).some((name) => name !== "id" && name !== "title")) {
    return null;
  }
  const id = attributes.id;
  if (typeof id !== "string" || !youtubeVideoIdPattern.test(id)) return null;
  const title = attributes.title;
  if (title !== undefined && title !== null && typeof title !== "string") {
    return null;
  }
  const model = youtubeRenderModel({ id, title: title ?? null });
  return (
    <figure className="youtube-embed" key={key}>
      <iframe
        src={model.embedUrl}
        title={model.title || "YouTube video"}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </figure>
  );
}

function renderNode(
  node: MarkdownNode,
  key: string,
  context: RenderContext
): ReactNode {
  switch (node.type) {
    case "root":
      return <Fragment key={key}>{children(node, key, context)}</Fragment>;
    case "text":
      return textWithWikilinks(node.value ?? "", key, context);
    case "paragraph":
      return <p key={key}>{children(node, key, context)}</p>;
    case "heading": {
      const depth = Math.min(6, Math.max(1, node.depth ?? 2));
      return createElement(`h${depth}`, { key }, children(node, key, context));
    }
    case "strong":
      return <strong key={key}>{children(node, key, context)}</strong>;
    case "emphasis":
      return <em key={key}>{children(node, key, context)}</em>;
    case "delete":
      return <del key={key}>{children(node, key, context)}</del>;
    case "inlineCode":
      return (
        <code key={key}>
          {restoreEscapedWikilinks(
            node.value ?? "",
            context.escapedWikilinkMarker
          )}
        </code>
      );
    case "code": {
      const language = node.lang?.replace(/[^A-Za-z0-9_+-]/g, "");
      return (
        <pre key={key}>
          <code className={language ? `language-${language}` : undefined}>
            {restoreEscapedWikilinks(
              node.value ?? "",
              context.escapedWikilinkMarker
            )}
          </code>
        </pre>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{children(node, key, context)}</blockquote>;
    case "list":
      return node.ordered ? (
        <ol key={key} start={node.start ?? undefined}>
          {children(node, key, context)}
        </ol>
      ) : (
        <ul key={key}>{children(node, key, context)}</ul>
      );
    case "listItem":
      return <li key={key}>{children(node, key, context)}</li>;
    case "thematicBreak":
      return <hr key={key} />;
    case "break":
      return <br key={key} />;
    case "link": {
      const href = node.url ? safeLinkUrl(node.url) : null;
      return href ? (
        <a key={key} href={href} title={node.title ?? undefined}>
          {children(node, key, context)}
        </a>
      ) : (
        <span key={key}>{children(node, key, context)}</span>
      );
    }
    case "image": {
      const src = node.url;
      return src && isSafeMarkdownImageUrl(src) ? (
        <img
          key={key}
          src={src}
          alt={node.alt ?? ""}
          title={node.title ?? undefined}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span key={key}>{node.alt ?? ""}</span>
      );
    }
    case "linkReference": {
      const definition = node.identifier
        ? context.definitions.get(normalizeIdentifier(node.identifier))
        : undefined;
      const href = definition ? safeLinkUrl(definition.url) : null;
      return href ? (
        <a key={key} href={href} title={definition?.title ?? undefined}>
          {children(node, key, context)}
        </a>
      ) : (
        <span key={key}>{children(node, key, context)}</span>
      );
    }
    case "imageReference": {
      const definition = node.identifier
        ? context.definitions.get(normalizeIdentifier(node.identifier))
        : undefined;
      return definition && isSafeMarkdownImageUrl(definition.url) ? (
        <img
          key={key}
          src={definition.url}
          alt={node.alt ?? ""}
          title={definition.title ?? undefined}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span key={key}>{node.alt ?? ""}</span>
      );
    }
    case "html":
      return (
        <code className="raw-html" key={key}>
          {restoreEscapedWikilinks(
            node.value ?? "",
            context.escapedWikilinkMarker
          )}
        </code>
      );
    case "leafDirective":
      return youtube(node, key);
    case "containerDirective":
    case "textDirective":
      return <Fragment key={key}>{children(node, key, context)}</Fragment>;
    case "definition":
      return null;
    default:
      return <Fragment key={key}>{children(node, key, context)}</Fragment>;
  }
}

function protectedMarkdown(markdown: string) {
  let marker = "\uE000wikilink\uE001";
  while (markdown.includes(marker)) marker += "\uE001";
  return {
    marker,
    markdown: markdown.replace(/\\\[(?:\\\[|\[)/g, marker),
  };
}

function definitions(root: MarkdownNode) {
  const values = new Map<string, Definition>();
  for (const node of root.children ?? []) {
    if (
      node.type === "definition" &&
      typeof node.identifier === "string" &&
      typeof node.url === "string"
    ) {
      const identifier = normalizeIdentifier(node.identifier);
      if (!values.has(identifier)) {
        values.set(identifier, {
          url: node.url,
          title: node.title ?? null,
        });
      }
    }
  }
  return values;
}

export default function MarkdownContent({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const protectedSource = protectedMarkdown(markdown);
  const tree = parser.parse(protectedSource.markdown) as unknown as MarkdownNode;
  const context = {
    definitions: definitions(tree),
    escapedWikilinkMarker: protectedSource.marker,
  };
  const classes = className
    ? `markdown-content ${className}`
    : "markdown-content";
  return <div className={classes}>{renderNode(tree, "root", context)}</div>;
}

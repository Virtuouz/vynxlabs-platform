import type { ReactNode } from "react";

/**
 * A small part of Markdown, drawn as React elements: headings, paragraphs,
 * lists, quotes, rules, fenced code, and inline code, bold, italics and links.
 * Text is never read as HTML, so a value cannot put markup or script on the
 * page; a link goes only to http, https or mailto.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="flex flex-col gap-2 leading-relaxed">{blocks(text)}</div>;
}

const SAFE_LINK = /^(https?:|mailto:)/i;

/** Whether a link may be followed from the page. */
export function safeHref(href: string): string | undefined {
  const trimmed = href.trim();
  return SAFE_LINK.test(trimmed) ? trimmed : undefined;
}

function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let index = 0;
  let key = 0;
  while (index < lines.length) {
    const line = lines[index] as string;
    if (line.trim() === "") {
      index++;
      continue;
    }
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const body: string[] = [];
      index++;
      while (
        index < lines.length &&
        !(lines[index] as string).trim().startsWith(fence[1] as string)
      ) {
        body.push(lines[index] as string);
        index++;
      }
      index++;
      out.push(
        <pre
          key={key++}
          className="m-0 overflow-x-auto rounded-control border border-line bg-sunken p-3 font-mono text-[12.5px]"
        >
          {body.join("\n")}
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] as string).length;
      const size = level === 1 ? "text-lg" : level === 2 ? "text-base" : "text-sm";
      const Tag = `h${Math.min(level + 2, 6)}` as "h3";
      out.push(
        <Tag key={key++} className={`m-0 font-semibold ${size}`}>
          {inline(heading[2] as string)}
        </Tag>,
      );
      index++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(<hr key={key++} className="my-1 border-line" />);
      index++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index] as string)) {
        body.push((lines[index] as string).replace(/^\s*>\s?/, ""));
        index++;
      }
      out.push(
        <blockquote key={key++} className="m-0 border-l-2 border-line pl-3 text-ink-muted">
          {blocks(body.join("\n"))}
        </blockquote>,
      );
      continue;
    }
    const bullet = /^\s*([-*+]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (index < lines.length && bullet.test(lines[index] as string)) {
        items.push((lines[index] as string).replace(bullet, ""));
        index++;
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={key++} className={`m-0 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((item, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no identity but their place
            <li key={at}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] as string).trim() !== "" &&
      !/^(#{1,6}\s|\s*(```|~~~|>)|\s*([-*+]|\d+[.)])\s+)/.test(lines[index] as string)
    ) {
      paragraph.push((lines[index] as string).trim());
      index++;
    }
    out.push(
      <p key={key++} className="m-0">
        {inline(paragraph.join(" "))}
      </p>,
    );
  }
  return out;
}

const INLINE =
  /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [whole, code, bold1, bold2, em1, em2, label, href] = match;
    if (code !== undefined) {
      out.push(
        <code key={key++} className="rounded-[4px] bg-sunken px-1 font-mono text-[12.5px]">
          {code}
        </code>,
      );
    } else if (bold1 !== undefined || bold2 !== undefined) {
      out.push(<strong key={key++}>{inline((bold1 ?? bold2) as string)}</strong>);
    } else if (em1 !== undefined || em2 !== undefined) {
      out.push(<em key={key++}>{inline((em1 ?? em2) as string)}</em>);
    } else if (label !== undefined && href !== undefined) {
      const safe = safeHref(href);
      out.push(
        safe ? (
          <a
            key={key++}
            href={safe}
            target="_blank"
            rel="noopener noreferrer"
            className="text-action"
          >
            {inline(label)}
          </a>
        ) : (
          whole
        ),
      );
    }
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

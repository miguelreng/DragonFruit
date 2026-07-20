export type AtlasMentionType = "doc" | "sticky" | "task";

export type AtlasMentionReference = {
  id: string;
  insertText: string;
  title: string;
  type: AtlasMentionType;
  subtitle: string;
  projectId?: string;
  content?: string;
};

export type AtlasMentionMatch = { from: number; to: number; query: string };

export function getAtlasMentionToken(title: string, type: AtlasMentionType): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `@${slug || type}`;
}

/** Finds an @token immediately before the cursor (the composer currently edits at the end). */
export function getAtlasMentionMatch(value: string, cursorPosition = value.length): AtlasMentionMatch | null {
  const beforeCursor = value.slice(0, cursorPosition);
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCursor);
  if (!match) return null;

  const query = match[2] ?? "";
  return { from: cursorPosition - query.length - 1, to: cursorPosition, query };
}

export function buildAtlasMentionsContext(references: AtlasMentionReference[]): string {
  const unique = references.filter(
    (reference, index, list) =>
      list.findIndex((candidate) => candidate.type === reference.type && candidate.id === reference.id) === index
  );
  if (unique.length === 0) return "";

  return [
    "Referenced entities selected in the Atlas mobile composer. Resolve the @mentions against these records.",
    ...unique
      .slice(0, 8)
      .map((reference, index) =>
        [
          `Reference ${index + 1}: ${reference.subtitle} - ${reference.title}`,
          `Mention: ${reference.insertText}`,
          `ID: ${reference.id}`,
          reference.projectId ? `Project ID: ${reference.projectId}` : "",
          reference.content?.trim() ? `Content excerpt:\n${reference.content.trim().slice(0, 2500)}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      ),
  ].join("\n\n");
}

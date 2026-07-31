const API_ORIGIN = "https://api.dragonfruit.sh";
const PUBLIC_ORIGIN = "https://dragonfruit.page";

const PUBLIC_PAGE_TYPES = new Set(["auto", "doc", "pdf", "sheet", "whiteboard", "wiki"]);
const PUBLIC_IDENTIFIER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{0,126}[a-zA-Z0-9])?$/;

const TYPE_LABELS = {
  doc: "Document",
  pdf: "PDF",
  sheet: "Sheet",
  whiteboard: "Whiteboard",
  wiki: "Wiki",
};

const CONFLICTING_META_KEYS = new Set([
  "description",
  "og:description",
  "og:image",
  "og:image:alt",
  "og:image:height",
  "og:image:width",
  "og:site_name",
  "og:title",
  "og:type",
  "og:url",
  "twitter:card",
  "twitter:description",
  "twitter:image",
  "twitter:image:alt",
  "twitter:image:height",
  "twitter:image:width",
  "twitter:site",
  "twitter:title",
]);

const NAMED_HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export const decodeHtmlEntities = (value) =>
  value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, token) => {
    if (token.startsWith("#x") || token.startsWith("#X")) {
      const codePoint = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    if (token.startsWith("#")) {
      const codePoint = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }

    return NAMED_HTML_ENTITIES[token.toLowerCase()] ?? entity;
  });

export const htmlToPlainText = (html = "") =>
  decodeHtmlEntities(
    html
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?\s*>|<\/(?:p|div|h[1-6]|li|blockquote|section|article)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

export const htmlToDescription = (html = "") => {
  const paragraphDescription = Array.from(html.matchAll(/<p\b[^>]*>([^]*?)<\/p>/gi))
    .map((match) => htmlToPlainText(match[1]))
    .find((candidate) => candidate.length >= 20);

  return paragraphDescription ?? htmlToPlainText(html);
};

export const truncateText = (value, maxLength) => {
  const characters = Array.from(String(value ?? "").trim());
  if (characters.length <= maxLength) return characters.join("");

  const candidate = characters.slice(0, Math.max(1, maxLength - 1)).join("");
  const lastWhitespace = candidate.lastIndexOf(" ");
  const boundary = lastWhitespace >= Math.floor(maxLength * 0.6) ? lastWhitespace : candidate.length;
  return `${candidate.slice(0, boundary).trimEnd()}…`;
};

export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const formatWorkspaceName = (workspaceIdentifier) =>
  workspaceIdentifier
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

export const normalizePublicPageRequest = ({ pageSlug, pageType = "auto", workspaceIdentifier }) => {
  const normalizedWorkspace = String(workspaceIdentifier ?? "").trim();
  const normalizedPageSlug = String(pageSlug ?? "").trim();
  const normalizedPageType = String(pageType ?? "auto")
    .trim()
    .toLowerCase();

  if (
    !PUBLIC_IDENTIFIER_PATTERN.test(normalizedWorkspace) ||
    !PUBLIC_IDENTIFIER_PATTERN.test(normalizedPageSlug) ||
    !PUBLIC_PAGE_TYPES.has(normalizedPageType)
  ) {
    return null;
  }

  return {
    pageSlug: normalizedPageSlug,
    pageType: normalizedPageType,
    workspaceIdentifier: normalizedWorkspace,
  };
};

const readPageEmoji = (logoProps) => {
  if (!logoProps || logoProps.in_use !== "emoji") return null;
  const value = logoProps.emoji?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const resolvePageType = (requestedPageType, apiPageType) => {
  if (requestedPageType !== "auto") return requestedPageType;
  if (apiPageType === "folder") return "wiki";
  return PUBLIC_PAGE_TYPES.has(apiPageType) && apiPageType !== "auto" ? apiPageType : "doc";
};

const fetchJson = async (url, fetchImpl) => {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) return { data: null, status: response.status };
  return { data: await response.json(), status: response.status };
};

export const fetchPublicPageMetadata = async (input, fetchImpl = fetch) => {
  const request = normalizePublicPageRequest(input);
  if (!request) return { metadata: null, status: 400 };

  const pageUrl = new URL(
    `/api/public/workspaces/${encodeURIComponent(request.workspaceIdentifier)}/pages/${encodeURIComponent(request.pageSlug)}/`,
    API_ORIGIN
  );

  try {
    const pageResult = await fetchJson(pageUrl, fetchImpl);
    if (!pageResult.data) return { metadata: null, status: pageResult.status };

    const page = pageResult.data;
    const isProjectBrief = page.page_type === "doc" && String(page.name ?? "").trim() === "Project Brief";
    let projectName = "";

    if (isProjectBrief && page.project_id) {
      const projectUrl = new URL(
        `/api/public/workspaces/${encodeURIComponent(request.workspaceIdentifier)}/projects/${encodeURIComponent(page.project_id)}/anchor/`,
        API_ORIGIN
      );
      const projectResult = await fetchJson(projectUrl, fetchImpl);
      projectName = String(projectResult.data?.project_details?.name ?? "").trim();
    }

    const pageType = resolvePageType(request.pageType, page.page_type);
    const title = projectName || String(page.name ?? "").trim() || "Untitled";
    const workspaceName = formatWorkspaceName(request.workspaceIdentifier) || "Public page";
    const typeLabel = isProjectBrief ? "Brief" : (TYPE_LABELS[pageType] ?? "Document");
    const plainText = htmlToDescription(page.description_html);
    const description = truncateText(plainText || `A public ${typeLabel.toLowerCase()} from ${workspaceName}.`, 200);
    const canonicalUrl = new URL(
      `/${encodeURIComponent(request.workspaceIdentifier)}/${pageType}/${encodeURIComponent(request.pageSlug)}`,
      PUBLIC_ORIGIN
    ).toString();
    const imageUrl = new URL("/api/public-page-image", PUBLIC_ORIGIN);
    imageUrl.searchParams.set("workspaceIdentifier", request.workspaceIdentifier);
    imageUrl.searchParams.set("pageType", pageType);
    imageUrl.searchParams.set("pageSlug", request.pageSlug);

    return {
      metadata: {
        author: String(page.owned_by?.display_name ?? "").trim(),
        canonicalUrl,
        description,
        emoji: readPageEmoji(page.logo_props),
        imageUrl: imageUrl.toString(),
        pageSlug: request.pageSlug,
        pageType,
        title,
        typeLabel,
        updatedAt: page.updated_at ? String(page.updated_at) : null,
        workspaceIdentifier: request.workspaceIdentifier,
        workspaceName,
      },
      status: 200,
    };
  } catch {
    return { metadata: null, status: 502 };
  }
};

const readMetaKey = (tag) => {
  const propertyMatch = tag.match(/\bproperty\s*=\s*["']([^"']+)["']/i);
  if (propertyMatch) return propertyMatch[1].toLowerCase();
  const nameMatch = tag.match(/\bname\s*=\s*["']([^"']+)["']/i);
  return nameMatch?.[1]?.toLowerCase() ?? null;
};

export const renderPublicPageHead = (metadata) => {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonicalUrl = escapeHtml(metadata.canonicalUrl);
  const imageUrl = escapeHtml(metadata.imageUrl);
  const workspaceName = escapeHtml(metadata.workspaceName);
  const modifiedTime = metadata.updatedAt
    ? `<meta property="article:modified_time" content="${escapeHtml(metadata.updatedAt)}">`
    : "";

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${canonicalUrl}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${canonicalUrl}">`,
    `<meta property="og:site_name" content="${workspaceName}">`,
    `<meta property="og:image" content="${imageUrl}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${title}">`,
    modifiedTime,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${imageUrl}">`,
    `<meta name="twitter:image:alt" content="${title}">`,
  ]
    .filter(Boolean)
    .join("\n");
};

export const injectPublicPageMetadata = (html, metadata) => {
  const cleanedHtml = html
    .replace(/<title\b[^>]*>[^]*?<\/title>\s*/gi, "")
    .replace(/<meta\b[^>]*>\s*/gi, (tag) => (CONFLICTING_META_KEYS.has(readMetaKey(tag)) ? "" : tag))
    .replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>\s*/gi, "");
  const pageHead = renderPublicPageHead(metadata);

  if (/<\/head>/i.test(cleanedHtml)) return cleanedHtml.replace(/<\/head>/i, `${pageHead}\n</head>`);
  return `${pageHead}\n${cleanedHtml}`;
};

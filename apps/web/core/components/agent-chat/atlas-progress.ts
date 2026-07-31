import type { TAgentChatProgressEvent, TAtlasDocWriteProgressEvent } from "@/services/agent-chat.service";

export type TAtlasPromptLanguage = "en" | "es";

const SPANISH_STRONG_SIGNAL =
  /\b(?:actualiza|cambia|crea|escribe|haz|prepara|reemplaza|resume|trad[uú]c(?:e(?:lo|la|los|las)?|ir|ción)|documento|página|párrafo)\b/i;
const SPANISH_COMMON_WORDS = new Set([
  "como",
  "con",
  "del",
  "el",
  "en",
  "esta",
  "este",
  "la",
  "las",
  "lo",
  "los",
  "mi",
  "para",
  "por",
  "que",
  "sin",
  "todo",
  "una",
]);

export function getAtlasPromptLanguage(prompt: string): TAtlasPromptLanguage {
  const text = prompt.trim().toLowerCase();
  if (/[¿¡ñáéíóúü]/i.test(text) || SPANISH_STRONG_SIGNAL.test(text)) return "es";
  const spanishWordCount = (text.match(/[a-záéíóúüñ]+/gi) ?? []).filter((word) =>
    SPANISH_COMMON_WORDS.has(word)
  ).length;
  return spanishWordCount >= 2 ? "es" : "en";
}

export function getInitialAtlasProgressLabel(language: TAtlasPromptLanguage, hasAttachments = false): string {
  if (language === "es") {
    return hasAttachments ? "Leyendo tu solicitud y los archivos adjuntos…" : "Revisando tu solicitud…";
  }
  return hasAttachments ? "Reading your request and attachments…" : "Reviewing your request…";
}

const TOOL_LABELS: Record<string, { en: string; es: string }> = {
  add_sheet_chart: { en: "Preparing the chart…", es: "Preparando el gráfico…" },
  composio_execute_tool: { en: "Working with the connected app…", es: "Trabajando con la aplicación conectada…" },
  composio_get_tool_schemas: {
    en: "Checking the connected app’s capabilities…",
    es: "Revisando las opciones de la aplicación conectada…",
  },
  composio_manage_connections: { en: "Checking the app connection…", es: "Revisando la conexión de la aplicación…" },
  composio_search_tools: { en: "Finding the right connected action…", es: "Buscando la acción conectada adecuada…" },
  create_document: { en: "Preparing the document…", es: "Preparando el documento…" },
  create_sheet: { en: "Preparing the spreadsheet…", es: "Preparando la hoja de cálculo…" },
  create_sticky: { en: "Preparing the sticky note…", es: "Preparando la nota adhesiva…" },
  create_task: { en: "Preparing the task…", es: "Preparando la tarea…" },
  create_wikipedia_brief: { en: "Preparing a sourced brief…", es: "Preparando un brief con fuentes…" },
  fetch_url: { en: "Reading the source…", es: "Leyendo la fuente…" },
  lookup_wikipedia: { en: "Checking Wikipedia…", es: "Consultando Wikipedia…" },
  search_workspace: { en: "Searching your workspace…", es: "Buscando en tu espacio de trabajo…" },
  set_cells: { en: "Preparing the cell updates…", es: "Preparando los cambios en las celdas…" },
  update_project_brief: { en: "Preparing the project brief…", es: "Preparando el brief del proyecto…" },
  update_sheet: { en: "Preparing the spreadsheet changes…", es: "Preparando los cambios en la hoja…" },
  web_search: { en: "Searching the web…", es: "Buscando en la web…" },
};

export function getAtlasChatProgressLabel(event: TAgentChatProgressEvent, language: TAtlasPromptLanguage): string {
  if (event.stage === "tool_started") {
    return (
      TOOL_LABELS[event.tool ?? ""]?.[language] ??
      (language === "es" ? "Consultando una herramienta…" : "Using a tool…")
    );
  }
  if (event.stage === "tool_completed") {
    return language === "es" ? "Revisando lo que encontré…" : "Reviewing what I found…";
  }
  if (event.stage === "synthesizing") {
    return language === "es"
      ? "Preparando la respuesta con esos resultados…"
      : "Preparing a response from those results…";
  }
  if (event.stage === "retrying") {
    return language === "es" ? "Reintentando la respuesta de forma segura…" : "Retrying the response safely…";
  }
  return language === "es"
    ? "Revisando tu solicitud y el contexto disponible…"
    : "Reviewing your request and available context…";
}

export function getAtlasDocWriteProgressLabel(
  event: TAtlasDocWriteProgressEvent,
  language: TAtlasPromptLanguage
): string {
  if (event.stage === "reading_document") {
    if (event.total_blocks) {
      return language === "es"
        ? `Leyendo ${event.total_blocks} secciones editables…`
        : `Reading ${event.total_blocks} editable sections…`;
    }
    return language === "es" ? "Leyendo el documento…" : "Reading the document…";
  }
  if (event.stage === "checking_matches") {
    return language === "es"
      ? "Buscando coincidencias exactas en cada sección…"
      : "Checking every section for exact matches…";
  }
  if (event.stage === "researching") {
    return language === "es" ? "Consultando material de referencia…" : "Checking reference material…";
  }
  if (event.stage === "drafting") {
    if (event.current_start && event.current_end && event.total_blocks) {
      return language === "es"
        ? `Preparando cambios para las secciones ${event.current_start}–${event.current_end} de ${event.total_blocks}…`
        : `Drafting changes for sections ${event.current_start}–${event.current_end} of ${event.total_blocks}…`;
    }
    return language === "es" ? "Preparando los cambios del documento…" : "Drafting the document changes…";
  }
  if (event.proposal_count) {
    return language === "es"
      ? `Preparando ${event.proposal_count} ${event.proposal_count === 1 ? "cambio" : "cambios"} para revisión…`
      : `Preparing ${event.proposal_count} ${event.proposal_count === 1 ? "change" : "changes"} for review…`;
  }
  return language === "es" ? "Terminando la revisión del documento…" : "Finishing the document review…";
}

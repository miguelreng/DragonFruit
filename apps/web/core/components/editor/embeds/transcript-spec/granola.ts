/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Detect and clean Granola meeting exports so the LLM sees just the conversation,
 * not Granola's pre-cooked summary, attendee block, and timestamp clutter.
 *
 * The cleaner is conservative: if the input doesn't look like Granola, it returns
 * the original text unchanged.
 */

const METADATA_LINE = /^(date|duration|attendees|participants|recorded by|location|meeting type)\s*:\s*/i;
const SECTION_HEADER = /^#{1,6}\s+(.+?)\s*$/;
const TIMESTAMP_PREFIX = /^[[(]?\s*\d{1,2}:\d{2}(?::\d{2})?\s*[\])]?\s+/;
const SPEAKER_WITH_TIMESTAMP = /^([A-Z][\w. '-]{0,40})\s*[[(]\s*\d{1,2}:\d{2}(?::\d{2})?\s*[\])]\s*:?\s*/;

const SECTIONS_TO_DROP = new Set([
  "summary",
  "key takeaways",
  "highlights",
  "tldr",
  "tl;dr",
  "ai summary",
  "ai notes",
  "granola summary",
]);

const TRANSCRIPT_HEADERS = new Set(["transcript", "full transcript", "raw transcript", "conversation", "verbatim"]);

export type CleanResult = {
  cleaned: string;
  source: "granola" | "google" | null;
  removedMetadataLines: number;
  removedTimestampMarkers: number;
  keptOnlyTranscriptSection: boolean;
};

const GOOGLE_METADATA_LINE =
  /^(date|time|meeting id|location|attendees|participants|meeting link|organizer|recurring|guests)\s*:\s*/i;
const GOOGLE_SECTION_HEADERS_TO_DROP = new Set([
  "summary",
  "meeting summary",
  "ai summary",
  "notes summary",
  "key takeaways",
  "action items",
  "tasks",
]);
const GOOGLE_TRANSCRIPT_HEADERS = new Set([
  "transcript",
  "meeting transcript",
  "notes",
  "discussion",
  "full transcript",
]);
const GOOGLE_TIMESTAMP_SPEAKER = /^\s*\[\d{1,2}:\d{2}(?::\d{2})?\]\s*([A-Z][\w. '-]{0,50})\s*:?\s*/;
const GOOGLE_MEET_HINT = /(google meet|meeting notes by gemini|take notes for me|meeting notes)/i;

export function looksLikeGranolaExport(input: string): boolean {
  if (!input || input.length < 80) return false;
  let signals = 0;

  const lines = input.split(/\r?\n/);
  const head = lines.slice(0, 25);

  if (head.some((l) => METADATA_LINE.test(l.trim()))) signals++;
  if (lines.some((l) => /^##\s+/i.test(l.trim()))) signals++;
  if (lines.some((l) => TIMESTAMP_PREFIX.test(l.trim()) || SPEAKER_WITH_TIMESTAMP.test(l.trim()))) signals++;
  if (/granola/i.test(head.join("\n"))) signals += 2;

  return signals >= 2;
}

export function cleanGranolaExport(input: string): CleanResult {
  if (!looksLikeGranolaExport(input)) {
    return {
      cleaned: input,
      source: null,
      removedMetadataLines: 0,
      removedTimestampMarkers: 0,
      keptOnlyTranscriptSection: false,
    };
  }

  const lines = input.split(/\r?\n/);
  let removedMetadataLines = 0;
  let removedTimestampMarkers = 0;

  // Step 1: if there's an explicit "## Transcript" section, drop everything before it.
  let startIdx = 0;
  let keptOnlyTranscriptSection = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(SECTION_HEADER);
    if (m && TRANSCRIPT_HEADERS.has(m[1].toLowerCase())) {
      startIdx = i + 1;
      keptOnlyTranscriptSection = true;
      break;
    }
  }

  // Step 2: walk forward, dropping metadata blocks and Granola's own summary sections.
  const out: string[] = [];
  let dropping = false;
  for (let i = startIdx; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Section headers: decide whether to drop the upcoming block.
    const sectionMatch = line.match(SECTION_HEADER);
    if (sectionMatch) {
      const name = sectionMatch[1].toLowerCase();
      if (SECTIONS_TO_DROP.has(name)) {
        dropping = true;
        continue;
      }
      // Any other section header re-enables emission.
      dropping = false;
      // Don't emit the section header itself — model doesn't need it.
      continue;
    }

    if (dropping) continue;

    if (!line) {
      // Preserve blank lines between paragraphs (but not consecutive ones).
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }

    if (METADATA_LINE.test(line)) {
      removedMetadataLines++;
      continue;
    }

    // Strip leading timestamp markers and `Speaker (00:01)` style prefixes.
    let cleanedLine = rawLine;
    const speakerMatch = cleanedLine.match(SPEAKER_WITH_TIMESTAMP);
    if (speakerMatch) {
      cleanedLine = cleanedLine.replace(SPEAKER_WITH_TIMESTAMP, `${speakerMatch[1]}: `);
      removedTimestampMarkers++;
    } else if (TIMESTAMP_PREFIX.test(cleanedLine)) {
      cleanedLine = cleanedLine.replace(TIMESTAMP_PREFIX, "");
      removedTimestampMarkers++;
    }

    out.push(cleanedLine);
  }

  // Trim trailing blank lines.
  while (out.length > 0 && out[out.length - 1] === "") out.pop();

  return {
    cleaned: out.join("\n"),
    source: "granola",
    removedMetadataLines,
    removedTimestampMarkers,
    keptOnlyTranscriptSection,
  };
}

export function looksLikeGoogleMeetingNotesExport(input: string): boolean {
  if (!input || input.length < 80) return false;
  let signals = 0;

  const lines = input.split(/\r?\n/);
  const head = lines.slice(0, 30).map((line) => line.trim());
  const headText = head.join("\n");

  if (GOOGLE_MEET_HINT.test(headText)) signals += 2;
  if (head.some((line) => GOOGLE_METADATA_LINE.test(line))) signals++;
  if (lines.some((line) => GOOGLE_TIMESTAMP_SPEAKER.test(line))) signals++;
  if (lines.some((line) => /^#{1,6}\s+/.test(line.trim()))) signals++;

  return signals >= 2;
}

export function cleanGoogleMeetingNotesExport(input: string): CleanResult {
  if (!looksLikeGoogleMeetingNotesExport(input)) {
    return {
      cleaned: input,
      source: null,
      removedMetadataLines: 0,
      removedTimestampMarkers: 0,
      keptOnlyTranscriptSection: false,
    };
  }

  const lines = input.split(/\r?\n/);
  let removedMetadataLines = 0;
  let removedTimestampMarkers = 0;

  let startIdx = 0;
  let keptOnlyTranscriptSection = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(SECTION_HEADER);
    if (m && GOOGLE_TRANSCRIPT_HEADERS.has(m[1].toLowerCase())) {
      startIdx = i + 1;
      keptOnlyTranscriptSection = true;
      break;
    }
  }

  const out: string[] = [];
  let dropping = false;
  for (let i = startIdx; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    const sectionMatch = line.match(SECTION_HEADER);

    if (sectionMatch) {
      const name = sectionMatch[1].toLowerCase();
      dropping = GOOGLE_SECTION_HEADERS_TO_DROP.has(name);
      continue;
    }

    if (dropping) continue;

    if (!line) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }

    if (GOOGLE_METADATA_LINE.test(line)) {
      removedMetadataLines++;
      continue;
    }

    let cleanedLine = rawLine;
    const timestampSpeakerMatch = cleanedLine.match(GOOGLE_TIMESTAMP_SPEAKER);
    if (timestampSpeakerMatch) {
      cleanedLine = cleanedLine.replace(GOOGLE_TIMESTAMP_SPEAKER, `${timestampSpeakerMatch[1]}: `);
      removedTimestampMarkers++;
    } else if (TIMESTAMP_PREFIX.test(cleanedLine)) {
      cleanedLine = cleanedLine.replace(TIMESTAMP_PREFIX, "");
      removedTimestampMarkers++;
    }

    out.push(cleanedLine);
  }

  while (out.length > 0 && out[out.length - 1] === "") out.pop();

  return {
    cleaned: out.join("\n"),
    source: "google",
    removedMetadataLines,
    removedTimestampMarkers,
    keptOnlyTranscriptSection,
  };
}

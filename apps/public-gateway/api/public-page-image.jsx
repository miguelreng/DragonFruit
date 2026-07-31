import React from "react";
import { ImageResponse } from "@vercel/og";
import { fetchPublicPageMetadata, truncateText } from "../lib/public-page-meta.mjs";

const queryValue = (searchParams, name) => searchParams.get(name) ?? "";

export default async function handler(request) {
  const requestUrl = new URL(request.url);
  const result = await fetchPublicPageMetadata({
    pageSlug: queryValue(requestUrl.searchParams, "pageSlug"),
    pageType: queryValue(requestUrl.searchParams, "pageType"),
    workspaceIdentifier: queryValue(requestUrl.searchParams, "workspaceIdentifier"),
  });

  if (!result.metadata) {
    return new Response("Public page not found.", {
      status: result.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const metadata = result.metadata;
  const title = truncateText(metadata.title, 72);
  const description = truncateText(metadata.description, 150);

  const imageResponse = new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#faf9f8",
        color: "#202124",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "72px 80px 64px",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", fontSize: 21, gap: 14 }}>
        <span style={{ color: "#6c686b", fontWeight: 600 }}>{metadata.workspaceName}</span>
        <span
          style={{
            background: "#f8eaf3",
            borderRadius: 999,
            color: "#aa0276",
            display: "flex",
            fontSize: 18,
            fontWeight: 600,
            padding: "8px 14px",
          }}
        >
          {metadata.typeLabel}
        </span>
      </div>

      <div style={{ background: "#c0177c", display: "flex", height: 5, marginTop: 40, width: 64 }} />

      <div style={{ alignItems: "flex-start", display: "flex", flexDirection: "column", marginTop: 34 }}>
        {metadata.emoji ? (
          <div style={{ display: "flex", fontSize: 58, marginBottom: 18 }}>{metadata.emoji}</div>
        ) : null}
        <div
          style={{
            color: "#1d1b1d",
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-2px",
            lineHeight: 1.08,
            maxWidth: 1040,
          }}
        >
          {title}
        </div>
        {description ? (
          <div
            style={{
              color: "#625d61",
              display: "flex",
              fontSize: 27,
              lineHeight: 1.35,
              marginTop: 24,
              maxWidth: 980,
            }}
          >
            {description}
          </div>
        ) : null}
      </div>

      <div
        style={{
          alignItems: "center",
          borderTop: "1px solid #e5e1e3",
          color: "#878184",
          display: "flex",
          fontSize: 18,
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: 24,
        }}
      >
        <span>{metadata.author ? `Written by ${metadata.author}` : metadata.typeLabel}</span>
        <span>dragonfruit.page</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    }
  );
  imageResponse.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return imageResponse;
}

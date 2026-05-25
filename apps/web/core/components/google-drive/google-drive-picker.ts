/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TGoogleDrivePickedFile = {
  file_id: string;
  name: string;
  mime_type?: string;
  web_view_link: string;
  icon_link?: string;
  thumbnail_link?: string;
  size?: number;
};

const GOOGLE_API_SCRIPT_ID = "dragonfruit-google-api";
const GOOGLE_GSI_SCRIPT_ID = "dragonfruit-google-gsi";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const loadScript = (id: string, src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(`Could not load ${src}`)));
    document.head.appendChild(script);
  });

const extractDriveFileId = (url: string) => {
  const patterns = [
    /\/file\/d\/([^/?#]+)/,
    /\/document\/d\/([^/?#]+)/,
    /\/spreadsheets\/d\/([^/?#]+)/,
    /\/presentation\/d\/([^/?#]+)/,
    /[?&]id=([^&#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
};

const manualDriveFile = (): TGoogleDrivePickedFile | null => {
  const url = window.prompt("Paste a Google Drive file URL");
  if (!url) return null;
  const fileId = extractDriveFileId(url);
  if (!fileId) {
    window.alert("That does not look like a Google Drive file URL.");
    return null;
  }
  const name = window.prompt("File name", "Google Drive file") || "Google Drive file";
  return {
    file_id: fileId,
    name,
    web_view_link: url,
    mime_type: "application/vnd.google-apps.unknown",
  };
};

export async function pickGoogleDriveFile(): Promise<TGoogleDrivePickedFile | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;

  if (!apiKey || !clientId) return manualDriveFile();

  try {
    await Promise.all([
      loadScript(GOOGLE_API_SCRIPT_ID, "https://apis.google.com/js/api.js"),
      loadScript(GOOGLE_GSI_SCRIPT_ID, "https://accounts.google.com/gsi/client"),
    ]);
  } catch {
    return manualDriveFile();
  }

  const googleApi = (window as any).gapi;
  const google = (window as any).google;
  if (!googleApi || !google?.accounts?.oauth2) return manualDriveFile();

  await new Promise<void>((resolve) => googleApi.load("picker", resolve));

  return new Promise<TGoogleDrivePickedFile | null>((resolve) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (tokenResponse: { access_token?: string; error?: string }) => {
        if (!tokenResponse.access_token || tokenResponse.error) {
          resolve(null);
          return;
        }

        const picker = new google.picker.PickerBuilder()
          .addView(new google.picker.DocsView().setIncludeFolders(true))
          .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
          .setOAuthToken(tokenResponse.access_token)
          .setDeveloperKey(apiKey)
          .setCallback((data: any) => {
            if (data.action === google.picker.Action.CANCEL) {
              resolve(null);
              return;
            }
            if (data.action !== google.picker.Action.PICKED) return;
            const doc = data.docs?.[0];
            if (!doc?.id) {
              resolve(null);
              return;
            }
            resolve({
              file_id: doc.id,
              name: doc.name || "Google Drive file",
              mime_type: doc.mimeType,
              web_view_link: doc.url,
              icon_link: doc.iconUrl,
              thumbnail_link: doc.thumbnails?.[0]?.url,
              size: Number(doc.sizeBytes || 0),
            });
          })
          .build();

        picker.setVisible(true);
      },
    });

    tokenClient.requestAccessToken({ prompt: "" });
  });
}

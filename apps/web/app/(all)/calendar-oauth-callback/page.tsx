/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { observer } from "mobx-react";
import { CalendarService } from "@/services/calendar.service";

const calendarService = new CalendarService();

const LAST_WORKSPACE_LS_KEY = "last_workspace_slug";

/**
 * Top-level OAuth callback for Google Calendar. Google redirects here with
 * ?code=...; we hand the code to the backend, then bounce the user back to
 * their workspace calendar. Lives outside the [workspaceSlug] segment so the
 * redirect URI is stable regardless of which workspace the user was in.
 */
function CalendarOauthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      setError(`Google returned: ${oauthError}`);
      return;
    }
    if (!code) {
      setError("Missing authorization code.");
      return;
    }

    (async () => {
      try {
        await calendarService.finishGoogle(code);
        // Best-effort: bounce back to the workspace calendar the user came from.
        // Falls back to the app root, which already redirects to the last workspace.
        const slug =
          typeof window !== "undefined" ? window.localStorage.getItem(LAST_WORKSPACE_LS_KEY) : null;
        navigate(slug ? `/${slug}/calendar/` : "/");
      } catch (err) {
        console.error(err);
        setError("Could not connect Google Calendar. Please try again.");
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-canvas">
      <div className="max-w-md text-center">
        {error ? (
          <>
            <div className="text-base font-medium text-danger-primary">Connection failed</div>
            <div className="mt-1 text-sm text-tertiary">{error}</div>
            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            >
              Go home
            </button>
          </>
        ) : (
          <div className="text-sm text-tertiary">Connecting your Google Calendar…</div>
        )}
      </div>
    </div>
  );
}

export default observer(CalendarOauthCallbackPage);

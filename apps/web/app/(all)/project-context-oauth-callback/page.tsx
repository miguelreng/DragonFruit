/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { observer } from "mobx-react";
import { AppLoadingScreen } from "@/components/common/app-loading-screen";
import { ProjectContextSourceService } from "@/services/project/project-context-source.service";

const projectContextSourceService = new ProjectContextSourceService();

function ProjectContextOauthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(`Google devolvió: ${oauthError}`);
      return;
    }
    if (!code || !state) {
      setError("Falta el código de autorización de Google.");
      return;
    }
    void (async () => {
      try {
        const result = await projectContextSourceService.finishGoogleDrive(code, state);
        navigate(`/${result.workspace_slug}/settings/projects/${result.project_id}/?drive_connection=${result.connection.id}`, {
          replace: true,
        });
      } catch (err) {
        const message = typeof err === "object" && err && "error" in err && typeof err.error === "string" ? err.error : null;
        setError(message || "No se pudo conectar Google Drive. Inténtalo de nuevo.");
      }
    })();
  }, [navigate, searchParams]);

  if (!error) return <AppLoadingScreen />;
  return (
    <div className="flex h-screen w-full items-center justify-center bg-canvas">
      <div className="max-w-md text-center">
        <div className="text-base font-medium text-danger-primary">No se pudo conectar Google Drive</div>
        <div className="mt-1 text-sm text-tertiary">{error}</div>
        <button type="button" onClick={() => navigate("/")} className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Ir al inicio
        </button>
      </div>
    </div>
  );
}

export default observer(ProjectContextOauthCallbackPage);

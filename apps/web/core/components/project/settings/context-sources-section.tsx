/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@dragonfruit/propel/button";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import {
  ProjectContextSourceService,
  type TGoogleDriveFolder,
  type TProjectContextSource,
  type TProjectSourceFile,
} from "@/services/project/project-context-source.service";

const projectContextSourceService = new ProjectContextSourceService();

type Props = {
  workspaceSlug: string;
  projectId: string;
};

type TFolderTrailItem = TGoogleDriveFolder & { parentId: string };

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "error" in error && typeof error.error === "string") return error.error;
  return fallback;
}

export function ProjectContextSourcesSection({ workspaceSlug, projectId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sources, setSources] = useState<TProjectContextSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<TGoogleDriveFolder[]>([]);
  const [folderTrail, setFolderTrail] = useState<TFolderTrailItem[]>([]);
  const [managingSourceId, setManagingSourceId] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<TProjectSourceFile[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const connectionId = searchParams.get("drive_connection");
  const currentFolderId = folderTrail.at(-1)?.id ?? "root";

  const loadSources = useCallback(async () => {
    try {
      setLoading(true);
      setSources(await projectContextSourceService.getSources(workspaceSlug, projectId));
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar las fuentes de contexto."));
    } finally {
      setLoading(false);
    }
  }, [projectId, workspaceSlug]);

  const loadFolders = useCallback(
    async (parentId: string) => {
      if (!connectionId) return;
      try {
        setBusyKey("folders");
        setFolders((await projectContextSourceService.getGoogleDriveFolders(workspaceSlug, projectId, connectionId, parentId)).folders);
      } catch (err) {
        setError(errorMessage(err, "No se pudieron explorar las carpetas de Google Drive."));
      } finally {
        setBusyKey(null);
      }
    },
    [connectionId, projectId, workspaceSlug]
  );

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (connectionId) void loadFolders(currentFolderId);
  }, [connectionId, currentFolderId, loadFolders]);

  const selectedCount = useMemo(
    () => sources.reduce((total, source) => total + source.selection_config.included_paths.length, 0),
    [sources]
  );

  const connectDrive = async () => {
    try {
      setBusyKey("connect");
      const { authorize_url } = await projectContextSourceService.startGoogleDrive(workspaceSlug, projectId);
      window.location.assign(authorize_url);
    } catch (err) {
      setError(errorMessage(err, "No se pudo iniciar la conexión con Google Drive."));
      setBusyKey(null);
    }
  };

  const chooseFolder = async () => {
    if (!connectionId) return;
    try {
      setBusyKey("choose-folder");
      const name = folderTrail.at(-1)?.name ?? "My Drive";
      const source = await projectContextSourceService.createGoogleDriveSource(workspaceSlug, projectId, {
        connection_id: connectionId,
        root_external_id: currentFolderId,
        display_name: name,
      });
      await projectContextSourceService.refreshSource(workspaceSlug, projectId, source.id);
      searchParams.delete("drive_connection");
      setSearchParams(searchParams, { replace: true });
      setFolderTrail([]);
      await loadSources();
    } catch (err) {
      setError(errorMessage(err, "No se pudo conectar esta carpeta."));
    } finally {
      setBusyKey(null);
    }
  };

  const refreshSource = async (sourceId: string) => {
    try {
      setBusyKey(`refresh:${sourceId}`);
      await projectContextSourceService.refreshSource(workspaceSlug, projectId, sourceId);
      await loadSources();
    } catch (err) {
      setError(errorMessage(err, "No se pudo actualizar esta fuente."));
    } finally {
      setBusyKey(null);
    }
  };

  const disconnectSource = async (sourceId: string) => {
    try {
      setBusyKey(`disconnect:${sourceId}`);
      await projectContextSourceService.deleteSource(workspaceSlug, projectId, sourceId);
      if (managingSourceId === sourceId) setManagingSourceId(null);
      await loadSources();
    } catch (err) {
      setError(errorMessage(err, "No se pudo desconectar esta fuente."));
    } finally {
      setBusyKey(null);
    }
  };

  const openFileSelection = async (source: TProjectContextSource) => {
    try {
      setBusyKey(`files:${source.id}`);
      const files = await projectContextSourceService.getSourceFiles(workspaceSlug, projectId, source.id);
      setSourceFiles(files);
      setSelectedPaths(source.selection_config.included_paths);
      setManagingSourceId(source.id);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar los archivos de esta fuente."));
    } finally {
      setBusyKey(null);
    }
  };

  const saveSelection = async () => {
    if (!managingSourceId) return;
    try {
      setBusyKey("save-selection");
      await projectContextSourceService.updateSource(workspaceSlug, projectId, managingSourceId, {
        selection_config: { included_paths: selectedPaths },
      });
      setManagingSourceId(null);
      await loadSources();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar la selección de archivos."));
    } finally {
      setBusyKey(null);
    }
  };

  const eligibleFiles = sourceFiles.filter((file) => file.is_eligible);

  return (
    <section className="mt-10 space-y-4">
      <div className="space-y-1">
        <h3 className="text-body-lg-medium text-primary">Contexto de Atlas</h3>
        <p className="text-caption-md-regular text-tertiary">
          Conecta una carpeta de Drive en modo lectura. Atlas solo usa los archivos que selecciones aquí y los trata como evidencia,
          nunca como instrucciones que cambien sus permisos o reglas.
        </p>
      </div>

      {error && <p className="rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-caption-md-regular text-danger-primary">{error}</p>}

      {connectionId ? (
        <div className="rounded-lg border border-subtle bg-layer-2 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h4 className="text-body-sm-medium text-primary">Elige una carpeta de Google Drive</h4>
              <p className="text-caption-md-regular text-tertiary">Límite de lectura: {folderTrail.map((folder) => folder.name).join(" / ") || "My Drive"}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={!folderTrail.length || busyKey === "folders"} onClick={() => setFolderTrail((trail) => trail.slice(0, -1))}>
                Atrás
              </Button>
              <Button variant="primary" size="sm" loading={busyKey === "choose-folder"} onClick={() => void chooseFolder()}>
                Usar esta carpeta
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="rounded-md border border-subtle px-3 py-2 text-left text-caption-md-medium text-primary hover:bg-layer-1"
                onClick={() => setFolderTrail((trail) => [...trail, { ...folder, parentId: currentFolderId }])}
              >
                {folder.name}
              </button>
            ))}
            {!busyKey && folders.length === 0 && <p className="text-caption-md-regular text-tertiary">No hay subcarpetas visibles.</p>}
          </div>
        </div>
      ) : (
        <SettingsBoxedControlItem
          title="Google Drive"
          description="Autoriza una cuenta personal y elige la carpeta que contiene el contexto compartido por Claude y Codex. El acceso es de solo lectura."
          control={<Button variant="secondary" loading={busyKey === "connect"} onClick={() => void connectDrive()}>Conectar Drive</Button>}
        />
      )}

      {loading ? (
        <p className="text-caption-md-regular text-tertiary">Cargando fuentes de contexto…</p>
      ) : sources.length === 0 ? (
        <p className="rounded-lg border border-dashed border-subtle px-4 py-5 text-caption-md-regular text-tertiary">Aún no hay una carpeta conectada.</p>
      ) : (
        <div className="rounded-lg border border-subtle bg-layer-2">
          {sources.map((source, index) => (
            <SettingsBoxedControlItem
              key={source.id}
              className={index < sources.length - 1 ? "rounded-b-none border-0 border-b" : "rounded-t-none border-0"}
              title={`${source.display_name} · ${source.file_count} archivos descubiertos`}
              description={`${source.selection_config.included_paths.length} archivos habilitados para Atlas${source.last_refreshed_at ? ` · actualizado ${new Date(source.last_refreshed_at).toLocaleString()}` : ""}${source.last_error_code ? ` · ${source.last_error_code}` : ""}`}
              control={
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" loading={busyKey === `files:${source.id}`} onClick={() => void openFileSelection(source)}>Elegir archivos</Button>
                  <Button variant="secondary" size="sm" loading={busyKey === `refresh:${source.id}`} onClick={() => void refreshSource(source.id)}>Actualizar</Button>
                  <Button variant="error-outline" size="sm" loading={busyKey === `disconnect:${source.id}`} onClick={() => void disconnectSource(source.id)}>Desconectar</Button>
                </div>
              }
            />
          ))}
        </div>
      )}

      {managingSourceId && (
        <div className="rounded-lg border border-subtle bg-layer-2 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-body-sm-medium text-primary">Archivos que Atlas puede consultar</h4>
              <p className="text-caption-md-regular text-tertiary">Selecciona hasta 80 archivos. Los archivos sensibles o no compatibles nunca se habilitan.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setManagingSourceId(null)}>Cancelar</Button>
          </div>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {eligibleFiles.map((file) => (
              <label key={file.id} className="flex cursor-pointer items-center gap-2 text-caption-md-regular text-primary">
                <input
                  type="checkbox"
                  checked={selectedPaths.includes(file.relative_path)}
                  onChange={(event) => setSelectedPaths((paths) => event.target.checked ? [...paths, file.relative_path] : paths.filter((path) => path !== file.relative_path))}
                />
                <span>{file.relative_path}</span>
              </label>
            ))}
            {eligibleFiles.length === 0 && <p className="text-caption-md-regular text-tertiary">No hay archivos compatibles todavía. Actualiza la fuente primero.</p>}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" loading={busyKey === "save-selection"} disabled={selectedPaths.length > 80} onClick={() => void saveSelection()}>
              Guardar {selectedPaths.length} archivos
            </Button>
          </div>
        </div>
      )}

      <p className="text-caption-md-regular text-tertiary">{selectedCount} archivos seleccionados entre todas las fuentes.</p>
    </section>
  );
}

/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
// DragonFruit Imports
import { ORGANIZATION_SIZE, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EditIcon } from "@/components/icons/propel-shim";
import { Tooltip } from "@plane/propel/tooltip";
import { Copy, RefreshCw } from "@/components/icons/lucide-shim";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspace } from "@plane/types";
import { CustomSelect, Input } from "@plane/ui";
import { cn, copyTextToClipboard, copyUrlToClipboard, validateSlug, validateWorkspaceName } from "@plane/utils";
// components
import { WorkspaceImageUploadModal } from "@/components/core/modals/workspace-image-upload-modal";
import { TimezoneSelect } from "@/components/global/timezone-select";
import {
  isDefaultWorkspaceLogo,
  pickRandomDefaultWorkspaceLogo,
  resolveWorkspaceLogoSrc,
} from "@/components/workspace/default-logos";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web components
import { DeleteWorkspaceSection } from "@/plane-web/components/workspace/delete-workspace-section";

const defaultValues: Partial<IWorkspace> = {
  name: "",
  slug: "",
  organization_size: "2-10",
  logo_url: null,
  timezone: "UTC",
};

const getUpdatedWorkspacePath = (pathname: string, previousSlug: string, nextSlug: string) => {
  const segments = pathname.split("/");

  if (segments[1] === previousSlug) {
    segments[1] = nextSlug;
    return segments.join("/") || `/${nextSlug}`;
  }

  return `/${nextSlug}`;
};

const getWorkspaceUpdateErrorMessage = (err: unknown) => {
  if (typeof err === "string") return err;
  if (!err || typeof err !== "object") return "Could not update workspace. Please try again.";

  const error = err as { slug?: string | string[]; error?: string | string[]; detail?: string | string[] };
  const message = error.slug ?? error.error ?? error.detail;

  if (Array.isArray(message)) return message.join(" ");
  if (typeof message === "string") return message;

  return "Could not update workspace. Please try again.";
};

const WorkspaceIdentifierRow = (props: {
  label: string;
  value: string;
  onCopy: (label: string, value: string) => void;
}) => {
  const { label, value, onCopy } = props;

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-subtle bg-layer-2 px-3 py-2">
      <div className="min-w-0">
        <div className="tracking-normal text-11 font-medium text-tertiary uppercase">{label}</div>
        <div className="font-mono mt-0.5 truncate text-12 text-secondary">{value}</div>
      </div>
      <Tooltip tooltipContent={`Copy workspace ${label.toLowerCase()}`} position="top">
        <button
          type="button"
          onClick={() => onCopy(label, value)}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-tertiary transition-colors hover:bg-layer-1 hover:text-secondary"
          aria-label={`Copy workspace ${label.toLowerCase()}`}
        >
          <Copy className="size-3.5" />
        </button>
      </Tooltip>
    </div>
  );
};

export const WorkspaceDetails = observer(function WorkspaceDetails() {
  // states
  const [isLoading, setIsLoading] = useState(false);
  const [isImageUploadModalOpen, setIsImageUploadModalOpen] = useState(false);
  // store hooks
  const { currentWorkspace, updateWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  const router = useAppRouter();
  const { t } = useTranslation();

  // form info
  const {
    handleSubmit,
    control,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<IWorkspace>({
    defaultValues: { ...defaultValues, ...currentWorkspace },
  });
  // derived values
  const workspaceLogo = watch("logo_url");
  const isUsingDefaultLogo = !workspaceLogo || workspaceLogo === "" || isDefaultWorkspaceLogo(workspaceLogo);
  const logoSrc = resolveWorkspaceLogoSrc(workspaceLogo, currentWorkspace?.id);
  const workspaceHost = typeof window !== "undefined" ? window.location.host : "";
  const workspaceSlug = watch("slug") || currentWorkspace?.slug || "";
  const workspaceUrl = workspaceSlug ? `${workspaceHost}/${workspaceSlug}` : "";

  const onSubmit = async (formData: IWorkspace) => {
    if (!currentWorkspace) return;

    setIsLoading(true);

    const payload: Partial<IWorkspace> = {
      name: formData.name,
      slug: formData.slug?.trim().toLowerCase(),
      organization_size: formData.organization_size,
      timezone: formData.timezone,
    };

    try {
      const previousSlug = currentWorkspace.slug;
      const updatedWorkspace = await updateWorkspace(currentWorkspace.slug, payload);
      const nextSlug = updatedWorkspace.slug;
      if (nextSlug && nextSlug !== previousSlug && typeof window !== "undefined") {
        const nextPath = getUpdatedWorkspacePath(window.location.pathname, previousSlug, nextSlug);
        router.replace(`${nextPath}${window.location.search}${window.location.hash}`);
      }
      setToast({
        title: "Success!",
        type: TOAST_TYPE.SUCCESS,
        message: "Workspace updated successfully",
      });
    } catch (err: unknown) {
      console.error(err);
      const message = getWorkspaceUpdateErrorMessage(err);
      if (err && typeof err === "object" && "slug" in err) {
        setError("slug", { type: "server", message });
      }
      setToast({
        title: "Error!",
        type: TOAST_TYPE.ERROR,
        message,
      });
    } finally {
      setTimeout(() => {
        setIsLoading(false);
      }, 300);
    }
  };

  const handleRemoveLogo = async () => {
    if (!currentWorkspace) return;

    try {
      await updateWorkspace(currentWorkspace.slug, {
        logo_url: "",
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Workspace picture removed successfully.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "There was some error in deleting your profile picture. Please try again.",
      });
    }
  };

  const handleRandomizeLogo = async () => {
    if (!currentWorkspace) return;
    const nextLogo = pickRandomDefaultWorkspaceLogo(workspaceLogo);
    try {
      // Server-side: `logo_url` is read-only (it's computed from logo_asset.asset_url || logo),
      // so we write the underlying `logo` column and null out any uploaded asset. We also
      // include logo_url in the payload so the store's local update reflects the new value
      // immediately (the backend ignores read-only fields).
      await updateWorkspace(currentWorkspace.slug, {
        logo: nextLogo,
        logo_asset: null,
        logo_url: nextLogo,
      });
      setValue("logo_url", nextLogo, { shouldDirty: false });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Could not update workspace logo. Please try again.",
      });
    }
  };

  const handleCopyUrl = () => {
    if (!currentWorkspace) return;

    void copyUrlToClipboard(`https://${workspaceUrl}`)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Workspace URL copied to the clipboard.",
        });
        return undefined;
      })
      .catch(() => {
        // Silently handle clipboard errors
      });
  };

  const handleCopyWorkspaceIdentifier = (label: string, value: string) => {
    void copyTextToClipboard(value)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: `Workspace ${label.toLowerCase()} copied to the clipboard.`,
        });
        return undefined;
      })
      .catch(() => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: `Could not copy workspace ${label.toLowerCase()}.`,
        });
      });
  };

  useEffect(() => {
    if (currentWorkspace) reset({ ...currentWorkspace });
  }, [currentWorkspace, reset]);

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  if (!currentWorkspace) return null;

  return (
    <>
      <Controller
        control={control}
        name="logo_url"
        render={({ field: { onChange, value } }) => (
          <WorkspaceImageUploadModal
            isOpen={isImageUploadModalOpen}
            onClose={() => setIsImageUploadModalOpen(false)}
            handleRemove={handleRemoveLogo}
            onSuccess={(imageUrl) => {
              onChange(imageUrl);
              setIsImageUploadModalOpen(false);
            }}
            value={value}
          />
        )}
      />
      <div className={cn("flex w-full flex-col gap-y-7", { "opacity-60": !isAdmin })}>
        <div className="flex items-center gap-5">
          <div className="flex shrink-0 flex-col gap-1">
            <button type="button" onClick={() => setIsImageUploadModalOpen(true)} disabled={!isAdmin}>
              <div className="relative flex size-14">
                <img
                  src={logoSrc}
                  className="absolute top-0 left-0 size-full rounded-lg object-cover"
                  alt="Workspace Logo"
                />
              </div>
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <div className="mb:-my-5 text-h5-semibold leading-6 text-secondary">{watch("name")}</div>
            <Tooltip tooltipContent="Copy workspace URL" position="right">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="group inline-flex w-fit items-center gap-1.5 text-body-xs-medium text-tertiary transition-colors hover:text-secondary"
              >
                <Copy className="size-3 text-tertiary opacity-70 transition-opacity group-hover:opacity-100" />
                <span>{workspaceUrl}</span>
              </button>
            </Tooltip>
            {isAdmin && (
              <div className="mt-0.5 -ml-1 flex items-center gap-1">
                <Button
                  variant="link-accent"
                  size="sm"
                  onClick={() => setIsImageUploadModalOpen(true)}
                  prependIcon={isUsingDefaultLogo ? undefined : <EditIcon />}
                >
                  {isUsingDefaultLogo
                    ? t("workspace_settings.settings.general.upload_logo")
                    : t("workspace_settings.settings.general.edit_logo")}
                </Button>
                {isUsingDefaultLogo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleRandomizeLogo()}
                    prependIcon={<RefreshCw />}
                  >
                    Randomize
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <h4 className="text-body-sm-medium text-secondary">Workspace identifiers</h4>
            <p className="mt-1 text-body-xs-regular text-tertiary">
              Use these values for integrations, publishing, and build-time configuration.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <WorkspaceIdentifierRow label="ID" value={currentWorkspace.id} onCopy={handleCopyWorkspaceIdentifier} />
            <WorkspaceIdentifierRow label="Slug" value={currentWorkspace.slug} onCopy={handleCopyWorkspaceIdentifier} />
          </div>
        </div>
        <div className="flex flex-col gap-7">
          <div className="grid-col grid w-full grid-cols-1 items-center justify-between gap-10 xl:grid-cols-2 2xl:grid-cols-3">
            <div className="flex flex-col gap-2">
              <h4 className="text-body-sm-medium text-tertiary">{t("workspace_settings.settings.general.name")}</h4>
              <Controller
                control={control}
                name="name"
                rules={{
                  validate: (value) => validateWorkspaceName(value, true),
                }}
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors.name)}
                    placeholder={t("workspace_settings.settings.general.name")}
                    className="w-full rounded-lg"
                    disabled={!isAdmin}
                  />
                )}
              />
              {errors.name && <p className="text-caption-sm-regular text-danger-primary">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="text-body-sm-medium text-tertiary">
                {t("workspace_settings.settings.general.company_size")}
              </h4>
              <Controller
                name="organization_size"
                control={control}
                render={({ field: { value, onChange } }) => (
                  <CustomSelect
                    value={value}
                    onChange={onChange}
                    label={
                      ORGANIZATION_SIZE.find((c) => c === value) ??
                      t("workspace_settings.settings.general.errors.company_size.select_a_range")
                    }
                    buttonClassName="border border-subtle bg-layer-2 !shadow-none !rounded-lg"
                    input
                    disabled={!isAdmin}
                  >
                    {ORGANIZATION_SIZE.map((item) => (
                      <CustomSelect.Option key={item} value={item}>
                        {item}
                      </CustomSelect.Option>
                    ))}
                  </CustomSelect>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="text-body-sm-medium text-tertiary">{t("workspace_settings.settings.general.url")}</h4>
              <div className="flex w-full items-center rounded-lg border border-subtle bg-layer-2 px-3">
                <span className="text-12 whitespace-nowrap text-secondary">{workspaceHost}/</span>
                <Controller
                  control={control}
                  name="slug"
                  rules={{
                    required: t("common.errors.required"),
                    maxLength: {
                      value: 48,
                      message: "Workspace URL must be 48 characters or less.",
                    },
                    validate: (value) => validateSlug(value),
                  }}
                  render={({ field: { onChange, value, ref } }) => (
                    <Input
                      id="slug"
                      name="slug"
                      type="text"
                      value={(value ?? "").toLowerCase().trim().replace(/ /g, "-")}
                      onChange={(e) => onChange(e.target.value.toLowerCase())}
                      ref={ref}
                      hasError={Boolean(errors.slug)}
                      className="block w-full rounded-lg border-none bg-transparent !px-0 py-2 text-12"
                      disabled={!isAdmin}
                    />
                  )}
                />
              </div>
              {errors.slug && <p className="text-caption-sm-regular text-danger-primary">{errors.slug.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="text-body-sm-medium text-tertiary">
                {t("workspace_settings.settings.general.workspace_timezone")}
              </h4>
              <Controller
                name="timezone"
                control={control}
                render={({ field: { value, onChange } }) => (
                  <>
                    <TimezoneSelect
                      value={value}
                      onChange={onChange}
                      buttonClassName="!rounded-lg"
                      className="rounded-lg"
                      disabled={!isAdmin}
                    />
                  </>
                )}
              />
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center justify-between py-2">
            <Button
              variant="primary"
              size="lg"
              onClick={(e) => {
                void handleSubmit(onSubmit)(e);
              }}
              loading={isLoading}
            >
              {isLoading ? t("updating") : t("workspace_settings.settings.general.update_workspace")}
            </Button>
          </div>
        )}
      </div>
      {isAdmin && (
        <div className="mt-10">
          <DeleteWorkspaceSection workspace={currentWorkspace} />
        </div>
      )}
    </>
  );
});

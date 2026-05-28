/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import type { TSticky } from "@plane/types";
import { cn, isCommentEmpty } from "@plane/utils";
import { StickyEditor } from "@/components/editor/sticky-editor";
import { useWorkspace } from "@/hooks/store/use-workspace";

// const StickyEditor = dynamic(() => import("../../editor/sticky-editor").then((mod) => mod.StickyEditor), {
//   ssr: false,
// });

type TProps = {
  stickyData: Partial<TSticky> | undefined;
  workspaceSlug: string;
  handleUpdate: (payload: Partial<TSticky>) => void;
  stickyId: string | undefined;
  showToolbar?: boolean;
  handleChange: (data: Partial<TSticky>) => Promise<void>;
  handleDelete: () => void;
};

export function StickyInput(props: TProps) {
  const { stickyData, workspaceSlug, handleUpdate, stickyId, handleDelete, handleChange, showToolbar } = props;
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // navigation
  const pathname = usePathname();
  // store hooks
  const { getWorkspaceBySlug } = useWorkspace();
  // derived values
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString() ?? "";
  const isStickiesPage = pathname?.includes("stickies");
  // form info
  const { handleSubmit, reset, control } = useForm<TSticky>({
    defaultValues: {
      name: stickyData?.name ?? "",
      description_html: stickyData?.description_html,
    },
  });

  const handleFormSubmit = useCallback(
    async (formdata: Partial<TSticky>) => {
      await handleUpdate({
        name: formdata.name ?? "",
        description_html: formdata.description_html ?? "<p></p>",
      });
    },
    [handleUpdate]
  );

  const resizeTitleTextarea = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  // reset form values
  useEffect(() => {
    if (!stickyId) return;
    reset({
      id: stickyId,
      name: stickyData?.name ?? "",
      description_html: stickyData?.description_html?.trim() === "" ? "<p></p>" : stickyData?.description_html,
    });
  }, [stickyData, stickyId, reset]);

  useEffect(() => {
    resizeTitleTextarea(titleTextareaRef.current);
  }, [stickyData?.name, stickyId, resizeTitleTextarea]);

  return (
    <div className="flex-1">
      <Controller
        name="name"
        control={control}
        render={({ field: { value, onChange, ref } }) => (
          <textarea
            rows={1}
            value={value ?? ""}
            onChange={(e) => {
              onChange(e.target.value);
              resizeTitleTextarea(e.target);
              handleSubmit(handleFormSubmit)();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            ref={(element) => {
              ref(element);
              titleTextareaRef.current = element;
              resizeTitleTextarea(element);
            }}
            placeholder="Title"
            className="w-full resize-none overflow-hidden border-0 bg-transparent px-4 pt-6 pb-0 font-['Figtree'] text-[1.1rem] leading-tight font-medium wrap-anywhere whitespace-pre-wrap text-primary placeholder:text-primary/40 focus:outline-none"
            maxLength={100}
          />
        )}
      />
      <Controller
        name="description_html"
        control={control}
        render={({ field: { onChange } }) => (
          <StickyEditor
            id={`description-${stickyId}`}
            initialValue={stickyData?.description_html ?? ""}
            value={null}
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            onChange={(_description, description_html) => {
              onChange(description_html);
              handleSubmit(handleFormSubmit)();
            }}
            placeholder={(_, value) => {
              const isContentEmpty = isCommentEmpty(value);
              if (!isContentEmpty) return "";
              return "Click to type here";
            }}
            containerClassName={cn(
              "sticky-title-editor vertical-scrollbar scrollbar-sm max-h-[540px] min-h-[256px] w-full overflow-y-scroll px-4 pt-1 pb-4 text-13",
              {
                "max-h-[588px]": isStickiesPage,
              }
            )}
            uploadFile={async () => ""}
            duplicateFile={async () => ""}
            showToolbar={showToolbar}
            parentClassName="border-none p-0"
            handleDelete={handleDelete}
            handleColorChange={handleChange}
            ref={editorRef}
          />
        )}
      />
    </div>
  );
}

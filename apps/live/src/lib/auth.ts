/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IncomingHttpHeaders } from "http";
import type { TUserDetails } from "@plane/editor";
import { logger } from "@plane/logger";
import { AppError } from "@/lib/errors";
// services
import { UserService } from "@/services/user.service";
import { getPageService } from "@/services/page/handler";
// types
import type { HocusPocusServerContext, TDocumentTypes } from "@/types";
import { isAuthorizedPresenceDocumentName } from "./presence-auth";

/**
 * Authenticate the user
 * @param requestHeaders - The request headers
 * @param context - The context
 * @param token - The token
 * @returns The authenticated user
 */
export const onAuthenticate = async ({
  documentName,
  requestHeaders,
  requestParameters,
  context,
  token,
}: {
  documentName: string;
  requestHeaders: IncomingHttpHeaders;
  context: HocusPocusServerContext;
  requestParameters: URLSearchParams;
  token: string;
}) => {
  let cookie: string | undefined = undefined;
  let userId: string | undefined = undefined;

  // Extract cookie (fallback to request headers) and userId from token (for scenarios where
  // the cookies are not passed in the request headers)
  try {
    const parsedToken = JSON.parse(token) as TUserDetails;
    userId = parsedToken.id;
    cookie = parsedToken.cookie;
  } catch (error) {
    const appError = new AppError(error, {
      context: { operation: "onAuthenticate" },
    });
    logger.error("Token parsing failed, using request headers", appError);
  } finally {
    // If cookie is still not found, fallback to request headers
    if (!cookie) {
      cookie = requestHeaders.cookie?.toString();
    }
  }

  if (!cookie || !userId) {
    const appError = new AppError("Credentials not provided", { code: "AUTH_MISSING_CREDENTIALS" });
    logger.error("Credentials not provided", appError);
    throw appError;
  }

  // set cookie in context, so it can be used throughout the ws connection
  context.cookie = cookie ?? requestParameters.get("cookie") ?? "";
  context.connectionMode = requestParameters.get("connectionMode") === "presence" ? "presence" : "document";
  context.documentType = requestParameters.get("documentType")?.toString() as TDocumentTypes;
  context.pageId = requestParameters.get("pageId");
  context.projectId = requestParameters.get("projectId");
  context.userId = userId;
  context.workspaceSlug = requestParameters.get("workspaceSlug");

  const authentication = await handleAuthentication({
    cookie: context.cookie,
    userId: context.userId,
  });

  if (context.connectionMode === "presence") {
    const presencePageId = context.pageId;
    if (!presencePageId || !isAuthorizedPresenceDocumentName(documentName, presencePageId)) {
      throw new AppError("Authentication unsuccessful", { code: "AUTH_INVALID_RESOURCE" });
    }
    try {
      const page = await getPageService(context.documentType, context).fetchDetails(presencePageId);
      if (String(page.id) !== presencePageId || page.page_type !== "sheet") {
        throw new Error("Invalid presence resource");
      }
    } catch (error) {
      logger.error(
        "Presence resource authorization failed",
        new AppError(error, { context: { operation: "authorizePresenceResource" } })
      );
      // Deliberately do not reveal whether the page exists.
      throw new AppError("Authentication unsuccessful", { code: "AUTH_INVALID_RESOURCE" });
    }
  }

  return authentication;
};

export const handleAuthentication = async ({ cookie, userId }: { cookie: string; userId: string }) => {
  // fetch current user info
  try {
    const userService = new UserService();
    const user = await userService.currentUser(cookie);
    if (user.id !== userId) {
      throw new AppError("Authentication unsuccessful: User ID mismatch", { code: "AUTH_USER_MISMATCH" });
    }

    return {
      user: {
        id: user.id,
        name: user.display_name,
      },
    };
  } catch (error) {
    const appError = new AppError(error, {
      context: { operation: "handleAuthentication" },
    });
    logger.error("Authentication failed", appError);
    throw new AppError("Authentication unsuccessful", { code: appError.code });
  }
};

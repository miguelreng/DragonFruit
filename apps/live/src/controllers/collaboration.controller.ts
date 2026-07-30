/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Hocuspocus } from "@hocuspocus/server";
import type { Request } from "express";
import type { WebSocket as WebSocketConnection } from "ws";
// plane imports
import { Controller, WebSocket as WSDecorator } from "@plane/decorators";
import { logger } from "@plane/logger";
import { env } from "@/env";

export function isAllowedWebSocketOrigin(origin: string | undefined, configuredOrigins: string): boolean {
  // Non-browser/native clients may omit Origin. Browsers always send it for
  // cross-origin WebSocket handshakes, which is the CSWSH boundary here.
  if (!origin) return true;

  const allowedOrigins = configuredOrigins
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return allowedOrigins.includes(origin.replace(/\/$/, ""));
}

@Controller("/collaboration")
export class CollaborationController {
  [key: string]: unknown;
  private readonly hocusPocusServer: Hocuspocus;

  constructor(hocusPocusServer: Hocuspocus) {
    this.hocusPocusServer = hocusPocusServer;
  }

  @WSDecorator("/")
  handleConnection(ws: WebSocketConnection, req: Request) {
    try {
      if (!isAllowedWebSocketOrigin(req.headers.origin, env.CORS_ALLOWED_ORIGINS)) {
        logger.warn("COLLABORATION_CONTROLLER: rejected WebSocket origin");
        ws.close(1008, "Origin not allowed");
        return;
      }

      // Initialize the connection with Hocuspocus
      this.hocusPocusServer.handleConnection(ws, req);

      // Set up error handling for the connection
      ws.on("error", (error: Error) => {
        logger.error("COLLABORATION_CONTROLLER: WebSocket connection error:", error);
        ws.close(1011, "Internal server error");
      });
    } catch (error) {
      logger.error("COLLABORATION_CONTROLLER: WebSocket connection error:", error);
      ws.close(1011, "Internal server error");
    }
  }
}

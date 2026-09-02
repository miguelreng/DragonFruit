/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { logger } from "@dragonfruit/logger";
import { AppError } from "@/lib/errors";
import { Server } from "./server";

let server: Server;
let shutdownPromise: Promise<void> | null = null;

async function startServer() {
  server = new Server();
  try {
    await server.initialize();
    server.listen();
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    logger.info(`Received ${reason}. Initiating graceful shutdown...`);
    try {
      if (server) {
        await server.destroy();
      }
      logger.info("Server shut down gracefully");
      process.exit(exitCode);
    } catch (error) {
      logger.error("Error during graceful shutdown:", error);
      process.exit(1);
    }
  })();
  return shutdownPromise;
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});

process.on("SIGINT", () => {
  void shutdown("SIGINT", 0);
});

process.on("unhandledRejection", (err: Error) => {
  const error = new AppError(err);
  logger.error(`[UNHANDLED_REJECTION]`, error);
  void shutdown("unhandled rejection", 1);
});

process.on("uncaughtException", (err: Error) => {
  const error = new AppError(err);
  logger.error(`[UNCAUGHT_EXCEPTION]`, error);
  void shutdown("uncaught exception", 1);
});

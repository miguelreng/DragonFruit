/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Request, Response } from "express";
import { Controller, Get } from "@dragonfruit/decorators";
import { env } from "@/env";
import { redisManager } from "@/redis";

@Controller("/health")
export class HealthController {
  @Get("/")
  async healthCheck(_req: Request, res: Response) {
    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
    });
  }

  @Get("/ready")
  async readinessCheck(_req: Request, res: Response) {
    const redisReady = redisManager.isClientConnected();
    res.status(redisReady ? 200 : 503).json({
      status: redisReady ? "ready" : "unavailable",
      redis: redisReady ? "ok" : "error",
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
    });
  }
}

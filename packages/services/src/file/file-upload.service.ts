/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import axios from "axios";
// api service
import { APIService } from "../api.service";

/**
 * Service class for handling file upload operations
 * Handles file uploads
 * @extends {APIService}
 */
export class FileUploadService extends APIService {
  private cancelSource: any;

  constructor() {
    super("");
  }

  /**
   * Uploads a file to the specified signed URL
   * @param {string} url - The URL to upload the file to
   * @param {FormData | File} data - Form data for POST policy uploads, or the raw file for presigned PUT uploads
   * @returns {Promise<void>} Promise resolving to void
   * @throws {Error} If the request fails
   */
  async uploadFile(url: string, data: FormData | File): Promise<void> {
    this.cancelSource = axios.CancelToken.source();
    const isPresignedPut = !(data instanceof FormData);
    const request = isPresignedPut
      ? this.put(url, data, {
          headers: {
            "Content-Type": data.type || "application/octet-stream",
          },
          cancelToken: this.cancelSource.token,
          withCredentials: false,
        })
      : this.post(url, data, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          cancelToken: this.cancelSource.token,
          withCredentials: false,
        });
    return request
      .then((response) => response?.data)
      .catch((error) => {
        if (axios.isCancel(error)) {
          throw { error: error.message || "Upload canceled" };
        }
        throw error?.response?.data ?? { error: error?.message || "File upload failed. Please try again." };
      });
  }

  /**
   * Cancels the upload
   */
  cancelUpload() {
    this.cancelSource?.cancel("Upload canceled");
  }
}

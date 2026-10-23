//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using Microsoft.AspNetCore.Http;

namespace api.Services.Interfaces
{
    public interface IBlobStorageService
    {
        Task<string> UploadAsync(IFormFile file, string containerName, CancellationToken cancellationToken = default);
        Task<(Stream Stream, string ContentType)> DownloadAsync(string blobName, string containerName);
        Task DeleteIfExistsAsync(string blobName, string containerName, CancellationToken cancellationToken = default);
    }
}

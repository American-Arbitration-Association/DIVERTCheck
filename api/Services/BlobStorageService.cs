//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using api.Services.Interfaces;

namespace api.Services
{
    public class BlobStorageService : IBlobStorageService
    {
        private readonly BlobServiceClient _blobServiceClient;

        public BlobStorageService(BlobServiceClient blobServiceClient)
        {
            _blobServiceClient = blobServiceClient;
        }

        public async Task<string> UploadAsync(
            IFormFile file,
            string containerName,
            CancellationToken cancellationToken = default)
        {
            if (file == null || file.Length == 0)
                throw new ArgumentException("No file was provided.");

            var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);

            var azureStorageId = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
            var blobClient = containerClient.GetBlobClient(azureStorageId);

            await using var stream = file.OpenReadStream();

            var uploadOptions = new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders
                {
                    ContentType = GetContentType(file.FileName, file.ContentType)
                }
            };

            await blobClient.UploadAsync(stream, uploadOptions, cancellationToken);

            return azureStorageId;
        }

        public async Task<(Stream Stream, string ContentType)> DownloadAsync(string azureStorageId, string containerName)
        {
            var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
            var blobClient = containerClient.GetBlobClient(azureStorageId);

            if (!await blobClient.ExistsAsync())
                throw new FileNotFoundException("Blob was not found.");

            var response = await blobClient.DownloadStreamingAsync();

            return (
                response.Value.Content,
                response.Value.Details.ContentType ?? "application/octet-stream"
            );
        }

        public async Task DeleteIfExistsAsync(
            string azureStorageId,
            string containerName,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(azureStorageId))
                return;

            var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
            var blobClient = containerClient.GetBlobClient(azureStorageId);

            await blobClient.DeleteIfExistsAsync(
                DeleteSnapshotsOption.IncludeSnapshots,
                cancellationToken: cancellationToken);
        }

        private static string GetContentType(string fileName, string? contentType)
        {
            if (!string.IsNullOrWhiteSpace(contentType) &&
                !string.Equals(contentType, "application/octet-stream", StringComparison.OrdinalIgnoreCase))
            {
                return contentType;
            }

            return Path.GetExtension(fileName).ToLowerInvariant() switch
            {
                ".pdf" => "application/pdf",
                ".txt" => "text/plain",
                ".csv" => "text/csv",
                ".doc" => "application/msword",
                ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".tif" or ".tiff" => "image/tiff",
                _ => "application/octet-stream"
            };
        }
    }
}

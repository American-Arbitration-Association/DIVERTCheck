//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Data;
using api.Models;
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace api.Services
{
    public class DocumentService : IDocumentService
    {
        private const string SubmittedByCodeType = "DOCUMENT_SUBMITTED_BY";
        private readonly ICaseRepository _caseRepository;
        private readonly IDocumentRepository _documentRepository;
        private readonly IBlobStorageService _blobStorageService;
        private readonly DivertCheckDbContext _db;
        private readonly string _azureStorageContainerName;

        public DocumentService(
            DivertCheckDbContext db,
            ICaseRepository caseRepository,
            IDocumentRepository documentRepository,
            IBlobStorageService blobStorageService,
            IConfiguration configuration)
        {
            _db = db;
            _caseRepository = caseRepository;
            _documentRepository = documentRepository;
            _blobStorageService = blobStorageService;
            _azureStorageContainerName = configuration["AzureStorage:ContainerName"] ?? "your_container_name";
        }

        /*
           Returns the document metadata shown in the frontend case view.
           The frontend now builds its own view/download links from DocumentId.
        */
        public async Task<IEnumerable<CaseDocumentListItemViewModel>?> GetCaseDocumentsAsync(long caseId)
        {
            var caseEntity = await _caseRepository.GetCaseWithActiveDocumentsByIdAsync(caseId);
            if (caseEntity == null)
                return null;

            return caseEntity.CaseDocuments
                .OrderByDescending(caseDocument => caseDocument.UploadedAt)
                .Select(MapToCaseDocumentListItem);
        }

        /* Persists the uploaded file reference and returns the new document
           metadata used by the case document list and AI queue flow. */
        public async Task<DocumentUploadResultViewModel> UploadDocumentAsync(
            long caseId,
            IFormFile file,
            string submittedBy,
            bool isTransactionEvidenceDocument = false)
        {
            if (file == null || file.Length == 0)
                throw new ArgumentException("No file was uploaded.");

            var submittedByCode = await ResolveSubmittedByCodeAsync(submittedBy);

            await EnsureCaseExistsAsync(caseId);

            var azureStorageId = await _blobStorageService.UploadAsync(file, _azureStorageContainerName);
            var caseDocument = CreateCaseDocument(
                caseId,
                file,
                azureStorageId,
                submittedByCode,
                isTransactionEvidenceDocument);

            await _documentRepository.AddDocumentAsync(caseDocument);

            return MapToUploadResult(caseDocument);
        }

        public async Task<IReadOnlyCollection<DocumentUploadResultViewModel>> UploadDocumentsAsync(
            long caseId,
            IEnumerable<IFormFile> documents,
            IReadOnlyList<string> submittedByValues,
            IReadOnlyList<bool>? transactionEvidenceValues = null)
        {
            var uploads = ResolveUploadedDocuments(documents, submittedByValues);
            var transactionEvidence = transactionEvidenceValues ?? [];
            var results = new List<DocumentUploadResultViewModel>(uploads.Count);

            for (var index = 0; index < uploads.Count; index++)
            {
                var upload = uploads[index];
                results.Add(await UploadDocumentAsync(
                    caseId,
                    upload.Document,
                    upload.SubmittedBy,
                    index < transactionEvidence.Count && transactionEvidence[index]));
            }

            return results;
        }

        public async Task<bool> DeleteDocumentAsync(long documentId)
        {
            var caseDocument = await _documentRepository.GetDocumentByIdAsync(documentId);
            if (caseDocument == null)
                return false;

            DeactivateDocument(caseDocument);

            await _documentRepository.UpdateDocumentAsync(caseDocument);
            await _blobStorageService.DeleteIfExistsAsync(
                caseDocument.AzureStorageId,
                _azureStorageContainerName);

            return true;
        }

        public async Task<bool> SetTransactionEvidenceDocumentAsync(
            long documentId,
            bool isTransactionEvidenceDocument)
        {
            var caseDocument = await _documentRepository.GetDocumentByIdAsync(documentId);
            if (caseDocument == null)
                return false;

            caseDocument.IsFinancialDocument = isTransactionEvidenceDocument;
            await _documentRepository.UpdateDocumentAsync(caseDocument);
            return true;
        }

        public async Task<bool> UpdateDocumentSubmittedByAsync(
            long caseId,
            long documentId,
            string submittedBy)
        {
            if (caseId <= 0)
                throw new ArgumentException("A valid case id is required.", nameof(caseId));
            if (documentId <= 0)
                throw new ArgumentException("A valid document id is required.", nameof(documentId));

            var caseDocument = await _documentRepository.GetDocumentByIdAsync(documentId);
            if (caseDocument == null || caseDocument.CaseId != caseId)
                return false;

            var submittedByCode = await ResolveSubmittedByCodeAsync(submittedBy);

            caseDocument.SubmittedByIndCode = SubmittedByCodeType;
            caseDocument.SubmittedBy = submittedByCode;

            await _documentRepository.UpdateDocumentAsync(caseDocument);
            return true;
        }

        /*
           Pulls the blob stream plus content metadata used by both the direct
           download endpoint and the inline viewer endpoint for the frontend.
        */
        public async Task<(Stream Stream, string ContentType, string FileName)> DownloadDocumentAsync(long documentId)
        {
            var caseDocument = await _documentRepository.GetDocumentByIdAsync(documentId);
            if (caseDocument == null)
                throw new FileNotFoundException("Document was not found.");

            var blobDownloadResult = await _blobStorageService.DownloadAsync(
                caseDocument.AzureStorageId,
                _azureStorageContainerName);

            return (
                blobDownloadResult.Stream,
                GetDownloadContentType(caseDocument.DocumentName, blobDownloadResult.ContentType),
                caseDocument.DocumentName
            );
        }

        public async Task<IEnumerable<DocumentSubmittedByViewModel>> GetDocumentSubmittedByAsync(CancellationToken cancellationToken = default)
        {
            return await _db.CodeValues
                .AsNoTracking()
                .Where(codeValue =>
                    codeValue.CodeTypeCode == SubmittedByCodeType &&
                    codeValue.IsRecordActive)
                .OrderBy(codeValue => codeValue.SortOrder ?? long.MaxValue)
                .ThenBy(codeValue => codeValue.ShortDescription)
                .Select(codeValue => new DocumentSubmittedByViewModel(
                    codeValue.Value,
                    codeValue.ShortDescription))
                .ToListAsync(cancellationToken);
        }

        private async Task EnsureCaseExistsAsync(long caseId)
        {
            var caseEntity = await _caseRepository.GetCaseWithActiveDocumentsByIdAsync(caseId);
            if (caseEntity == null)
                throw new KeyNotFoundException($"Case {caseId} was not found.");
        }

        private async Task<string> ResolveSubmittedByCodeAsync(string submittedBy)
        {
            if (string.IsNullOrWhiteSpace(submittedBy))
                throw new ArgumentException("Submitted By is required.");

            var normalizedCode = submittedBy.Trim().ToUpperInvariant();
            var isValidCode = await _db.CodeValues.AnyAsync(codeValue =>
                codeValue.CodeTypeCode == SubmittedByCodeType &&
                codeValue.Value == normalizedCode &&
                codeValue.IsRecordActive);

            if (!isValidCode)
                throw new ArgumentException("Submitted By must be a valid code.");

            return normalizedCode;
        }

        private static CaseDocument CreateCaseDocument(
            long caseId,
            IFormFile file,
            string azureStorageId,
            string submittedByCode,
            bool isTransactionEvidenceDocument)
        {
            var uploadedAt = DateTime.UtcNow;

            return new CaseDocument
            {
                CaseId = caseId,
                DocumentName = Path.GetFileName(file.FileName),
                AzureStorageId = azureStorageId,
                UploadedAt = uploadedAt,
                FileSize = file.Length,
                SubmittedByIndCode = SubmittedByCodeType,
                SubmittedBy = submittedByCode,
                IsFinancialDocument = isTransactionEvidenceDocument,
                IsRecordActive = true
            };
        }

        private static void DeactivateDocument(CaseDocument caseDocument)
        {
            caseDocument.IsRecordActive = false;
        }

        private static CaseDocumentListItemViewModel MapToCaseDocumentListItem(CaseDocument caseDocument)
        {
            return new CaseDocumentListItemViewModel(
                caseDocument.DocumentId,
                $"/api/v1/Cases/documents/{caseDocument.DocumentId}/content",
                caseDocument.CaseId,
                caseDocument.DocumentName,
                caseDocument.FileSize,
                caseDocument.UploadedAt,
                caseDocument.SubmittedBy,
                caseDocument.IsFinancialDocument
            );
        }

        private static DocumentUploadResultViewModel MapToUploadResult(CaseDocument caseDocument)
        {
            return new DocumentUploadResultViewModel(
                caseDocument.DocumentId,
                $"/api/v1/Cases/documents/{caseDocument.DocumentId}/content",
                caseDocument.CaseId,
                caseDocument.DocumentName,
                caseDocument.FileSize,
                caseDocument.UploadedAt,
                caseDocument.SubmittedBy,
                caseDocument.IsFinancialDocument
            );
        }

        private static string GetDownloadContentType(string fileName, string? contentType)
        {
            if (!string.IsNullOrWhiteSpace(contentType) &&
                !string.Equals(contentType, "application/octet-stream", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(contentType, "binary/octet-stream", StringComparison.OrdinalIgnoreCase))
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

        private static IReadOnlyList<DocumentUploadSelection> ResolveUploadedDocuments(
            IEnumerable<IFormFile> documents,
            IReadOnlyList<string> submittedByValues)
        {
            var uploadedDocuments = documents.Where(file => file.Length > 0).ToArray();
            if (uploadedDocuments.Length == 0)
                return [];
            if (submittedByValues.Count == 0)
                throw new ArgumentException("Submitted By is required for every uploaded document.");
            if (submittedByValues.Count != 1 && submittedByValues.Count != uploadedDocuments.Length)
                throw new ArgumentException("Submitted By must be provided once for all uploaded documents or once per uploaded document.");

            var uploads = uploadedDocuments
                .Select((document, index) => new DocumentUploadSelection(
                    document,
                    submittedByValues.Count == 1 ? submittedByValues[0] : submittedByValues[index]))
                .ToArray();
            if (uploads.Any(upload => string.IsNullOrWhiteSpace(upload.SubmittedBy)))
                throw new ArgumentException("Submitted By is required for every uploaded document.");

            return uploads;
        }

        private sealed record DocumentUploadSelection(IFormFile Document, string SubmittedBy);

    }
}

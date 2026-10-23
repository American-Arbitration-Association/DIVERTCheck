//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.ViewModels;
using Microsoft.AspNetCore.Http;

namespace api.Services.Interfaces
{
    public interface IDocumentService
    {
        Task<IEnumerable<CaseDocumentListItemViewModel>?> GetCaseDocumentsAsync(long caseId);
        Task<DocumentUploadResultViewModel> UploadDocumentAsync(
            long caseId,
            IFormFile file,
            string submittedBy,
            bool isTransactionEvidenceDocument = false);
        Task<IReadOnlyCollection<DocumentUploadResultViewModel>> UploadDocumentsAsync(
            long caseId,
            IEnumerable<IFormFile> documents,
            IReadOnlyList<string> submittedByValues,
            IReadOnlyList<bool>? transactionEvidenceValues = null);
        Task<bool> SetTransactionEvidenceDocumentAsync(long documentId, bool isTransactionEvidenceDocument);
        Task<bool> UpdateDocumentSubmittedByAsync(long caseId, long documentId, string submittedBy);
        Task<bool> DeleteDocumentAsync(long documentId);
        Task<(Stream Stream, string ContentType, string FileName)> DownloadDocumentAsync(long documentId);
        Task<IEnumerable<DocumentSubmittedByViewModel>> GetDocumentSubmittedByAsync(CancellationToken cancellationToken = default);
    }
}

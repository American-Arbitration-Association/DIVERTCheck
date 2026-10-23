//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels
{
    public record DocumentUploadResultViewModel(
        long DocumentId,
        string DocumentUrl,
        long CaseId,
        string DocumentName,
        long? FileSize,
        DateTime UploadedAt,
        string? SubmittedBy = null,
        bool IsTransactionEvidenceDocument = false
    );
}

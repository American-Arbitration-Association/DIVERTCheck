//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public sealed record ReviewedDocumentViewModel(
    long AiResponseDocumentId,
    long DocumentId,
    string DocumentUrl,
    string DocumentName,
    long? FileSize,
    string? SubmittedBy,
    bool IsTransactionEvidenceDocument);

//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;

namespace api.Data
{
    public interface IDocumentRepository
    {
        Task AddDocumentAsync(CaseDocument document);
        Task<CaseDocument?> GetDocumentByIdAsync(long documentId);
        Task UpdateDocumentAsync(CaseDocument document);
    }
}

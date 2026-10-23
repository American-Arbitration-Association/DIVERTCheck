//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;

namespace api.Data
{
    public interface ICaseRepository
    {
        Task<IEnumerable<Case>> GetCasesAsync();
        Task<Case?> GetCaseWithActiveDocumentsByIdAsync(long caseId);
        Task AddCaseAsync(Case caseEntity);
        Task<Case?> GetActiveCaseByCaseNumberAsync(string caseNumber);
        Task UpdateCaseAsync(Case caseEntity);
    }
}

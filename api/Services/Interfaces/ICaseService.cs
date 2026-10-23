//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.ViewModels;
using Microsoft.AspNetCore.Http;

namespace api.Services.Interfaces
{
    public interface ICaseService
    {
        Task<IEnumerable<CaseListItemViewModel>> GetCasesAsync();
        Task<CaseViewModel?> GetCaseByIdAsync(long caseId);
        Task<CaseListItemViewModel> CreateCaseAsync(CreateCaseRequestViewModel request);
        Task<bool> DeleteCaseAsync(long caseId);
    }
}

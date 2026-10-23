//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels
{
    public record CaseListItemViewModel(
        long CaseId,
        string CaseNumber,
        string CaseName,
        DateOnly? FilingDate,
        bool IsRecordActive,
        DateTime ModifiedDttm
    );
}

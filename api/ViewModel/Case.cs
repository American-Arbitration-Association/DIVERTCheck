//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels
{
    public record CaseViewModel(
        string CaseName,
        string CaseNumber,
        DateOnly FilingDate,
        string[] DocumentNames,
        bool IsRecordActive,
        DateTime ReviewDate,
        string Reason
    );
}

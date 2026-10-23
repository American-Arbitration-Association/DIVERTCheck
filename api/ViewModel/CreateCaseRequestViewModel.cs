//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels
{
    public class CreateCaseRequestViewModel
    {
        public string CaseNumber { get; set; } = null!;
        public string CaseName { get; set; } = null!;
        public DateOnly? FilingDate { get; set; }

        public List<IFormFile> Documents { get; set; } = [];
        public List<string> SubmittedBy { get; set; } = [];
        public List<bool> TransactionEvidence { get; set; } = [];
    }
}

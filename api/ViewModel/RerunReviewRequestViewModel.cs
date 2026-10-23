//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using Microsoft.AspNetCore.Http;

namespace api.ViewModels
{
    public class RerunReviewRequestViewModel
    {
        public List<IFormFile> Documents { get; set; } = [];

        public List<string> SubmittedBy { get; set; } = [];

        public List<long> DocumentIds { get; set; } = [];

        public List<bool> TransactionEvidence { get; set; } = [];

        public long? PromptConfigurationId { get; set; }
    }
}

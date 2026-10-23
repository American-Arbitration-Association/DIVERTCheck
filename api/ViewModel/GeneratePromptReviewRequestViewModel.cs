//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using Microsoft.AspNetCore.Http;

namespace api.ViewModels;

public sealed class GeneratePromptReviewRequestViewModel
{
    public IFormFile? File { get; set; }

    public string? PromptType { get; set; }
}

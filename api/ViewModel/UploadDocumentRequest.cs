//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using Microsoft.AspNetCore.Http;

namespace api.ViewModels
{
    public class UploadDocumentRequest
    {
        public IFormFile File { get; set; } = null!;

        public string SubmittedBy { get; set; } = null!;
    }
}

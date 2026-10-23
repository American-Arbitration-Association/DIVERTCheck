//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class DocumentVisionExtraction
{
    public long DocumentVisionExtractionId { get; set; }

    public long DocumentId { get; set; }

    public string DocumentHash { get; set; } = null!;

    public string? VisionExtractedAzureDocumentId { get; set; }

    public long PromptConfigurationId { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public virtual CaseDocument Document { get; set; } = null!;

    public virtual PromptConfiguration PromptConfiguration { get; set; } = null!;
}

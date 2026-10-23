//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class CaseDocument
{
    public long DocumentId { get; set; }

    public long CaseId { get; set; }

    public string DocumentName { get; set; } = null!;

    public string AzureStorageId { get; set; } = null!;

    public DateTime UploadedAt { get; set; }

    public long? FileSize { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public string SubmittedByIndCode { get; set; } = null!;

    public string? SubmittedBy { get; set; }

    public bool IsFinancialDocument { get; set; }

    public virtual ICollection<AiResponseDocument> AiResponseDocuments { get; set; } = new List<AiResponseDocument>();

    public virtual Case Case { get; set; } = null!;

    public virtual CodeValue? CodeValue { get; set; }

    public virtual ICollection<DocumentVisionExtraction> DocumentVisionExtractions { get; set; } = new List<DocumentVisionExtraction>();
}

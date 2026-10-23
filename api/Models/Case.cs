//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class Case
{
    public long CaseId { get; set; }

    public string CaseNumber { get; set; } = null!;

    public string CaseName { get; set; } = null!;

    public DateOnly? FilingDate { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public virtual ICollection<AiResponse> AiResponses { get; set; } = new List<AiResponse>();

    public virtual ICollection<CaseDocument> CaseDocuments { get; set; } = new List<CaseDocument>();
}

//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class AiResponseDocument
{
    public long AiResponseDocumentId { get; set; }

    public long DocumentId { get; set; }

    public long AiResponseId { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public virtual AiResponse AiResponse { get; set; } = null!;

    public virtual CaseDocument Document { get; set; } = null!;
}

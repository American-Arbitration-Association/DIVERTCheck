//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class CodeType
{
    public string CodeTypeCode { get; set; } = null!;

    public string Label { get; set; } = null!;

    public string? ShortDescription { get; set; }

    public string? LongDescription { get; set; }

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public virtual ICollection<CodeValue> CodeValues { get; set; } = new List<CodeValue>();
}

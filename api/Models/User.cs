//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Collections.Generic;

namespace api.Models;

public partial class User
{
    public long UserId { get; set; }

    public string Email { get; set; } = null!;

    public string RoleIndCode { get; set; } = null!;

    public string RoleCode { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public bool IsRecordActive { get; set; }

    public long CreatedUser { get; set; }

    public DateTime CreatedDttm { get; set; }

    public long ModifiedUser { get; set; }

    public DateTime ModifiedDttm { get; set; }

    public int VersionId { get; set; }

    public int FailedLoginAttempts { get; set; }

    public bool IsAccountLocked { get; set; }

    public DateTime? AccountLockedUntilDttm { get; set; }

    public DateTime? LastLoginDttm { get; set; }

    public virtual CodeValue CodeValue { get; set; } = null!;
}

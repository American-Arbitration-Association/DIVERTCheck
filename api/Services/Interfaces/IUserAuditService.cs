//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.Services.Interfaces;

public interface IUserAuditService
{
    /* The user that audit columns are stamped with: the acting user set by ActAs when
       one is in scope, otherwise the authenticated request user, falling back to the
       system user (0) when neither is available. */
    long CurrentUserId { get; }

    /* Overrides the acting user until the returned scope is disposed. Background work
       has no HttpContext, so the queue worker uses this to attribute writes to the
       user that queued the job. */
    IDisposable ActAs(long userId);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

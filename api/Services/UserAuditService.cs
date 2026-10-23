//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Security.Claims;
using api.Models;
using api.Services.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace api.Services;

public sealed class UserAuditService(
    DivertCheckDbContext db,
    IHttpContextAccessor httpContextAccessor,
    ILogger<UserAuditService> logger) : IUserAuditService
{
    private const long SystemUserId = 0;
    private const long NoActingUser = -1;

    /* Read by the lease heartbeat while the job thread owns the scope, so the field
       is accessed through Volatile to avoid a torn or stale read. */
    private long _actingUserId = NoActingUser;

    public long CurrentUserId
    {
        get
        {
            var actingUserId = Volatile.Read(ref _actingUserId);

            return actingUserId == NoActingUser ? RequestUserId : actingUserId;
        }
    }

    private long RequestUserId
    {
        get
        {
            // No request at all is the normal background case and is not worth a warning.
            var requestUser = httpContextAccessor.HttpContext?.User;
            if (requestUser is null)
                return SystemUserId;

            var nameIdentifier = requestUser.FindFirstValue(ClaimTypes.NameIdentifier);
            if (long.TryParse(nameIdentifier, out var userId) && userId > 0)
                return userId;

            /* Falling back on an authenticated request means the token is not carrying a
               usable id, which writes the system user into every audit column for this
               request. Spell out what the principal held so the cause is visible. */
            if (requestUser.Identity?.IsAuthenticated == true)
            {
                logger.LogWarning(
                    "Audit columns fell back to the system user on an authenticated request. "
                    + "The '{ClaimType}' claim was '{NameIdentifier}'. Claims present: {PresentClaims}.",
                    ClaimTypes.NameIdentifier,
                    nameIdentifier ?? "<missing>",
                    string.Join(", ", requestUser.Claims.Select(claim => claim.Type).Distinct()));
            }

            return SystemUserId;
        }
    }

    public IDisposable ActAs(long userId)
    {
        var previousActingUserId = Volatile.Read(ref _actingUserId);
        Volatile.Write(ref _actingUserId, userId > 0 ? userId : SystemUserId);

        return new ActingUserScope(this, previousActingUserId);
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var userId = CurrentUserId;

        foreach (var entry in db.ChangeTracker.Entries()
                     .Where(entry => entry.State is EntityState.Added or EntityState.Modified))
        {
            if (entry.Metadata.FindProperty("CreatedUser") is not null && entry.State == EntityState.Added)
                entry.Property("CreatedUser").CurrentValue = userId;

            if (entry.Metadata.FindProperty("ModifiedUser") is not null)
                entry.Property("ModifiedUser").CurrentValue = userId;
        }

        return db.SaveChangesAsync(cancellationToken);
    }

    private sealed class ActingUserScope(UserAuditService auditService, long previousActingUserId) : IDisposable
    {
        private bool _isDisposed;

        public void Dispose()
        {
            if (_isDisposed)
                return;

            _isDisposed = true;
            Volatile.Write(ref auditService._actingUserId, previousActingUserId);
        }
    }
}

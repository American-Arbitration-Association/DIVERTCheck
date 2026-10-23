//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.Services.Interfaces;

public interface IEmailService
{
    Task SendPasswordResetCodeAsync(
        string email,
        string securityCode,
        TimeSpan expiresAfter,
        CancellationToken cancellationToken = default);
}

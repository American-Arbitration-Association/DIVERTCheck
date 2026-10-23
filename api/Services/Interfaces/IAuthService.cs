//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.ViewModels;

namespace api.Services.Interfaces;

public interface IAuthService
{
    Task<AuthUserViewModel> CreateUserAsync(
        AuthCreateUserRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<AuthLoginResult> LoginAsync(
        AuthLoginRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<PasswordResetCodeVerificationResult> IsPasswordResetEmailValidAsync(
        AuthVerifyPasswordResetRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<TimeSpan> GeneratePasswordResetOtpAsync(
        AuthForgotPasswordRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task ResetPasswordAsync(
        AuthResetPasswordRequestViewModel request,
        CancellationToken cancellationToken = default);

    Task<AuthUserViewModel?> GetUserAsync(
        long userId,
        CancellationToken cancellationToken = default);
}

public sealed record AuthLoginResult(
    AuthLoginResponseViewModel? Response,
    DateTimeOffset? LockedUntilUtc);

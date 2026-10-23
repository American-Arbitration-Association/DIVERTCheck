//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.Services.Interfaces;

public interface IPasswordResetCodeService
{
    TimeSpan CodeLifetime { get; }

    string CreateCode(string email);

    PasswordResetCodeVerificationResult VerifyCode(string email, string securityCode);

    bool TryConsumeResetAuthorization(string email);
}

public enum PasswordResetCodeVerificationResult
{
    Valid,
    Invalid,
    Expired,
    TooManyAttempts
}

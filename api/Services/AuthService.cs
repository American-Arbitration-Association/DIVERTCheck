//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Security.Cryptography;
using System.Text;
using System.Net.Mail;
using api.Models;
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.EntityFrameworkCore;

namespace api.Services;

public class AuthService(
    DivertCheckDbContext context,
    ITokenService tokenService,
    IPasswordResetCodeService passwordResetCodeService,
    IEmailService emailService,
    IUserAuditService userAuditService) : IAuthService
{
    private const string UserRoleCodeType = "USER_ROLE";
    private const string DefaultRegistrationRoleCode = "USER";
    private const string InvalidResetAuthorizationMessage = "Password reset verification is invalid or expired.";
    private const int FailedLoginLimit = 4;
    private static readonly TimeSpan AccountLockDuration = TimeSpan.FromMinutes(15);

    public async Task<AuthUserViewModel> CreateUserAsync(
        AuthCreateUserRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        var email = NormalizeEmail(request.Email);
        if (MissingCredentials(email, request.Password) || !IsValidEmail(email))
        {
            throw new ArgumentException("A valid email and password are required.");
        }

        if (await EmailExistsAsync(email, cancellationToken))
        {
            throw new InvalidOperationException("User already exists.");
        }

        var user = new User
        {
            Email = email,
            PasswordHash = HashPassword(request.Password),
            RoleIndCode = UserRoleCodeType,
            RoleCode = await ResolveRoleCodeAsync(request.RoleCode, cancellationToken),
            IsRecordActive = true
        };

        context.Users.Add(user);
        await userAuditService.SaveChangesAsync(cancellationToken);

        return ToViewModel(user);
    }

    public async Task<AuthLoginResult> LoginAsync(
        AuthLoginRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        var email = NormalizeEmail(request.Email);
        if (MissingCredentials(email, request.Password))
        {
            return new(null, null);
        }

        var user = await FindActiveUserByEmailAsync(email, asNoTracking: false, cancellationToken);
        if (user == null)
        {
            return new(null, null);
        }

        var now = CreateDatabaseTimestamp();
        if (user.IsAccountLocked)
        {
            if (user.AccountLockedUntilDttm > now)
                return LockedLoginResult(user.AccountLockedUntilDttm.Value);

            ResetLoginLockout(user);
        }

        if (!VerifyPassword(request.Password, user.PasswordHash))
        {
            user.FailedLoginAttempts += 1;
            if (user.FailedLoginAttempts >= FailedLoginLimit)
            {
                user.IsAccountLocked = true;
                user.AccountLockedUntilDttm = now.Add(AccountLockDuration);
            }

            await userAuditService.SaveChangesAsync(cancellationToken);

            return user.IsAccountLocked
                ? LockedLoginResult(user.AccountLockedUntilDttm!.Value)
                : new(null, null);
        }

        if (HasLoginFailureState(user))
            ResetLoginLockout(user);

        user.LastLoginDttm = now;
        await userAuditService.SaveChangesAsync(cancellationToken);

        return new(
            new AuthLoginResponseViewModel(tokenService.GenerateToken(user), ToViewModel(user)),
            null);
    }

    public async Task<PasswordResetCodeVerificationResult> IsPasswordResetEmailValidAsync(
        AuthVerifyPasswordResetRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        var email = GetValidEmail(request.Email);
        if (string.IsNullOrWhiteSpace(request.SecurityCode))
        {
            throw new ArgumentException("A valid email and security code are required.");
        }

        if (!await ActiveUserExistsAsync(email, cancellationToken))
        {
            throw new KeyNotFoundException("No active account exists for that email.");
        }

        return passwordResetCodeService.VerifyCode(email, request.SecurityCode.Trim());
    }

    public async Task<TimeSpan> GeneratePasswordResetOtpAsync(
        AuthForgotPasswordRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        var email = GetValidEmail(request.Email);
        if (!await ActiveUserExistsAsync(email, cancellationToken))
        {
            throw new KeyNotFoundException("No active account exists for that email.");
        }

        var securityCode = passwordResetCodeService.CreateCode(email);
        await emailService.SendPasswordResetCodeAsync(
            email,
            securityCode,
            passwordResetCodeService.CodeLifetime,
            cancellationToken);

        return passwordResetCodeService.CodeLifetime;
    }

    public async Task ResetPasswordAsync(
        AuthResetPasswordRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        var email = NormalizeEmail(request.Email);
        if (MissingCredentials(email, request.NewPassword)
            || !IsValidEmail(email))
        {
            throw new ArgumentException("A valid email and new password are required.");
        }

        if (!passwordResetCodeService.TryConsumeResetAuthorization(email))
        {
            throw new UnauthorizedAccessException(InvalidResetAuthorizationMessage);
        }

        var user = await FindActiveUserByEmailAsync(email, asNoTracking: false, cancellationToken)
            ?? throw new UnauthorizedAccessException(InvalidResetAuthorizationMessage);

        user.PasswordHash = HashPassword(request.NewPassword);
        await userAuditService.SaveChangesAsync(cancellationToken);
    }

    public async Task<AuthUserViewModel?> GetUserAsync(
        long userId,
        CancellationToken cancellationToken = default)
    {
        var user = await context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(
                candidate => candidate.IsRecordActive && candidate.UserId == userId,
                cancellationToken);

        return user == null ? null : ToViewModel(user);
    }

    private Task<bool> ActiveUserExistsAsync(string email, CancellationToken cancellationToken) =>
        context.Users.AnyAsync(
            user => user.IsRecordActive
                && user.Email != null
                && user.Email.Trim().ToUpper() == email,
            cancellationToken);

    private Task<bool> EmailExistsAsync(string email, CancellationToken cancellationToken) =>
        context.Users.AnyAsync(
            user => user.Email != null
                && user.Email.Trim().ToUpper() == email,
            cancellationToken);

    private Task<User?> FindActiveUserByEmailAsync(
        string email,
        bool asNoTracking,
        CancellationToken cancellationToken)
    {
        var users = asNoTracking
            ? context.Users.AsNoTracking()
            : context.Users.AsQueryable();

        return users.FirstOrDefaultAsync(
            user => user.IsRecordActive
                && user.Email != null
                && user.Email.Trim().ToUpper() == email,
            cancellationToken);
    }

    private async Task<string> ResolveRoleCodeAsync(string? requestedRoleCode, CancellationToken cancellationToken)
    {
        var roleCode = string.IsNullOrWhiteSpace(requestedRoleCode)
            ? DefaultRegistrationRoleCode
            : requestedRoleCode.Trim().ToUpperInvariant();

        var configuredRoleCode = await context.CodeValues
            .Where(code => code.IsRecordActive
                && code.CodeTypeCode == UserRoleCodeType
                && code.Value == roleCode)
            .Select(code => code.Value)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(configuredRoleCode)
            ? throw new ArgumentException("Role code is invalid.")
            : configuredRoleCode;
    }

    private static AuthUserViewModel ToViewModel(User user) =>
        new(user.UserId, user.Email, user.RoleCode, user.RoleIndCode, user.LastLoginDttm);

    private static string NormalizeEmail(string? email) =>
        email?.Trim().ToUpperInvariant() ?? string.Empty;

    private static string GetValidEmail(string? value)
    {
        var email = NormalizeEmail(value);
        return IsValidEmail(email)
            ? email
            : throw new ArgumentException("A valid email is required.");
    }

    private static bool IsValidEmail(string email) =>
        MailAddress.TryCreate(email, out var mailAddress)
        && string.Equals(mailAddress.Address, email, StringComparison.OrdinalIgnoreCase);

    private static bool MissingCredentials(string email, string? password) =>
        string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password);

    private static DateTime CreateDatabaseTimestamp() =>
        DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified);

    private static AuthLoginResult LockedLoginResult(DateTime lockedUntil) =>
        new(
            null,
            new DateTimeOffset(DateTime.SpecifyKind(lockedUntil, DateTimeKind.Utc)));

    private static bool HasLoginFailureState(User user) =>
        user.FailedLoginAttempts > 0
        || user.IsAccountLocked
        || user.AccountLockedUntilDttm.HasValue;

    private static void ResetLoginLockout(User user)
    {
        user.FailedLoginAttempts = 0;
        user.IsAccountLocked = false;
        user.AccountLockedUntilDttm = null;
    }

    private static string HashPassword(string password) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(password)));

    private static bool VerifyPassword(string password, string storedPasswordHash) =>
        !string.IsNullOrEmpty(storedPasswordHash)
        && (VerifySha256Password(password, storedPasswordHash)
            || FixedTimeEquals(password, storedPasswordHash));

    private static bool VerifySha256Password(string password, string storedPasswordHash)
    {
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));

        return storedPasswordHash.Length == 64 && IsHex(storedPasswordHash)
            ? FixedTimeEquals(Convert.ToHexString(hashBytes), storedPasswordHash.ToUpperInvariant())
            : TryFromBase64String(storedPasswordHash, out var storedBytes)
                && storedBytes.Length == hashBytes.Length
                && CryptographicOperations.FixedTimeEquals(hashBytes, storedBytes);
    }

    private static bool IsHex(string value) =>
        value.All(character =>
            character is >= '0' and <= '9'
            || character is >= 'a' and <= 'f'
            || character is >= 'A' and <= 'F');

    private static bool TryFromBase64String(string value, out byte[] bytes)
    {
        try
        {
            bytes = Convert.FromBase64String(value);
            return true;
        }
        catch (FormatException)
        {
            bytes = [];
            return false;
        }
    }

    private static bool FixedTimeEquals(string value, string expected)
    {
        var valueBytes = Encoding.UTF8.GetBytes(value);
        var expectedBytes = Encoding.UTF8.GetBytes(expected);

        return valueBytes.Length == expectedBytes.Length
            && CryptographicOperations.FixedTimeEquals(valueBytes, expectedBytes);
    }
}

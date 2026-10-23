//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using api.Services.Interfaces;

namespace api.Services;

public class PasswordResetCodeService : IPasswordResetCodeService
{
    private readonly ConcurrentDictionary<string, PasswordResetCode> _codes = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _resetAuthorizations = new();

    private const int MaximumVerificationAttempts = 5;

    public TimeSpan CodeLifetime { get; } = TimeSpan.FromMinutes(10);

    public string CreateCode(string email)
    {
        var normalizedEmail = NormalizeEmail(email);
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var salt = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));

        _resetAuthorizations.TryRemove(normalizedEmail, out _);
        _codes[normalizedEmail] = new PasswordResetCode(
            HashCode(code, salt),
            salt,
            DateTimeOffset.UtcNow.Add(CodeLifetime));

        return code;
    }

    public PasswordResetCodeVerificationResult VerifyCode(string email, string securityCode)
    {
        var normalizedEmail = NormalizeEmail(email);
        if (!_codes.TryGetValue(normalizedEmail, out var resetCode))
        {
            return PasswordResetCodeVerificationResult.Invalid;
        }

        if (DateTimeOffset.UtcNow >= resetCode.ExpiresAt)
        {
            TryRemoveCode(normalizedEmail, resetCode);
            return PasswordResetCodeVerificationResult.Expired;
        }

        // Reserve the attempt before comparing so concurrent guesses cannot exceed the limit.
        var attempt = Interlocked.Increment(ref resetCode.Attempts);
        if (attempt > MaximumVerificationAttempts)
        {
            TryRemoveCode(normalizedEmail, resetCode);
            return PasswordResetCodeVerificationResult.TooManyAttempts;
        }

        if (!FixedTimeEquals(HashCode(securityCode, resetCode.Salt), resetCode.CodeHash))
        {
            if (attempt < MaximumVerificationAttempts)
                return PasswordResetCodeVerificationResult.Invalid;

            TryRemoveCode(normalizedEmail, resetCode);
            return PasswordResetCodeVerificationResult.TooManyAttempts;
        }

        if (!TryRemoveCode(normalizedEmail, resetCode))
            return PasswordResetCodeVerificationResult.Invalid;

        _resetAuthorizations[normalizedEmail] = resetCode.ExpiresAt;
        return PasswordResetCodeVerificationResult.Valid;
    }

    public bool TryConsumeResetAuthorization(string email) =>
        _resetAuthorizations.TryRemove(NormalizeEmail(email), out var expiresAt)
        && DateTimeOffset.UtcNow < expiresAt;

    private static string NormalizeEmail(string email) =>
        email.Trim().ToUpperInvariant();

    private bool TryRemoveCode(string email, PasswordResetCode code) =>
        ((ICollection<KeyValuePair<string, PasswordResetCode>>)_codes)
            .Remove(new(email, code));

    private static string HashCode(string securityCode, string salt) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{salt}:{securityCode}")));

    private static bool FixedTimeEquals(string value, string expected)
    {
        var valueBytes = Encoding.UTF8.GetBytes(value);
        var expectedBytes = Encoding.UTF8.GetBytes(expected);

        return valueBytes.Length == expectedBytes.Length
            && CryptographicOperations.FixedTimeEquals(valueBytes, expectedBytes);
    }

    private sealed class PasswordResetCode(
        string codeHash,
        string salt,
        DateTimeOffset expiresAt)
    {
        public string CodeHash { get; } = codeHash;
        public string Salt { get; } = salt;
        public DateTimeOffset ExpiresAt { get; } = expiresAt;

        // Mutable field so Interlocked can update it in place.
        public int Attempts;
    }
}

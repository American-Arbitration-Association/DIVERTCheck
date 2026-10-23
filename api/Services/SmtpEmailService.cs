//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Net.Mail;
using api.Models;
using api.Services.Interfaces;
using Microsoft.Extensions.Options;

namespace api.Services;

public class SmtpEmailService(
    IOptions<SmtpOptions> smtpOptions,
    ILogger<SmtpEmailService> logger) : IEmailService
{
    public async Task SendPasswordResetCodeAsync(
        string email,
        string securityCode,
        TimeSpan expiresAfter,
        CancellationToken cancellationToken = default)
    {
        var options = smtpOptions.Value;
        var host = options.Host;
        var fromAddress = options.Username;

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(fromAddress))
        {
            logger.LogWarning(
                "Email SMTP is not configured. Password reset code for {Email}: {SecurityCode}",
                email,
                securityCode);
            return;
        }

        using var message = new MailMessage(
            fromAddress,
            email,
            "Your password reset code",
            $"Your password reset code is {securityCode}. It expires in {(int)expiresAfter.TotalMinutes} minutes.");

        using var client = BuildClient(options);
        await client.SendMailAsync(message, cancellationToken);
    }

    private static SmtpClient BuildClient(SmtpOptions options)
    {
        var client = new SmtpClient(options.Host, options.Port)
        {
            EnableSsl = options.EnableSsl
        };

        return client;
    }
}

//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.Models;

public class SmtpOptions
{
    public string? Host { get; set; }

    public int Port { get; set; } = 25;

    public bool EnableSsl { get; set; } = true;

    public string? Username { get; set; }

    public string? Password { get; set; }
}

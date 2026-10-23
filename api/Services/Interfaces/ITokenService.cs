//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;

namespace api.Services.Interfaces;

public interface ITokenService
{
    string GenerateToken(User user);
}

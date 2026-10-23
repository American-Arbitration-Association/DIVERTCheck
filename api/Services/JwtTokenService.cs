//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using api.Models;
using api.Services.Interfaces;
using Microsoft.IdentityModel.Tokens;

namespace api.Services;

public class JwtTokenService : ITokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration) =>
        _configuration = configuration;

    public string GenerateToken(User user)
    {
        var key = _configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException("Jwt:Key is not configured.");
        }

        var expiresMinutes = int.TryParse(_configuration["Jwt:ExpiresMinutes"], out var minutes)
            ? minutes
            : 60;

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.UserId.ToString()),
            new(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Role, user.RoleCode),
            new("role_ind_code", user.RoleIndCode)
        };

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"] ?? "divertCheck-api",
            audience: _configuration["Jwt:Audience"] ?? "divertCheck-client",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

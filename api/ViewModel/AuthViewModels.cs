//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels;

public record AuthLoginRequestViewModel(
    string Email,
    string Password);

public record AuthLoginResponseViewModel(
    string AccessToken,
    AuthUserViewModel User);

public record AuthCreateUserRequestViewModel(
    string Email,
    string Password,
    string? RoleCode = null);

public record AuthForgotPasswordRequestViewModel(
    string Email);

public record AuthVerifyPasswordResetRequestViewModel(
    string Email,
    string SecurityCode);

public record AuthResetPasswordRequestViewModel(
    string Email,
    string NewPassword);

public record AuthUserViewModel(
    long UserId,
    string Email,
    string RoleCode,
    string RoleIndCode,
    DateTime? LastLoginDttm);

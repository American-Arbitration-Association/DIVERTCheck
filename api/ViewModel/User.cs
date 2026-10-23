//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
namespace api.ViewModels
{
    public record UserViewModel(
        string Email,
        string PasswordHash
    );
}

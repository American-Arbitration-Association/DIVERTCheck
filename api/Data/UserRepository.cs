//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using Microsoft.EntityFrameworkCore;
using api.Models;

namespace api.Data
{
    public class UserRepository
    {
        private readonly DivertCheckDbContext _db;

        public UserRepository(DivertCheckDbContext db)
        {
            _db = db;
        }

        public async Task<User?> GetByEmailAsync(string email)
        {
            return await _db.Users
                .FirstOrDefaultAsync(u => u.Email == email);
        }
    }
}
//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;
using api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace api.Data
{
    public class CaseRepository : ICaseRepository
    {
        private readonly DivertCheckDbContext _db;
        private readonly IUserAuditService _userAuditService;

        public CaseRepository(DivertCheckDbContext db, IUserAuditService userAuditService)
        {
            _db = db;
            _userAuditService = userAuditService;
        }

        public async Task<IEnumerable<Case>> GetCasesAsync()
        {
            return await _db.Cases
                .Where(caseEntity => caseEntity.IsRecordActive)
                .OrderByDescending(caseEntity => caseEntity.ModifiedDttm)
                .ToListAsync();
        }

        public async Task<Case?> GetCaseWithActiveDocumentsByIdAsync(long caseId)
        {
            return await _db.Cases
                .Where(caseEntity => caseEntity.IsRecordActive)
                .Include(caseEntity => caseEntity.CaseDocuments
                    .Where(caseDocument => caseDocument.IsRecordActive))
                .FirstOrDefaultAsync(caseEntity => caseEntity.CaseId == caseId);
        }

        public async Task AddCaseAsync(Case caseEntity)
        {
            _db.Cases.Add(caseEntity);
            await _userAuditService.SaveChangesAsync();
        }

        public async Task<Case?> GetActiveCaseByCaseNumberAsync(string caseNumber)
        {
            return await _db.Cases
                .FirstOrDefaultAsync(caseEntity =>
                    caseEntity.IsRecordActive &&
                    caseEntity.CaseNumber == caseNumber);
        }

        public async Task UpdateCaseAsync(Case caseEntity)
        {
            _db.Cases.Update(caseEntity);
            await _userAuditService.SaveChangesAsync();
        }
    }
}

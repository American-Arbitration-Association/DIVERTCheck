//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;
using api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace api.Data
{
    public class DocumentRepository : IDocumentRepository
    {
        private readonly DivertCheckDbContext _db;
        private readonly IUserAuditService _userAuditService;

        public DocumentRepository(DivertCheckDbContext db, IUserAuditService userAuditService)
        {
            _db = db;
            _userAuditService = userAuditService;
        }

        public async Task AddDocumentAsync(CaseDocument document)
        {
            _db.CaseDocuments.Add(document);
            await _userAuditService.SaveChangesAsync();
        }

        public async Task<CaseDocument?> GetDocumentByIdAsync(long documentId)
        {
            return await _db.CaseDocuments
                .FirstOrDefaultAsync(caseDocument =>
                    caseDocument.DocumentId == documentId &&
                    caseDocument.IsRecordActive);
        }

        public async Task UpdateDocumentAsync(CaseDocument document)
        {
            _db.CaseDocuments.Update(document);
            await _userAuditService.SaveChangesAsync();
        }
    }
}

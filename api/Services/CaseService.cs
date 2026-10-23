//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Data;
using api.Models;
using api.Services.Interfaces;
using api.ViewModels;

namespace api.Services
{
    public class CaseService : ICaseService
    {
        private readonly ICaseRepository _caseRepository;

        public CaseService(ICaseRepository caseRepository)
        {
            _caseRepository = caseRepository;
        }

        public async Task<IEnumerable<CaseListItemViewModel>> GetCasesAsync()
        {
            var caseEntities = await _caseRepository.GetCasesAsync();

            return caseEntities.Select(MapToCaseListItem);
        }

        public async Task<CaseViewModel?> GetCaseByIdAsync(long caseId)
        {
            var caseEntity = await _caseRepository.GetCaseWithActiveDocumentsByIdAsync(caseId);
            if (caseEntity == null)
                return null;

            return MapToCaseView(caseEntity);
        }

        /* Creates a new case from the request fields only. The audit columns are
           stamped by IUserAuditService when the repository saves, and the
           timestamps are set by the database. */
        public async Task<CaseListItemViewModel> CreateCaseAsync(CreateCaseRequestViewModel request)
        {
            ValidateCreateCaseRequest(request);
            var normalizedCaseNumber = request.CaseNumber.Trim();
            var existingCase = await _caseRepository.GetActiveCaseByCaseNumberAsync(normalizedCaseNumber);
            if (existingCase != null)
                throw new InvalidOperationException($"Case number '{normalizedCaseNumber}' already exists.");

            var caseEntity = CreateCaseEntity(request, normalizedCaseNumber);

            await _caseRepository.AddCaseAsync(caseEntity);

            return MapToCaseListItem(caseEntity);
        }

        public async Task<bool> DeleteCaseAsync(long caseId)
        {
            var caseEntity = await _caseRepository.GetCaseWithActiveDocumentsByIdAsync(caseId);
            if (caseEntity == null)
                return false;

            DeactivateCase(caseEntity);

            await _caseRepository.UpdateCaseAsync(caseEntity);

            return true;
        }

        private static void ValidateCreateCaseRequest(CreateCaseRequestViewModel request)
        {
            if (string.IsNullOrWhiteSpace(request.CaseNumber))
                throw new ArgumentException("Case number is required.");

            if (string.IsNullOrWhiteSpace(request.CaseName))
                throw new ArgumentException("Case name is required.");
        }

        private static Case CreateCaseEntity(CreateCaseRequestViewModel request, string normalizedCaseNumber)
        {
            var filingDate = request.FilingDate ?? DateOnly.FromDateTime(DateTime.UtcNow);

            return new Case
            {
                CaseNumber = normalizedCaseNumber,
                CaseName = request.CaseName.Trim(),
                FilingDate = filingDate,
                IsRecordActive = true
            };
        }

        private static void DeactivateCase(Case caseEntity)
        {
            caseEntity.IsRecordActive = false;

            foreach (var caseDocument in caseEntity.CaseDocuments.Where(caseDocument => caseDocument.IsRecordActive))
            {
                caseDocument.IsRecordActive = false;
            }
        }

        private static CaseListItemViewModel MapToCaseListItem(Case caseEntity)
        {
            return new CaseListItemViewModel(
                caseEntity.CaseId,
                caseEntity.CaseNumber,
                caseEntity.CaseName,
                caseEntity.FilingDate,
                caseEntity.IsRecordActive,
                caseEntity.ModifiedDttm
            );
        }

        private static CaseViewModel MapToCaseView(Case caseEntity)
        {
            return new CaseViewModel(
                caseEntity.CaseName,
                caseEntity.CaseNumber,
                caseEntity.FilingDate ?? default,
                caseEntity.CaseDocuments.Select(caseDocument => caseDocument.DocumentName).ToArray(),
                caseEntity.IsRecordActive,
                caseEntity.ModifiedDttm,
                string.Empty
            );
        }
    }
}

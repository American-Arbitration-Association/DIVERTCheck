//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;

namespace api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class CasesController : ControllerBase
{
    private readonly ICaseService _caseService;
    private readonly IDocumentService _documentService;
    private readonly IAiJobService _aiJobService;
    private readonly IReviewService _reviewService;
    private const string DefaultJobType = "ELIGIBILITY_CHECK_RESPONSE";

    public CasesController(
        ICaseService caseService,
        IDocumentService documentService,
        IAiJobService aiJobService,
        IReviewService reviewService)
    {
        _caseService = caseService;
        _documentService = documentService;
        _aiJobService = aiJobService;
        _reviewService = reviewService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<CaseListItemViewModel>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<CaseListItemViewModel>>> Cases()
    {
        var cases = await _caseService.GetCasesAsync();
        return Ok(cases);
    }

    [HttpPost("/api/v1/run-review")]
    [ProducesResponseType(typeof(CaseListItemViewModel), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<CaseListItemViewModel>> CreateCase()
    {
        CaseListItemViewModel? createdCase = null;
        IReadOnlyCollection<DocumentUploadResultViewModel> uploadedDocuments = [];

        try
        {
            var request = await ParseCreateCaseRequestAsync(HttpContext.RequestAborted);

            if (request.Documents == null || !request.Documents.Any(document => document is { Length: > 0 }))
                throw new ArgumentException("At least one document is required to create a case.", nameof(request));

            createdCase = await _caseService.CreateCaseAsync(request);
            uploadedDocuments = await _documentService.UploadDocumentsAsync(
                createdCase.CaseId,
                request.Documents,
                request.SubmittedBy,
                request.TransactionEvidence);
            var documentIds = uploadedDocuments
                .Select(document => document.DocumentId)
                .ToList();

            await _aiJobService.QueueCaseJobAsync(
                createdCase.CaseId,
                new QueueAiJobRequestViewModel
                {
                    JobType = DefaultJobType,
                    DocumentIds = documentIds,
                    UploadedDocumentIds = documentIds
                },
                HttpContext.RequestAborted);

            return CreatedAtAction(nameof(Case), new { id = createdCase.CaseId }, createdCase);
        }
        catch (ArgumentException exception)
        {
            await RemoveIncompleteCaseAsync(createdCase, uploadedDocuments);
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            await RemoveIncompleteCaseAsync(createdCase, uploadedDocuments);
            return Conflict(exception.Message);
        }
        catch
        {
            await RemoveIncompleteCaseAsync(createdCase, uploadedDocuments);
            throw;
        }
    }

    private async Task<CreateCaseRequestViewModel> ParseCreateCaseRequestAsync(CancellationToken cancellationToken)
    {
        if (!Request.HasFormContentType)
        {
            throw new ArgumentException("A multipart/form-data request is required.");
        }

        var form = await Request.ReadFormAsync(cancellationToken);
        var request = new CreateCaseRequestViewModel
        {
            CaseNumber = form["CaseNumber"].ToString(),
            CaseName = form["CaseName"].ToString()
        };

        var filingDateValue = form["FilingDate"].ToString();
        if (!string.IsNullOrWhiteSpace(filingDateValue))
        {
            if (!DateOnly.TryParse(filingDateValue, out var filingDate))
            {
                throw new ArgumentException("FilingDate must be a valid date.");
            }

            request.FilingDate = filingDate;
        }

        var indexedDocuments = new SortedDictionary<int, PendingCreateCaseDocumentEntry>();

        foreach (var file in form.Files)
        {
            if (TryReadIndexedDocumentField(file.Name, out var documentIndex, out var propertyName))
            {
                if (!IsIndexedFileProperty(propertyName))
                {
                    throw new ArgumentException($"{file.Name} must be a file field.");
                }

                GetOrCreatePendingDocument(indexedDocuments, documentIndex).Document = file;
                continue;
            }

            if (string.Equals(file.Name, "Documents", StringComparison.Ordinal) && file.Length > 0)
            {
                request.Documents.Add(file);
            }
        }

        foreach (var formField in form)
        {
            if (!TryReadIndexedDocumentField(formField.Key, out var documentIndex, out var propertyName))
            {
                continue;
            }

            var pendingDocument = GetOrCreatePendingDocument(indexedDocuments, documentIndex);
            switch (propertyName)
            {
                case "SubmittedBy":
                    pendingDocument.SubmittedBy = formField.Value.ToString();
                    break;
                case "TransactionEvidence":
                    pendingDocument.TransactionEvidence =
                        ParseRequiredBoolean(formField.Value.ToString(), formField.Key);
                    break;
                case "Document":
                case "File":
                    break;
                default:
                    throw new ArgumentException($"{formField.Key} is not a supported case document field.");
            }
        }

        AddRepeatedValues(form, "SubmittedBy", request.SubmittedBy);
        AddRepeatedBooleanValues(form, "TransactionEvidence", request.TransactionEvidence);

        foreach (var pendingDocument in indexedDocuments.Values)
        {
            if (pendingDocument.Document is null || pendingDocument.Document.Length == 0)
            {
                throw new ArgumentException($"Documents[{pendingDocument.Index}].Document is required.");
            }

            if (string.IsNullOrWhiteSpace(pendingDocument.SubmittedBy))
            {
                throw new ArgumentException($"Documents[{pendingDocument.Index}].SubmittedBy is required.");
            }

            if (!pendingDocument.TransactionEvidence.HasValue)
            {
                throw new ArgumentException($"Documents[{pendingDocument.Index}].TransactionEvidence is required.");
            }

            request.Documents.Add(pendingDocument.Document);
            request.SubmittedBy.Add(pendingDocument.SubmittedBy);
            request.TransactionEvidence.Add(pendingDocument.TransactionEvidence.Value);
        }

        return request;
    }

    private static void AddRepeatedValues(
        IFormCollection form,
        string fieldName,
        ICollection<string> values)
    {
        if (!form.TryGetValue(fieldName, out var formValues))
        {
            return;
        }

        foreach (var value in formValues)
        {
            values.Add(value ?? string.Empty);
        }
    }

    private static void AddRepeatedBooleanValues(
        IFormCollection form,
        string fieldName,
        ICollection<bool> values)
    {
        if (!form.TryGetValue(fieldName, out var formValues))
        {
            return;
        }

        foreach (var value in formValues)
        {
            values.Add(ParseRequiredBoolean(value ?? string.Empty, fieldName));
        }
    }

    private static PendingCreateCaseDocumentEntry GetOrCreatePendingDocument(
        IDictionary<int, PendingCreateCaseDocumentEntry> pendingDocuments,
        int index)
    {
        if (pendingDocuments.TryGetValue(index, out var pendingDocument))
        {
            return pendingDocument;
        }

        pendingDocument = new PendingCreateCaseDocumentEntry(index);
        pendingDocuments.Add(index, pendingDocument);
        return pendingDocument;
    }

    private static bool TryReadIndexedDocumentField(
        string fieldName,
        out int index,
        out string propertyName)
    {
        index = 0;
        propertyName = string.Empty;

        const string prefix = "Documents[";
        if (!fieldName.StartsWith(prefix, StringComparison.Ordinal))
        {
            return false;
        }

        var indexEnd = fieldName.IndexOf(']', prefix.Length);
        if (indexEnd < 0 ||
            indexEnd + 2 >= fieldName.Length ||
            fieldName[indexEnd + 1] != '.')
        {
            return false;
        }

        if (!int.TryParse(fieldName[prefix.Length..indexEnd], out index) || index < 0)
        {
            throw new ArgumentException($"{fieldName} contains an invalid document index.");
        }

        propertyName = fieldName[(indexEnd + 2)..];
        return !string.IsNullOrWhiteSpace(propertyName);
    }

    private static bool IsIndexedFileProperty(string propertyName)
    {
        return string.Equals(propertyName, "Document", StringComparison.Ordinal) ||
               string.Equals(propertyName, "File", StringComparison.Ordinal);
    }

    private static bool ParseRequiredBoolean(string value, string fieldName)
    {
        if (bool.TryParse(value, out var parsedValue))
        {
            return parsedValue;
        }

        throw new ArgumentException($"{fieldName} must be true or false.");
    }

    private async Task RemoveIncompleteCaseAsync(
        CaseListItemViewModel? createdCase,
        IReadOnlyCollection<DocumentUploadResultViewModel> uploadedDocuments)
    {
        if (createdCase is null)
            return;

        foreach (var document in uploadedDocuments)
            await _documentService.DeleteDocumentAsync(document.DocumentId);

        await _caseService.DeleteCaseAsync(createdCase.CaseId);
    }

    private sealed class PendingCreateCaseDocumentEntry
    {
        public PendingCreateCaseDocumentEntry(int index)
        {
            Index = index;
        }

        public int Index { get; }

        public IFormFile? Document { get; set; }

        public string? SubmittedBy { get; set; }

        public bool? TransactionEvidence { get; set; }
    }

    [HttpGet("{id:long}")]
    [ProducesResponseType(typeof(CaseDetailViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CaseDetailViewModel>> Case(long id)
    {
        var caseViewModel = await _caseService.GetCaseByIdAsync(id);
        if (caseViewModel == null)
            return NotFound();

        var reviewVersions = (await _reviewService.GetCaseReviewHistoryAsync(id, HttpContext.RequestAborted))
            .ToArray();

        return Ok(new CaseDetailViewModel(
            caseViewModel.CaseName,
            caseViewModel.CaseNumber,
            caseViewModel.FilingDate,
            caseViewModel.DocumentNames,
            caseViewModel.IsRecordActive,
            caseViewModel.ReviewDate,
            caseViewModel.Reason,
            reviewVersions));
    }

    [HttpDelete("{id:long}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteCase(long id)
    {
        var deleted = await _caseService.DeleteCaseAsync(id);
        return deleted ? NoContent() : NotFound();
    }
}

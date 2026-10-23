//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Net.Http.Headers;

namespace api.Controllers;

[ApiController]
[Route("api/v1/Cases")]
public class CaseDocumentsController : ControllerBase
{
    private readonly IDocumentService _documentService;
    private readonly IAiJobService _aiJobService;
    private const string DefaultJobType = "ELIGIBILITY_CHECK_RESPONSE";

    public CaseDocumentsController(
        IDocumentService documentService,
        IAiJobService aiJobService)
    {
        _documentService = documentService;
        _aiJobService = aiJobService;
    }

    /*
       Supplies the document metadata used by the frontend documents list.
       The client is responsible for building the viewer route from DocumentId.
    */
    [HttpGet("{caseId:long}/documents")]
    [ProducesResponseType(typeof(IEnumerable<CaseDocumentListItemViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IEnumerable<CaseDocumentListItemViewModel>>> CaseDocuments(long caseId)
    {
        var documents = await _documentService.GetCaseDocumentsAsync(caseId);
        return documents == null ? NotFound() : Ok(documents);
    }

    /*
       Saves document changes for an existing case and queues a fresh AI review
       against the selected document set.
    */
    [HttpPost("{caseId:long}/rerun-review")]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(QueueAiJobResponseViewModel), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<QueueAiJobResponseViewModel>> SaveDocumentsAndRerunReview(long caseId)
    {
        try
        {
            var parsedRequest = await ParseRerunReviewRequestAsync(caseId, HttpContext.RequestAborted);
            var useExplicitDocumentIds = parsedRequest.DocumentIds.Count > 0;
            var caseDocuments = (await _documentService.GetCaseDocumentsAsync(caseId))?.ToArray()
                ?? throw new KeyNotFoundException($"Case {caseId} was not found.");
            var reviewDocumentIds = (useExplicitDocumentIds
                    ? parsedRequest.DocumentIds
                    : caseDocuments.Select(document => document.DocumentId))
                .Distinct()
                .ToHashSet();
            var queuedJob = await _aiJobService.QueueCaseJobAsync(
                caseId,
                new QueueAiJobRequestViewModel
                {
                    JobType = DefaultJobType,
                    PromptConfigurationId = parsedRequest.PromptConfigurationId,
                    DocumentIds = useExplicitDocumentIds ? parsedRequest.DocumentIds : null,
                    UploadedDocumentIds = parsedRequest.UploadedDocuments
                        .Select(document => document.DocumentId)
                        .ToArray()
                },
                HttpContext.RequestAborted);

            caseDocuments = (await _documentService.GetCaseDocumentsAsync(caseId))?.ToArray() ?? [];

            return Ok(queuedJob with
            {
                UploadedDocuments = parsedRequest.UploadedDocuments,
                Documents = caseDocuments
            });
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(exception.Message);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(exception.Message);
        }
        catch (Exception exception)
        {
            return StatusCode(500, $"Upload failed: {exception.Message}");
        }
    }

    private async Task<RerunReviewParseResult> ParseRerunReviewRequestAsync(
        long caseId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(Request.ContentType) ||
            !Request.ContentType.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("A multipart/form-data request is required.");
        }

        var form = await Request.ReadFormAsync(cancellationToken);
        long? promptConfigurationId = null;
        var documentIds = new List<long>();
        var uploadedDocuments = new List<DocumentUploadResultViewModel>();
        var indexedDocuments = new SortedDictionary<int, PendingRerunDocumentEntry>();
        var flatDocuments = new List<PendingRerunDocumentEntry>();

        if (form.TryGetValue("PromptConfigurationId", out var promptConfigurationValues) &&
            promptConfigurationValues.Count > 0)
        {
            promptConfigurationId = ParseRequiredLong(promptConfigurationValues[0], "PromptConfigurationId");
        }

        if (form.TryGetValue("DocumentIds", out var explicitDocumentValues))
        {
            foreach (var explicitDocumentValue in explicitDocumentValues)
            {
                documentIds.Add(ParseRequiredLong(explicitDocumentValue, "DocumentIds"));
            }
        }

        foreach (var file in form.Files)
        {
            if (TryReadIndexedDocumentField(file.Name, out var fileIndex, out var filePropertyName))
            {
                if (!IsIndexedFileProperty(filePropertyName))
                {
                    throw new ArgumentException($"{file.Name} must be a file field.");
                }

                var indexedDocument = GetOrCreatePendingDocument(indexedDocuments, fileIndex);
                indexedDocument.Kind = PendingRerunDocumentKind.Upload;
                indexedDocument.Upload = await ReadUploadedFileAsync(file, cancellationToken);
                continue;
            }

            if (string.Equals(file.Name, "Documents", StringComparison.Ordinal))
            {
                flatDocuments.Add(new PendingRerunDocumentEntry(
                    PendingRerunDocumentKind.Upload,
                    null,
                    await ReadUploadedFileAsync(file, cancellationToken)));
            }
        }

        if (form.TryGetValue("SubmittedBy", out var submittedByValues))
        {
            for (var index = 0; index < submittedByValues.Count; index++)
            {
                if (index >= flatDocuments.Count)
                {
                    throw new ArgumentException("SubmittedBy must match the number of uploaded Documents entries.");
                }

                flatDocuments[index].SubmittedBy = submittedByValues[index];
            }
        }

        if (form.TryGetValue("TransactionEvidence", out var transactionEvidenceValues))
        {
            for (var index = 0; index < transactionEvidenceValues.Count; index++)
            {
                if (index >= flatDocuments.Count)
                {
                    throw new ArgumentException("TransactionEvidence must match the number of uploaded Documents entries.");
                }

                flatDocuments[index].TransactionEvidence = ParseRequiredBoolean(
                    transactionEvidenceValues[index],
                    "TransactionEvidence");
            }
        }

        foreach (var formField in form)
        {
            if (!TryReadIndexedDocumentField(formField.Key, out var documentIndex, out var propertyName))
            {
                continue;
            }

            var indexedDocument = GetOrCreatePendingDocument(indexedDocuments, documentIndex);
            switch (propertyName)
            {
                case "DocumentId":
                    indexedDocument.Kind = PendingRerunDocumentKind.Existing;
                    indexedDocument.DocumentId = ParseRequiredLong(formField.Value, formField.Key);
                    break;
                case "SubmittedBy":
                    indexedDocument.SubmittedBy = formField.Value.ToString();
                    break;
                case "TransactionEvidence":
                    indexedDocument.TransactionEvidence = ParseRequiredBoolean(formField.Value, formField.Key);
                    break;
                case "Document":
                case "File":
                    break;
                default:
                    throw new ArgumentException($"{formField.Key} is not a supported rerun-review document field.");
            }
        }

        foreach (var indexedDocument in indexedDocuments.Values.OrderBy(entry => entry.Index))
        {
            if (indexedDocument.Kind == PendingRerunDocumentKind.Existing)
            {
                if (!indexedDocument.DocumentId.HasValue)
                {
                    throw new ArgumentException($"Documents[{indexedDocument.Index}].DocumentId is required.");
                }

                if (string.IsNullOrWhiteSpace(indexedDocument.SubmittedBy) ||
                    !indexedDocument.TransactionEvidence.HasValue)
                {
                    throw new ArgumentException(
                        $"Documents[{indexedDocument.Index}].SubmittedBy and Documents[{indexedDocument.Index}].TransactionEvidence are required.");
                }

                var updatedSubmittedBy = await _documentService.UpdateDocumentSubmittedByAsync(
                    caseId,
                    indexedDocument.DocumentId.Value,
                    indexedDocument.SubmittedBy);

                if (!updatedSubmittedBy)
                {
                    throw new KeyNotFoundException(
                        $"Document {indexedDocument.DocumentId.Value} was not found for case {caseId}.");
                }

                var updatedTransactionEvidence = await _documentService.SetTransactionEvidenceDocumentAsync(
                    indexedDocument.DocumentId.Value,
                    indexedDocument.TransactionEvidence.Value);

                if (!updatedTransactionEvidence)
                {
                    throw new KeyNotFoundException(
                        $"Document {indexedDocument.DocumentId.Value} was not found for case {caseId}.");
                }

                documentIds.Add(indexedDocument.DocumentId.Value);
                continue;
            }

            if (indexedDocument.Kind == PendingRerunDocumentKind.Upload)
            {
                if (indexedDocument.Upload is null ||
                    string.IsNullOrWhiteSpace(indexedDocument.SubmittedBy) ||
                    !indexedDocument.TransactionEvidence.HasValue)
                {
                    throw new ArgumentException(
                        $"Documents[{indexedDocument.Index}].Document, SubmittedBy, and TransactionEvidence are required.");
                }

                var uploadedDocument = await UploadPendingDocumentAsync(
                    caseId,
                    indexedDocument.Upload,
                    indexedDocument.SubmittedBy,
                    indexedDocument.TransactionEvidence.Value,
                    cancellationToken);
                uploadedDocuments.Add(uploadedDocument);
                documentIds.Add(uploadedDocument.DocumentId);
            }
        }

        foreach (var flatDocument in flatDocuments)
        {
            if (flatDocument.Upload is null ||
                string.IsNullOrWhiteSpace(flatDocument.SubmittedBy) ||
                !flatDocument.TransactionEvidence.HasValue)
            {
                throw new ArgumentException(
                    "Each Documents entry must include Document, SubmittedBy, and TransactionEvidence.");
            }

            var uploadedDocument = await UploadPendingDocumentAsync(
                caseId,
                flatDocument.Upload,
                flatDocument.SubmittedBy,
                flatDocument.TransactionEvidence.Value,
                cancellationToken);
            uploadedDocuments.Add(uploadedDocument);
            documentIds.Add(uploadedDocument.DocumentId);
        }

        if (!promptConfigurationId.HasValue)
        {
            throw new ArgumentException("PromptConfigurationId is required.");
        }

        return new RerunReviewParseResult(
            promptConfigurationId.Value,
            documentIds.Distinct().ToList(),
            uploadedDocuments);
    }

    private async Task<DocumentUploadResultViewModel> UploadPendingDocumentAsync(
        long caseId,
        PendingDocumentUpload pendingUpload,
        string submittedBy,
        bool isTransactionEvidenceDocument,
        CancellationToken cancellationToken)
    {
        var formFile = new FormFile(
            pendingUpload.Buffer,
            0,
            pendingUpload.Buffer.Length,
            "Documents",
            pendingUpload.FileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = pendingUpload.ContentType ?? "application/octet-stream"
        };

        pendingUpload.Buffer.Position = 0;
        return await _documentService.UploadDocumentAsync(
            caseId,
            formFile,
            submittedBy,
            isTransactionEvidenceDocument);
    }

    private static async Task<PendingDocumentUpload> ReadUploadedFileAsync(
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
        {
            throw new ArgumentException("Uploaded documents must not be empty.");
        }

        var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, cancellationToken);
        buffer.Position = 0;

        return new PendingDocumentUpload(
            buffer,
            file.FileName,
            file.ContentType);
    }

    private async Task TryFinalizePendingDocumentEntryAsync(
        long caseId,
        PendingRerunDocumentEntry pendingDocument,
        ICollection<PendingRerunDocumentEntry> pendingDocuments,
        ICollection<DocumentUploadResultViewModel> uploadedDocuments,
        ICollection<long> documentIds,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(pendingDocument.SubmittedBy) ||
            !pendingDocument.TransactionEvidence.HasValue)
        {
            return;
        }

        if (pendingDocument.Kind == PendingRerunDocumentKind.Unknown)
        {
            return;
        }

        if (pendingDocument.Kind == PendingRerunDocumentKind.Upload)
        {
            if (pendingDocument.Upload is null)
                return;

            var uploadedDocument = await UploadPendingDocumentAsync(
                caseId,
                pendingDocument.Upload,
                pendingDocument.SubmittedBy,
                pendingDocument.TransactionEvidence.Value,
                cancellationToken);
            uploadedDocuments.Add(uploadedDocument);
            documentIds.Add(uploadedDocument.DocumentId);
        }
        else
        {
            if (!pendingDocument.DocumentId.HasValue)
                return;

            var updatedSubmittedBy = await _documentService.UpdateDocumentSubmittedByAsync(
                caseId,
                pendingDocument.DocumentId.Value,
                pendingDocument.SubmittedBy);

            if (!updatedSubmittedBy)
            {
                throw new KeyNotFoundException(
                    $"Document {pendingDocument.DocumentId.Value} was not found for case {caseId}.");
            }

            var updatedTransactionEvidence = await _documentService.SetTransactionEvidenceDocumentAsync(
                pendingDocument.DocumentId.Value,
                pendingDocument.TransactionEvidence.Value);

            if (!updatedTransactionEvidence)
            {
                throw new KeyNotFoundException(
                    $"Document {pendingDocument.DocumentId.Value} was not found for case {caseId}.");
            }

            documentIds.Add(pendingDocument.DocumentId.Value);
        }

        pendingDocuments.Remove(pendingDocument);
    }

    private static PendingRerunDocumentEntry GetOrCreatePendingDocument(
        IDictionary<int, PendingRerunDocumentEntry> pendingDocuments,
        int index)
    {
        if (pendingDocuments.TryGetValue(index, out var pendingDocument))
        {
            return pendingDocument;
        }

        pendingDocument = new PendingRerunDocumentEntry(PendingRerunDocumentKind.Unknown, null)
        {
            Index = index
        };
        pendingDocuments.Add(index, pendingDocument);
        return pendingDocument;
    }

    private static PendingRerunDocumentEntry GetOrCreatePendingDocument(
        ICollection<PendingRerunDocumentEntry> pendingDocuments,
        int index)
    {
        var pendingDocument = pendingDocuments
            .FirstOrDefault(document => document.Index == index);
        if (pendingDocument is not null)
        {
            return pendingDocument;
        }

        pendingDocument = new PendingRerunDocumentEntry(PendingRerunDocumentKind.Unknown, null)
        {
            Index = index
        };
        pendingDocuments.Add(pendingDocument);
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

    private static long ParseRequiredLong(string value, string fieldName)
    {
        if (long.TryParse(value, out var parsedValue) && parsedValue > 0)
        {
            return parsedValue;
        }

        throw new ArgumentException($"{fieldName} must be a positive number.");
    }

    private static bool ParseRequiredBoolean(string value, string fieldName)
    {
        if (bool.TryParse(value, out var parsedValue))
        {
            return parsedValue;
        }

        throw new ArgumentException($"{fieldName} must be true or false.");
    }

    private sealed record PendingDocumentUpload(
        MemoryStream Buffer,
        string FileName,
        string? ContentType);

    private sealed class PendingRerunDocumentEntry
    {
        public PendingRerunDocumentEntry(
            PendingRerunDocumentKind kind,
            long? documentId,
            PendingDocumentUpload? upload = null)
        {
            Kind = kind;
            DocumentId = documentId;
            Upload = upload;
        }

        public int? Index { get; set; }

        public PendingRerunDocumentKind Kind { get; set; }

        public long? DocumentId { get; set; }

        public PendingDocumentUpload? Upload { get; set; }

        public string? SubmittedBy { get; set; }

        public bool? TransactionEvidence { get; set; }
    }

    private enum PendingRerunDocumentKind
    {
        Unknown,
        Existing,
        Upload
    }

    private sealed record RerunReviewParseResult(
        long PromptConfigurationId,
        IReadOnlyList<long> DocumentIds,
        IReadOnlyCollection<DocumentUploadResultViewModel> UploadedDocuments);

    /*
       Preserves the delete action used by the frontend document list when a
       user removes an uploaded file from the case.
    */
    [HttpDelete("documents/{documentId:long}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteCaseDocument(long documentId)
    {
        var deleted = await _documentService.DeleteDocumentAsync(documentId);
        return deleted ? NoContent() : NotFound();
    }

    /*
       Keeps the traditional file download behavior for attachments the
       frontend wants the browser to save directly.
    */
    [HttpGet("documents/{documentId:long}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> CaseDocument(long documentId)
    {
        try
        {
            var downloadedDocument = await _documentService.DownloadDocumentAsync(documentId);
            return File(downloadedDocument.Stream, downloadedDocument.ContentType, downloadedDocument.FileName);
        }
        catch (FileNotFoundException exception)
        {
            return NotFound(exception.Message);
        }
        catch (Exception exception)
        {
            return StatusCode(500, $"Download failed: {exception.Message}");
        }
    }

    /*
       Streams the stored document bytes inline so the frontend can display the
       document in a browser tab without forcing a file download.
    */
    [HttpGet("documents/{documentId:long}/content")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> CaseDocumentContent(long documentId)
    {
        try
        {
            var documentContent = await _documentService.DownloadDocumentAsync(documentId);
            Response.Headers.ContentDisposition = new ContentDispositionHeaderValue("inline")
            {
                FileNameStar = documentContent.FileName
            }.ToString();

            return File(
                documentContent.Stream,
                documentContent.ContentType,
                enableRangeProcessing: true);
        }
        catch (FileNotFoundException exception)
        {
            return NotFound(exception.Message);
        }
        catch (Exception exception)
        {
            return StatusCode(500, $"Document content retrieval failed: {exception.Message}");
        }
    }

    [HttpGet("documents/submitted-by")]
    [ProducesResponseType(typeof(IEnumerable<DocumentSubmittedByViewModel>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<DocumentSubmittedByViewModel>>> DocumentSubmittedBy()
    {
        var submittedByOptions = await _documentService.GetDocumentSubmittedByAsync(
            HttpContext.RequestAborted);

        return Ok(submittedByOptions);
    }
}

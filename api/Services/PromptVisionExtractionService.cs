//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Net.Http.Headers;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using api.Models;
using api.Services.Interfaces;
using Docnet.Core;
using Docnet.Core.Models;
using Microsoft.EntityFrameworkCore;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;

namespace api.Services;

public sealed class PromptVisionExtractionService : IPromptVisionExtractionService
{
    private static readonly ActivitySource AiActivitySource = new(OpenAiExecutionService.ActivitySourceName);
    private const string VisionExtractionMaxCompletionTokensKey = "AzureOpenAI:VisionExtractionMaxCompletionTokens";
    private const string MaxParallelVisionCallsKey = "DocumentProcessing:MaxParallelVisionCalls";
    private const string VisionRetryCountKey = "DocumentProcessing:VisionRetryCount";
    private const string VisionPromptType = "Vision";
    private const string ImagePngContentType = "image/png";
    private const string CacheBlobContentType = "application/json";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly IConfiguration _configuration;
    private readonly DivertCheckDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IBlobStorageService _blobStorageService;
    private readonly ILogger<PromptVisionExtractionService> _logger;
    private readonly bool _traceOpenAIPayloads;
    private readonly int _tracePayloadMaxChars;
    private readonly string _azureStorageContainerName;
    private readonly IUserAuditService _userAuditService;

    public PromptVisionExtractionService(
        IConfiguration configuration,
        DivertCheckDbContext db,
        IHttpClientFactory httpClientFactory,
        IBlobStorageService blobStorageService,
        ILogger<PromptVisionExtractionService> logger,
        IUserAuditService userAuditService)
    {
        _configuration = configuration;
        _db = db;
        _httpClientFactory = httpClientFactory;
        _blobStorageService = blobStorageService;
        _logger = logger;
        _userAuditService = userAuditService;
        _traceOpenAIPayloads = configuration.GetValue<bool>("AzureMonitor:TraceOpenAIPayloads");
        _tracePayloadMaxChars = Math.Clamp(
            configuration.GetValue<int?>("AzureMonitor:TracePayloadMaxChars") ?? 4000,
            500,
            12000);
        _azureStorageContainerName = configuration["AzureStorage:ContainerName"] ?? "your_container_name";
    }

    public async Task<string> ExtractDocumentTextAsync(
        IFormFile file,
        PromptConfiguration promptConfiguration,
        long? documentId = null,
        CancellationToken cancellationToken = default)
    {
        if (file == null)
            throw new ArgumentException("A reference document is required.", nameof(file));

        var fileBytes = await ReadFileBytesAsync(file, cancellationToken);

        return await ExtractDocumentTextAsync(
            Path.GetFileName(file.FileName),
            file.ContentType,
            fileBytes,
            promptConfiguration,
            documentId,
            cancellationToken);
    }

    public async Task<string> ExtractDocumentTextAsync(
        string fileName,
        string? contentType,
        byte[] content,
        PromptConfiguration promptConfiguration,
        long? documentId = null,
        CancellationToken cancellationToken = default)
    {
        var document = await ExtractDocumentAsync(
            fileName,
            contentType,
            content,
            promptConfiguration,
            documentId,
            cancellationToken);

        return FormatDocumentText(document);
    }

    public async Task<ExtractedDocumentText> ExtractDocumentAsync(
        string fileName,
        string? contentType,
        byte[] content,
        PromptConfiguration promptConfiguration,
        long? documentId = null,
        CancellationToken cancellationToken = default)
    {
        if (content.Length == 0)
            throw new ArgumentException("A document is required.", nameof(content));

        var normalizedFileName = Path.GetFileName(fileName);
        if (IsPlainTextFile(normalizedFileName, contentType))
        {
            return new ExtractedDocumentText(
                normalizedFileName,
                [new ExtractedDocumentPage(1, ReadPlainTextFile(content))]);
        }

        var visionPrompt = await GetVisionExtractionPromptAsync(cancellationToken);
        var documentHash = Convert.ToHexString(SHA256.HashData(content));

        // Suggested-prompt uploads are carried only in the queued job payload and have no document
        // record. They are not persisted in the cache, so skip the cache read as well; this keeps
        // their processing independent of Blob Storage cache access.
        if (documentId is not null)
        {
            // Cache lookup is content-addressable (hash + active prompt configuration, which fixes
            // the prompt version) rather than scoped to a document row, so identical content reuses
            // a prior extraction even when uploaded as a different document.
            var cachedPages = await GetCachedExtractionAsync(
                documentHash,
                visionPrompt.PromptConfigurationId,
                cancellationToken);
            if (cachedPages is not null)
            {
                _logger.LogInformation(
                    "Reused cached vision extraction for document hash {DocumentHash} using prompt configuration {PromptConfigurationId} version {PromptVersion}.",
                    documentHash,
                    visionPrompt.PromptConfigurationId,
                    visionPrompt.PromptVersion);
                return new ExtractedDocumentText(normalizedFileName, cachedPages);
            }
        }

        var settings = ResolveSettings(promptConfiguration.AiModelName);
        IReadOnlyList<ExtractedDocumentPage> pages;
        if (IsImageFile(contentType))
        {
            pages =
            [
                await ExtractVisionPageWithRetryAsync(
                    settings,
                    visionPrompt.Text,
                    normalizedFileName,
                    new VisionImage(1, contentType!, content),
                    cancellationToken)
            ];
        }
        else if (IsPdfFile(normalizedFileName, contentType))
        {
            pages = await ExtractPdfPagesAsync(settings, visionPrompt.Text, normalizedFileName, content, cancellationToken);
        }
        else
        {
            throw new NotSupportedException(
                $"Prompt vision extraction only supports text, image, and PDF files. File '{normalizedFileName}' has content type '{contentType ?? "unknown"}'.");
        }

        if (documentId is { } documentIdToCache)
        {
            await SaveExtractionAsync(
                documentIdToCache,
                documentHash,
                visionPrompt.PromptConfigurationId,
                pages,
                cancellationToken);
        }

        return new ExtractedDocumentText(normalizedFileName, pages);
    }

    private async Task<VisionExtractionPrompt> GetVisionExtractionPromptAsync(CancellationToken cancellationToken)
    {
        var prompt = await _db.PromptConfigurations
            .AsNoTracking()
            .Where(configuration =>
                configuration.IsRecordActive &&
                configuration.Prompt.IsRecordActive &&
                configuration.Prompt.PromptType == VisionPromptType &&
                configuration.Prompt.MainPromptText != null &&
                configuration.Prompt.MainPromptText != "")
            .OrderByDescending(configuration => configuration.ModifiedDttm)
            .ThenByDescending(configuration => configuration.PromptVersion)
            .Select(configuration => new VisionExtractionPrompt(
                configuration.PromptConfigurationId,
                configuration.PromptVersion,
                configuration.Prompt.MainPromptText!))
            .FirstOrDefaultAsync(cancellationToken);

        return prompt is null || string.IsNullOrWhiteSpace(prompt.Text)
            ? throw new InvalidOperationException("No active vision extraction prompt was configured.")
            : prompt with { Text = prompt.Text.Trim() };
    }

    // Keyed by document hash + prompt configuration (which fixes the prompt version), not by
    // document id, so identical content is reused across documents instead of per-document only.
    private async Task<IReadOnlyList<ExtractedDocumentPage>?> GetCachedExtractionAsync(
        string documentHash,
        long promptConfigurationId,
        CancellationToken cancellationToken)
    {
        var cached = await _db.DocumentVisionExtractions
            .AsNoTracking()
            .Where(extraction =>
                extraction.IsRecordActive &&
                extraction.DocumentHash == documentHash &&
                extraction.PromptConfigurationId == promptConfigurationId)
            .Select(extraction => extraction.VisionExtractedAzureDocumentId)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(cached))
            return null;

        var (stream, _) = await _blobStorageService.DownloadAsync(cached, _azureStorageContainerName);
        await using var _ = stream;
        var pages = await JsonSerializer.DeserializeAsync<List<ExtractedDocumentPage>>(stream, JsonOptions, cancellationToken);
        if (pages is null || pages.Count == 0 || pages.Any(page => string.IsNullOrWhiteSpace(page.Text)))
            throw new InvalidOperationException("Cached vision extraction contains no usable page text.");

        return pages.OrderBy(page => page.PageNumber).ToArray();
    }

    private async Task SaveExtractionAsync(
        long documentId,
        string documentHash,
        long promptConfigurationId,
        IReadOnlyList<ExtractedDocumentPage> pages,
        CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(pages, JsonOptions);
        var jsonBytes = Encoding.UTF8.GetBytes(json);
        await using var content = new MemoryStream(jsonBytes);
        var cacheFile = new FormFile(content, 0, jsonBytes.Length, "file", $"{Guid.NewGuid():N}.json")
        {
            Headers = new HeaderDictionary(),
            ContentType = CacheBlobContentType
        };
        var azureDocumentId = await _blobStorageService.UploadAsync(cacheFile, _azureStorageContainerName);

        // Every extraction is its own row. Reaching this point means the cache lookup found nothing
        // for this content hash and prompt configuration, so a changed document or a newer prompt
        // configuration is recorded alongside the earlier extractions rather than replacing one.
        // Earlier rows keep pointing at their own blobs, which stay valid cache entries for the
        // hash and prompt configuration that produced them.
        _db.DocumentVisionExtractions.Add(new DocumentVisionExtraction
        {
            DocumentId = documentId,
            DocumentHash = documentHash,
            PromptConfigurationId = promptConfigurationId,
            VisionExtractedAzureDocumentId = azureDocumentId,
            IsRecordActive = true
        });

        await _userAuditService.SaveChangesAsync(cancellationToken);
    }

    private static bool IsPlainTextFile(string fileName, string? contentType)
    {
        var extension = Path.GetExtension(fileName);
        return extension.Equals(".txt", StringComparison.OrdinalIgnoreCase) ||
               extension.Equals(".md", StringComparison.OrdinalIgnoreCase) ||
               extension.Equals(".json", StringComparison.OrdinalIgnoreCase) ||
               extension.Equals(".csv", StringComparison.OrdinalIgnoreCase) ||
               extension.Equals(".xml", StringComparison.OrdinalIgnoreCase) ||
               (!string.IsNullOrWhiteSpace(contentType) &&
                contentType.StartsWith("text/", StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsImageFile(string? contentType)
    {
        return contentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) == true;
    }

    private static bool IsPdfFile(string fileName, string? contentType)
    {
        return Path.GetExtension(fileName).Equals(".pdf", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(contentType, "application/pdf", StringComparison.OrdinalIgnoreCase);
    }

    private static string ReadPlainTextFile(byte[] fileBytes)
    {
        var normalizedContent = Encoding.UTF8.GetString(fileBytes).Trim();

        return string.IsNullOrWhiteSpace(normalizedContent)
            ? "The uploaded document did not contain extractable text."
            : normalizedContent;
    }

    private static async Task<byte[]> ReadFileBytesAsync(IFormFile file, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, cancellationToken);
        return buffer.ToArray();
    }

    private async Task<IReadOnlyList<ExtractedDocumentPage>> ExtractPdfPagesAsync(
        ResolvedAiSettings settings,
        string visionPrompt,
        string fileName,
        byte[] fileBytes,
        CancellationToken cancellationToken)
    {
        var extractedPages = new List<ExtractedDocumentPage>();
        var tempPdfPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.pdf");

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            File.WriteAllBytes(tempPdfPath, fileBytes);

            using var docReader = DocLib.Instance.GetDocReader(
                tempPdfPath,
                new PageDimensions(2200, 3000));

            var pageCount = docReader.GetPageCount();
            var batchSize = ResolveMaxParallelVisionCalls();
            for (var batchStart = 0; batchStart < pageCount; batchStart += batchSize)
            {
                var images = new List<VisionImage>(batchSize);
                var batchEnd = Math.Min(batchStart + batchSize, pageCount);
                for (var pageIndex = batchStart; pageIndex < batchEnd; pageIndex++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    using var pageReader = docReader.GetPageReader(pageIndex);
                    var rawBytes = pageReader.GetImage();
                    var width = pageReader.GetPageWidth();
                    var height = pageReader.GetPageHeight();

                    using var image = Image.LoadPixelData<Bgra32>(rawBytes, width, height);
                    FlattenTransparencyOntoWhite(image);
                    using var outputStream = new MemoryStream();
                    image.Save(outputStream, new PngEncoder());
                    images.Add(new VisionImage(pageIndex + 1, ImagePngContentType, outputStream.ToArray()));
                }

                var batchPages = await Task.WhenAll(images.Select(image =>
                    ExtractVisionPageWithRetryAsync(settings, visionPrompt, fileName, image, cancellationToken)));
                extractedPages.AddRange(batchPages);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"Failed to render PDF '{fileName}' as page images.", exception);
        }
        finally
        {
            try
            {
                if (File.Exists(tempPdfPath))
                    File.Delete(tempPdfPath);
            }
            catch (Exception exception)
            {
                _logger.LogWarning(exception, "Could not delete temporary PDF file {TempPdfPath}.", tempPdfPath);
            }
        }

        if (extractedPages.Count == 0)
            throw new InvalidOperationException($"PDF '{fileName}' did not render any page images.");

        return extractedPages.OrderBy(page => page.PageNumber).ToArray();
    }

    private static void FlattenTransparencyOntoWhite(Image<Bgra32> image)
    {
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                foreach (ref var pixel in row)
                {
                    if (pixel.A == byte.MaxValue)
                        continue;

                    pixel.R = BlendOntoWhite(pixel.R, pixel.A);
                    pixel.G = BlendOntoWhite(pixel.G, pixel.A);
                    pixel.B = BlendOntoWhite(pixel.B, pixel.A);
                    pixel.A = byte.MaxValue;
                }
            }
        });
    }

    private static byte BlendOntoWhite(byte color, byte alpha) =>
        (byte)((color * alpha + byte.MaxValue * (byte.MaxValue - alpha) + 127) / byte.MaxValue);

    private async Task<ExtractedDocumentPage> ExtractVisionPageWithRetryAsync(
        ResolvedAiSettings settings,
        string visionPrompt,
        string fileName,
        VisionImage image,
        CancellationToken cancellationToken)
    {
        var attempts = ResolveVisionRetryCount() + 1;
        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            try
            {
                var payload = BuildImageExtractionPayload(
                    settings.ModelName,
                    visionPrompt,
                    fileName,
                    image,
                    ResolveDefaultMaxCompletionTokens());
                var text = await SendChatCompletionsRequestAsync(
                    settings,
                    payload,
                    fileName,
                    [image],
                    visionPrompt,
                    cancellationToken);

                if (string.IsNullOrWhiteSpace(text))
                    throw new InvalidOperationException($"Vision extraction returned no text for page {image.PageNumber} of '{fileName}'.");

                return new ExtractedDocumentPage(image.PageNumber, text.Trim());
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (VisionResponseTruncatedException)
            {
                throw;
            }
            catch (Exception exception) when (attempt < attempts)
            {
                _logger.LogWarning(
                    exception,
                    "Vision extraction attempt {Attempt}/{Attempts} failed for page {PageNumber} of {FileName}.",
                    attempt,
                    attempts,
                    image.PageNumber,
                    fileName);
                await Task.Delay(TimeSpan.FromMilliseconds(250 * attempt), cancellationToken);
            }
        }

        throw new InvalidOperationException($"Vision extraction failed for page {image.PageNumber} of '{fileName}'.");
    }

    private static Dictionary<string, object?> BuildImageExtractionPayload(
        string modelName,
        string visionExtractionPrompt,
        string fileName,
        VisionImage image,
        int maxCompletionTokens)
    {
        var userContent = new List<Dictionary<string, object?>>
        {
            BuildTextContent($"Document name: {Path.GetFileName(fileName)}{Environment.NewLine}Page number: {image.PageNumber}"),
            BuildImageContent(image)
        };

        return new Dictionary<string, object?>
        {
            ["model"] = modelName,
            ["messages"] = new object[]
            {
                new Dictionary<string, object?>
                {
                    ["role"] = "system",
                    ["content"] = visionExtractionPrompt
                },
                new Dictionary<string, object?>
                {
                    ["role"] = "user",
                    ["content"] = userContent
                }
            },
            ["max_completion_tokens"] = maxCompletionTokens
        };
    }

    private int ResolveDefaultMaxCompletionTokens()
    {
        var configuredValue = _configuration.GetValue<int?>(VisionExtractionMaxCompletionTokensKey);
        if (configuredValue is > 0)
            return configuredValue.Value;

        throw new InvalidOperationException($"{VisionExtractionMaxCompletionTokensKey} must be configured as a positive integer.");
    }

    private int ResolveMaxParallelVisionCalls() =>
        Math.Max(1, _configuration.GetValue<int?>(MaxParallelVisionCallsKey) ?? 2);

    private int ResolveVisionRetryCount() =>
        Math.Max(0, _configuration.GetValue<int?>(VisionRetryCountKey) ?? 2);

    private static string FormatDocumentText(ExtractedDocumentText document)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"=== DOCUMENT: {document.FileName} ===");

        foreach (var page in document.Pages.OrderBy(page => page.PageNumber))
        {
            builder.AppendLine($"=== PAGE {page.PageNumber} START ===");
            builder.AppendLine(page.Text.Trim());
            builder.AppendLine($"=== PAGE {page.PageNumber} END ===");
        }

        return builder.ToString().Trim();
    }

    private static Dictionary<string, object?> BuildTextContent(string text)
    {
        return new Dictionary<string, object?>
        {
            ["type"] = "text",
            ["text"] = text
        };
    }

    private static Dictionary<string, object?> BuildImageContent(VisionImage image)
    {
        return new Dictionary<string, object?>
        {
            ["type"] = "image_url",
            ["image_url"] = new Dictionary<string, object?>
            {
                ["url"] = $"data:{image.ContentType};base64,{Convert.ToBase64String(image.Content)}",
                ["detail"] = "high"
            }
        };
    }

    private async Task<string> SendChatCompletionsRequestAsync(
        ResolvedAiSettings settings,
        Dictionary<string, object?> payload,
        string fileName,
        IReadOnlyCollection<VisionImage> images,
        string visionPrompt,
        CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var userInput = $"Document name: {fileName}{Environment.NewLine}Pages submitted for OCR: {images.Count}";
        using var activity = AiActivitySource.StartActivity("openai.vision", ActivityKind.Client);
        var endpointUri = new Uri(settings.ChatCompletionsEndpoint);
        activity?.SetTag("http.request.method", HttpMethod.Post.Method);
        activity?.SetTag("url.full", settings.ChatCompletionsEndpoint);
        activity?.SetTag("server.address", endpointUri.Host);
        activity?.SetTag("gen_ai.system", settings.UseBearerAuthorization ? "openai" : "azure.ai.openai");
        activity?.SetTag("gen_ai.operation.name", "chat");
        activity?.SetTag("gen_ai.request.model", settings.ModelName);
        activity?.SetTag("gen_ai.request.vision_model", settings.ModelName);
        activity?.SetTag("gen_ai.request.endpoint", endpointUri.AbsolutePath);
        activity?.SetTag("openai.request.prompt_name", VisionPromptType);
        activity?.SetTag("openai.request.system_prompt", TruncateForTrace(visionPrompt));
        activity?.SetTag("openai.request.user_input", userInput);
        activity?.SetTag("document.file_name", fileName);
        activity?.SetTag("document.page_count", images.Count);
        activity?.SetTag("document.start_page", 1);
        activity?.SetTag("document.end_page", images.Count);
        activity?.SetTag("vision.image_count", images.Count);
        activity?.SetTag("vision.image_size_bytes", images.Sum(image => (long)image.Content.Length));
        activity?.SetTag("openai.request.input_length", userInput.Length);
        activity?.SetTag("openai.request.image_size_bytes", images.Sum(image => (long)image.Content.Length));
        activity?.SetTag("http.request.body.size", Encoding.UTF8.GetByteCount(json));
        activity?.AddEvent(new ActivityEvent(
            "openai.chat.input",
            tags: new ActivityTagsCollection
            {
                ["prompt_name"] = VisionPromptType,
                ["system_prompt"] = TruncateForTrace(visionPrompt),
                ["user_input"] = userInput,
                ["document.file_name"] = fileName,
                ["image.count"] = images.Count
            }));

        if (_traceOpenAIPayloads)
        {
            var tracePayload = JsonSerializer.Serialize(new
            {
                model = settings.ModelName,
                file_name = fileName,
                image_count = images.Count,
                image_size_bytes = images.Sum(image => (long)image.Content.Length),
                max_completion_tokens = payload["max_completion_tokens"]
            });
            var preview = TruncateForTrace(tracePayload);
            activity?.SetTag("openai.request.body.preview", preview);
            activity?.AddEvent(new ActivityEvent(
                "openai.request.body",
                tags: new ActivityTagsCollection
                {
                    ["body.preview"] = preview,
                    ["body.size"] = Encoding.UTF8.GetByteCount(json)
                }));
        }

        using var request = CreateRequestMessage(HttpMethod.Post, settings.ChatCompletionsEndpoint, settings);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        using var response = await GetClient().SendAsync(request, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        activity?.SetTag("http.response.status_code", (int)response.StatusCode);
        activity?.SetTag("http.response.reason_phrase", response.ReasonPhrase);
        activity?.SetTag("openai.response.success", response.IsSuccessStatusCode);
        activity?.SetTag("http.response.body.size", Encoding.UTF8.GetByteCount(responseBody));

        if (response.Headers.TryGetValues("apim-request-id", out var requestIds))
            activity?.SetTag("azure.apim_request_id", requestIds.FirstOrDefault());

        if (_traceOpenAIPayloads)
        {
            var preview = TruncateForTrace(responseBody);
            activity?.SetTag("openai.response.body.preview", preview);
            activity?.AddEvent(new ActivityEvent(
                "openai.response.body",
                tags: new ActivityTagsCollection
                {
                    ["body.preview"] = preview,
                    ["body.size"] = Encoding.UTF8.GetByteCount(responseBody)
                }));
        }

        if (!response.IsSuccessStatusCode)
        {
            stopwatch.Stop();
            activity?.SetTag("vision.elapsed_ms", stopwatch.ElapsedMilliseconds);
            activity?.SetTag("vision.failed", true);
            activity?.SetStatus(ActivityStatusCode.Error, $"HTTP {(int)response.StatusCode}");
            throw new InvalidOperationException(
                $"Prompt vision extraction call failed with status {(int)response.StatusCode}: {responseBody}");
        }

        var extractedText = ExtractChatCompletionText(responseBody);
        stopwatch.Stop();
        var outputPreview = TruncateForTrace(extractedText);
        activity?.SetTag("openai.response.output_text", outputPreview);
        activity?.SetTag("vision.ocr.text.length", extractedText.Length);
        activity?.SetTag("vision.ocr.text.preview", outputPreview);
        activity?.SetTag("vision.elapsed_ms", stopwatch.ElapsedMilliseconds);
        activity?.AddEvent(new ActivityEvent(
            "vision.ocr.extracted_text",
            tags: new ActivityTagsCollection
            {
                ["document.file_name"] = fileName,
                ["text"] = outputPreview
            }));
        activity?.SetStatus(ActivityStatusCode.Ok);
        return extractedText;
    }

    private string TruncateForTrace(string value) =>
        value.Length <= _tracePayloadMaxChars
            ? value
            : value[.._tracePayloadMaxChars] + "...";

    private ResolvedAiSettings ResolveSettings(string configuredModelName)
    {
        var modelName = configuredModelName.Trim();

        var apiKey = FirstConfiguredValue("AzureOpenAI:ApiKeyDivertCheck");
        var azureChatCompletionsEndpoint = FirstConfiguredValue("AzureOpenAI:ChatCompletionsEndpoint");

        return new ResolvedAiSettings(modelName, azureChatCompletionsEndpoint, apiKey, false);
    

    }

    private static string ExtractChatCompletionText(string responseBody)
    {
        using var jsonDocument = JsonDocument.Parse(responseBody);
        if (!jsonDocument.RootElement.TryGetProperty("choices", out var choicesElement) ||
            choicesElement.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("Prompt vision extraction response did not contain a choices array.");
        }

        foreach (var choice in choicesElement.EnumerateArray())
        {
            if (choice.TryGetProperty("finish_reason", out var finishReasonElement) &&
                string.Equals(finishReasonElement.GetString(), "length", StringComparison.OrdinalIgnoreCase))
            {
                throw new VisionResponseTruncatedException(
                    "Prompt vision extraction stopped because it reached the completion-token limit.");
            }

            if (!choice.TryGetProperty("message", out var messageElement) ||
                !messageElement.TryGetProperty("content", out var contentElement))
            {
                continue;
            }

            var text = ExtractMessageContentText(contentElement);
            if (!string.IsNullOrWhiteSpace(text))
            {
                return text;
            }
        }

        throw new InvalidOperationException("Prompt vision extraction chat completion did not contain message text.");
    }

    private static string? ExtractMessageContentText(JsonElement contentElement)
    {
        if (contentElement.ValueKind == JsonValueKind.String)
            return contentElement.GetString();

        if (contentElement.ValueKind != JsonValueKind.Array)
            return null;

        foreach (var contentItem in contentElement.EnumerateArray())
        {
            if (contentItem.TryGetProperty("text", out var textElement) &&
                !string.IsNullOrWhiteSpace(textElement.GetString()))
            {
                return textElement.GetString();
            }
        }

        return null;
    }

    private string FirstConfiguredValue(params string[] keys)
    {
        foreach (var key in keys)
        {
            var value = _configuration[key];
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }

        throw new InvalidOperationException($"Missing AI configuration value. Checked: {string.Join(", ", keys)}.");
    }

    private static HttpRequestMessage CreateRequestMessage(HttpMethod method, string url, ResolvedAiSettings settings)
    {
        var request = new HttpRequestMessage(method, url);

        if (settings.UseBearerAuthorization)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey);
        }
        else
        {
            request.Headers.Add("api-key", settings.ApiKey);
        }

        return request;
    }

    private HttpClient GetClient()
    {
        return _httpClientFactory.CreateClient("OpenAI_LongRunning");
    }

    private sealed record ResolvedAiSettings(
        string ModelName,
        string ChatCompletionsEndpoint,
        string ApiKey,
        bool UseBearerAuthorization);

    private sealed record VisionImage(
        int PageNumber,
        string ContentType,
        byte[] Content);

    private sealed record VisionExtractionPrompt(
        long PromptConfigurationId,
        int PromptVersion,
        string Text);

    private sealed class VisionResponseTruncatedException(string message) : InvalidOperationException(message);
}

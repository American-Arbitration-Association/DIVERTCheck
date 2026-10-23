//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using api.Models;
using api.Services.Interfaces;
using api.ViewModels;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace api.Services;

public sealed class PromptConfigurationService : IPromptConfigurationService
{
    private const string AiModelCodeType = "AI_MODEL";
    private const string ReasoningEffortCodeType = "REASONING_EFFORT";
    private const string LowReasoningEffort = "low";
    private const string MediumReasoningEffort = "medium";
    private const string HighReasoningEffort = "high";
    private const string MainPromptType = "main";
    private const string SummaryPromptType = "summary";
    private const string EligibilityPromptType = "Eligibility";
    private const string SuggestedPromptType = "Suggested";
    private const int MinimumMaxOutputTokens = 16;

    private readonly DivertCheckDbContext _db;
    private readonly IPromptVisionExtractionService _promptVisionExtractionService;
    private readonly IAiExecutionService _aiExecutionService;
    private readonly IUserAuditService _userAuditService;

    public PromptConfigurationService(
        DivertCheckDbContext db,
        IPromptVisionExtractionService promptVisionExtractionService,
        IAiExecutionService aiExecutionService,
        IUserAuditService userAuditService)
    {
        _db = db;
        _promptVisionExtractionService = promptVisionExtractionService;
        _aiExecutionService = aiExecutionService;
        _userAuditService = userAuditService;
    }

    public async Task<PromptConfigurationPageViewModel> GetCurrentConfigurationAsync(CancellationToken cancellationToken = default)
    {
        var currentConfiguration = await GetCurrentPromptConfigurationEntityAsync(cancellationToken);
        return await BuildPageViewModelAsync(currentConfiguration, cancellationToken);
    }

    public async Task<PromptConfigurationPageViewModel> GetPromptConfigurationAsync(
    long promptConfigurationId,
    CancellationToken cancellationToken = default)
    {
        if (promptConfigurationId <= 0)
            throw new InvalidOperationException("A valid prompt configuration id is required.");

        var configuration = await _db.PromptConfigurations
            .Include(configuration => configuration.Prompt)
            .Where(configuration => configuration.IsRecordActive)
            .FirstOrDefaultAsync(
                configuration => configuration.PromptConfigurationId == promptConfigurationId,
                cancellationToken)
            ?? throw new InvalidOperationException($"Prompt configuration {promptConfigurationId} was not found.");

        EnsureEditablePromptConfiguration(configuration);

        return await BuildPageViewModelAsync(configuration, cancellationToken);
    }

    public Task<IReadOnlyCollection<PromptVersionListItemViewModel>> GetPromptVersionHistoryAsync(
        CancellationToken cancellationToken = default)
    {
        return BuildPromptVersionHistoryAsync(cancellationToken);
    }

    public async Task<SetAsCurrentPromptConfigurationResponseViewModel> SetAsCurrentPromptConfigurationAsync(
        long promptConfigurationId,
        CancellationToken cancellationToken = default)
    {
        if (promptConfigurationId <= 0)
            throw new InvalidOperationException("A valid prompt configuration id is required.");

        var configurationToActivate = await _db.PromptConfigurations
            .Include(configuration => configuration.Prompt)
            .FirstOrDefaultAsync(
                configuration => configuration.PromptConfigurationId == promptConfigurationId,
                cancellationToken)
            ?? throw new InvalidOperationException($"Prompt configuration {promptConfigurationId} was not found.");

        EnsureEditablePromptConfiguration(configurationToActivate);

        var currentConfiguration = await GetCurrentPromptConfigurationEntityAsync(cancellationToken);
        if (currentConfiguration.PromptConfigurationId != configurationToActivate.PromptConfigurationId)
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
            await SetOnlyCurrentPromptConfigurationAsync(configurationToActivate.PromptConfigurationId, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        return new SetAsCurrentPromptConfigurationResponseViewModel(
            "Prompt configuration activated successfully.",
            configurationToActivate.PromptConfigurationId);
    }

    public async Task<ReferenceDocumentPromptReviewViewModel> GenerateSuggestedPromptAsync(
        GeneratePromptReviewRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        var promptTarget = NormalizePromptType(request.PromptType);
        var generationPrompt = await GetSuggestedPromptGenerationPromptAsync(promptTarget, cancellationToken);
        var processingStartedAtUtc = DateTime.UtcNow;

        var documentText = await ExtractReferenceTextAsync(request.File, generationPrompt.Configuration, cancellationToken);
        var generatedPromptReview = await _aiExecutionService.GenerateSuggestedPromptReviewAsync(
            generationPrompt.Configuration,
            generationPrompt.PromptText,
            promptTarget,
            request.File?.FileName,
            documentText,
            cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();

        return new ReferenceDocumentPromptReviewViewModel(
            generationPrompt.Configuration.PromptConfigurationId,
            request.File is null ? null : Path.GetFileName(request.File.FileName),
            request.File?.Length,
            promptTarget,
            processingStartedAtUtc,
            DateTime.UtcNow,
            generatedPromptReview);
    }

    private async Task<string> ExtractReferenceTextAsync(
        IFormFile? file,
        PromptConfiguration configuration,
        CancellationToken cancellationToken)
    {
        return file is { Length: > 0 }
            ? await _promptVisionExtractionService.ExtractDocumentTextAsync(file, configuration, cancellationToken: cancellationToken)
            : "No reference document was uploaded.";
    }

    public async Task<ReplacePromptConfigurationResponseViewModel> SaveConfigurationAsync(
        ReplacePromptConfigurationRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        /* Saves user prompt edits as a new editable prompt version. The
           suggested-generation prompt is intentionally not copied into these
           rows; it remains isolated on its own prompt row. */
        ValidateReplaceRequest(request);

        var currentConfiguration = await GetCurrentPromptConfigurationEntityAsync(cancellationToken);
        var reasoningEffort = ResolveRequestedReasoningEffort(request);
        await ValidateOptionSelectionsAsync(request, reasoningEffort, cancellationToken);

        var nextPrompt = CreatePrompt(
            request.EligibilityPrompt,
            request.SummaryPrompt);
        var nextConfiguration = await CreatePromptConfigurationAsync(
            nextPrompt,
            request.AiModelName.Trim(),
            reasoningEffort,
            request.MaxOutputTokens ?? currentConfiguration.MaxOutputTokens,
            cancellationToken);

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        await _userAuditService.SaveChangesAsync(cancellationToken);
        await SetOnlyCurrentPromptConfigurationAsync(nextConfiguration.PromptConfigurationId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var pageViewModel = await BuildPageViewModelAsync(nextConfiguration, cancellationToken);

        return new ReplacePromptConfigurationResponseViewModel(
            "Prompt updated successfully.",
            currentConfiguration.PromptConfigurationId,
            pageViewModel);
    }

    public async Task<UndoPromptTextUpdateResponseViewModel> UndoPromptTextUpdateAsync(
        UndoPromptTextUpdateRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        var promptType = NormalizePromptType(request.PromptType);
        var currentConfiguration = await GetCurrentPromptConfigurationEntityAsync(cancellationToken);

        if (request.PreviousPromptConfigurationId == null)
        {
            return new UndoPromptTextUpdateResponseViewModel(
                "Prompt text restored successfully.",
                promptType,
                ResolvePromptText(currentConfiguration, promptType),
                null);
        }

        if (request.PreviousPromptConfigurationId <= 0)
            throw new ArgumentException("A valid previous prompt configuration id is required.", nameof(request));

        var previousConfiguration = await _db.PromptConfigurations
            .Include(configuration => configuration.Prompt)
            .FirstOrDefaultAsync(
                configuration => configuration.PromptConfigurationId == request.PreviousPromptConfigurationId,
                cancellationToken);

        if (previousConfiguration == null)
            throw new KeyNotFoundException($"Prompt configuration {request.PreviousPromptConfigurationId} was not found.");

        EnsureEditablePromptConfiguration(previousConfiguration);

        return new UndoPromptTextUpdateResponseViewModel(
            "Prompt text restored successfully.",
            promptType,
            ResolvePromptText(previousConfiguration, promptType),
            ResolvePromptText(currentConfiguration, promptType));
    }

    public async Task<ReplacePromptConfigurationResponseViewModel> UndoReplaceCurrentPromptAsync(
        UndoPromptConfigurationRequestViewModel request,
        CancellationToken cancellationToken = default)
    {
        /* Keeps the existing undo behavior intact: remove the newly current
           configuration row and reactivate the requested previous row so the
           page can reload with the prior prompt state. */
        if (request.PromptConfigurationId <= 0)
            throw new ArgumentException("A valid prompt configuration id is required.", nameof(request));

        var previousConfiguration = await _db.PromptConfigurations
            .Include(configuration => configuration.Prompt)
            .FirstOrDefaultAsync(
                configuration => configuration.PromptConfigurationId == request.PromptConfigurationId,
                cancellationToken);

        if (previousConfiguration == null)
            throw new KeyNotFoundException($"Prompt configuration {request.PromptConfigurationId} was not found.");

        EnsureEditablePromptConfiguration(previousConfiguration);

        var currentConfiguration = await GetCurrentPromptConfigurationEntityAsync(cancellationToken);
        await RemoveCurrentAndReactivatePreviousAsync(currentConfiguration, previousConfiguration, cancellationToken);

        var pageViewModel = await BuildPageViewModelAsync(previousConfiguration, cancellationToken);

        return new ReplacePromptConfigurationResponseViewModel(
            "Prompt restored successfully.",
            previousConfiguration.PromptConfigurationId,
            pageViewModel);
    }

    private async Task<PromptConfiguration> GetCurrentPromptConfigurationEntityAsync(CancellationToken cancellationToken)
    {
        // Current page state must come from an editable prompt row, not from
        // the generation-only prompt row whose main/summary text are null.
        return await EditablePromptConfigurations()
            .Where(configuration =>
                configuration.CurrentPrompt)
            .OrderByDescending(configuration => configuration.ModifiedDttm)
            .ThenByDescending(configuration => configuration.PromptVersion)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No current prompt configuration was found.");
    }

    private async Task<SuggestedPromptGenerationPrompt> GetSuggestedPromptGenerationPromptAsync(
        string promptTarget,
        CancellationToken cancellationToken)
    {
        var generationPrompt = await _db.PromptConfigurations
            .Include(configuration => configuration.Prompt)
            .Where(configuration =>
                configuration.IsRecordActive &&
                configuration.Prompt.IsRecordActive &&
                configuration.Prompt.PromptType == SuggestedPromptType)
            .Where(configuration => promptTarget == SummaryPromptType
                ? configuration.Prompt.SummaryPromptText != null && configuration.Prompt.SummaryPromptText != ""
                : configuration.Prompt.MainPromptText != null && configuration.Prompt.MainPromptText != "")
            .OrderByDescending(configuration => configuration.Prompt.ModifiedDttm)
            .Select(configuration => new SuggestedPromptGenerationPrompt(
                configuration,
                promptTarget == SummaryPromptType
                    ? configuration.Prompt.SummaryPromptText!
                    : configuration.Prompt.MainPromptText!))
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException(
                $"No suggested {promptTarget} prompt generation prompt was configured.");

        return generationPrompt with { PromptText = generationPrompt.PromptText.Trim() };
    }

    private async Task<PromptConfigurationPageViewModel> BuildPageViewModelAsync(
        PromptConfiguration configuration,
        CancellationToken cancellationToken)
    {
        var versionHistory = await BuildPromptVersionHistoryAsync(cancellationToken);

        var availableModels = await GetPromptOptionsAsync(
            AiModelCodeType,
            configuration.AiModelName,
            cancellationToken);
        var availableReasoningEfforts = await GetPromptOptionsAsync(
            ReasoningEffortCodeType,
            configuration.ReasoningEffort,
            cancellationToken);

        return new PromptConfigurationPageViewModel(
            configuration.PromptConfigurationId,
            configuration.PromptId,
            configuration.PromptVersion,
            configuration.AiModelName,
            configuration.ReasoningEffort,
            configuration.MaxOutputTokens,
            ResolveMainPromptText(configuration),
            ResolveSummaryPromptText(configuration),
            availableModels,
            availableReasoningEfforts,
            versionHistory);
    }

    private async Task<IReadOnlyCollection<PromptVersionListItemViewModel>> BuildPromptVersionHistoryAsync(
        CancellationToken cancellationToken)
    {
        // Only editable prompt versions belong in the restore dropdown.
        return await EditablePromptConfigurations()
            .OrderByDescending(configuration => configuration.CurrentPrompt)
            .ThenByDescending(configuration => configuration.PromptVersion)
            .Select(configuration => new PromptVersionListItemViewModel(
                configuration.PromptConfigurationId,
                configuration.PromptId,
                configuration.PromptVersion,
                configuration.CurrentPrompt
                    ? $"Current Version ({configuration.PromptVersion})"
                    : $"Version {configuration.PromptVersion}",
                DateTime.SpecifyKind(configuration.Prompt.ModifiedDttm, DateTimeKind.Utc),
                configuration.CurrentPrompt))
            .ToListAsync(cancellationToken);
    }

    private async Task<IReadOnlyCollection<PromptOptionViewModel>> GetPromptOptionsAsync(
        string codeTypeCode,
        string? selectedValue,
        CancellationToken cancellationToken)
    {
        var options = await _db.CodeValues
            .Where(codeValue =>
                codeValue.IsRecordActive &&
                codeValue.CodeTypeCode == codeTypeCode &&
                (codeValue.UserVisibleFlag ?? 'Y') == 'Y')
            .OrderBy(codeValue => codeValue.SortOrder ?? long.MaxValue)
            .ThenBy(codeValue => codeValue.ShortDescription)
            .Select(codeValue => new PromptOptionViewModel(
                codeValue.Value,
                codeValue.ShortDescription,
                (codeValue.DefaultValueFlag ?? 'N') == 'Y'))
            .ToListAsync(cancellationToken);

        if (options.Count == 0)
        {
            options = await GetFallbackPromptOptionsAsync(codeTypeCode, cancellationToken);
        }

        if (options.Count == 0 && !string.IsNullOrWhiteSpace(selectedValue))
        {
            return [new PromptOptionViewModel(selectedValue, selectedValue, true)];
        }

        if (!string.IsNullOrWhiteSpace(selectedValue) &&
            options.All(option => !string.Equals(option.Value, selectedValue, StringComparison.OrdinalIgnoreCase)))
        {
            options.Insert(0, new PromptOptionViewModel(selectedValue, selectedValue, false));
        }

        return options;
    }

    private IQueryable<PromptConfiguration> EditablePromptConfigurations()
    {
        return _db.PromptConfigurations
            .Include(configuration => configuration.Prompt)
            .Where(configuration =>
                configuration.IsRecordActive &&
                configuration.Prompt.PromptType == EligibilityPromptType &&
                configuration.Prompt.MainPromptText != null &&
                configuration.Prompt.MainPromptText != "" &&
                configuration.Prompt.SummaryPromptText != null &&
                configuration.Prompt.SummaryPromptText != "");
    }

    private async Task<List<PromptOptionViewModel>> GetFallbackPromptOptionsAsync(
        string codeTypeCode,
        CancellationToken cancellationToken)
    {
        if (codeTypeCode == AiModelCodeType)
        {
            return await _db.PromptConfigurations
                .Where(configuration => configuration.IsRecordActive)
                .Select(configuration => configuration.AiModelName)
                .Distinct()
                .OrderBy(modelName => modelName)
                .Select(modelName => new PromptOptionViewModel(modelName, modelName, false))
                .ToListAsync(cancellationToken);
        }

        if (codeTypeCode == ReasoningEffortCodeType)
        {
            var configuredOptions = await _db.PromptConfigurations
                .Where(configuration =>
                    configuration.IsRecordActive &&
                    configuration.ReasoningEffort != null)
                .Select(configuration => configuration.ReasoningEffort!)
                .Distinct()
                .OrderBy(reasoningEffort => reasoningEffort)
                .Select(reasoningEffort => new PromptOptionViewModel(reasoningEffort, reasoningEffort, false))
                .ToListAsync(cancellationToken);

            if (configuredOptions.Count > 0)
                return configuredOptions;

            return
            [
                new PromptOptionViewModel("low", "low", false),
                new PromptOptionViewModel("medium", "medium", true),
                new PromptOptionViewModel("high", "high", false)
            ];
        }

        return [];
    }

    private Prompt CreatePrompt(
        string eligibilityPrompt,
        string summaryPrompt)
    {
        var prompt = new Prompt
        {
            MainPromptText = eligibilityPrompt.Trim(),
            SummaryPromptText = summaryPrompt.Trim(),
            PromptType = EligibilityPromptType,
            IsRecordActive = true
        };

        _db.Prompts.Add(prompt);
        return prompt;
    }

    private async Task<PromptConfiguration> CreatePromptConfigurationAsync(
        Prompt prompt,
        string aiModelName,
        string? reasoningEffort,
        int? maxOutputTokens,
        CancellationToken cancellationToken)
    {
        var promptVersion = await GetNextPromptVersionAsync(cancellationToken);

        var configuration = new PromptConfiguration
        {
            Prompt = prompt,
            AiModelIndCode = AiModelCodeType,
            AiModelName = aiModelName,
            ReasoningEffortIndCode = string.IsNullOrWhiteSpace(reasoningEffort) ? null : ReasoningEffortCodeType,
            ReasoningEffort = reasoningEffort,
            MaxOutputTokens = maxOutputTokens,
            IsRecordActive = true,
            CurrentPrompt = false,
            PromptVersion = promptVersion
        };

        _db.PromptConfigurations.Add(configuration);
        return configuration;
    }

    private static void ValidateReplaceRequest(ReplacePromptConfigurationRequestViewModel request)
    {
        if (string.IsNullOrWhiteSpace(request.AiModelName))
            throw new ArgumentException("AI model is required.", nameof(request));

        if (string.IsNullOrWhiteSpace(request.EligibilityPrompt))
            throw new ArgumentException("Eligibility prompt is required.", nameof(request));

        if (string.IsNullOrWhiteSpace(request.SummaryPrompt))
            throw new ArgumentException("Summary prompt is required.", nameof(request));

        if (request.MaxOutputTokens is < MinimumMaxOutputTokens)
            throw new ArgumentException(
                $"Max output tokens must be at least {MinimumMaxOutputTokens} when provided.",
                nameof(request));
    }

    private async Task ValidateOptionSelectionsAsync(
        ReplacePromptConfigurationRequestViewModel request,
        string normalizedReasoningEffort,
        CancellationToken cancellationToken)
    {
        await ValidateOptionExistsAsync(
            AiModelCodeType,
            request.AiModelName.Trim(),
            promptConfigurations => promptConfigurations.Select(configuration => configuration.AiModelName),
            "AI model",
            cancellationToken);

        await ValidateOptionExistsAsync(
            ReasoningEffortCodeType,
            normalizedReasoningEffort,
            promptConfigurations => promptConfigurations
                .Where(configuration => configuration.ReasoningEffort != null)
                .Select(configuration => configuration.ReasoningEffort!),
            "reasoning effort",
            cancellationToken);
    }

    private async Task ValidateOptionExistsAsync(
        string codeTypeCode,
        string selectedValue,
        Func<IQueryable<PromptConfiguration>, IQueryable<string>> fallbackSelector,
        string optionLabel,
        CancellationToken cancellationToken)
    {
        var existsInCodeValues = await _db.CodeValues.AnyAsync(
            codeValue =>
                codeValue.IsRecordActive &&
                codeValue.CodeTypeCode == codeTypeCode &&
                codeValue.Value == selectedValue,
            cancellationToken);

        if (existsInCodeValues)
            return;

        var existsInConfigurations = await fallbackSelector(
                _db.PromptConfigurations.Where(configuration => configuration.IsRecordActive))
            .AnyAsync(value => value == selectedValue, cancellationToken);

        if (!existsInConfigurations)
            throw new ArgumentException($"The selected {optionLabel} '{selectedValue}' is not supported.");
    }

    private async Task RemoveCurrentAndReactivatePreviousAsync(
        PromptConfiguration currentConfiguration,
        PromptConfiguration previousConfiguration,
        CancellationToken cancellationToken)
    {
        if (currentConfiguration.PromptConfigurationId == previousConfiguration.PromptConfigurationId)
            throw new InvalidOperationException("The current configuration cannot be undone to itself.");

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        await SetOnlyCurrentPromptConfigurationAsync(previousConfiguration.PromptConfigurationId, cancellationToken);

        _db.PromptConfigurations.Remove(currentConfiguration);

        var currentPromptInUseElsewhere = await _db.PromptConfigurations
            .AnyAsync(
                configuration =>
                    configuration.PromptId == currentConfiguration.PromptId &&
                    configuration.PromptConfigurationId != currentConfiguration.PromptConfigurationId,
                cancellationToken);

        if (!currentPromptInUseElsewhere)
        {
            var currentPrompt = await _db.Prompts.FirstOrDefaultAsync(
                prompt => prompt.PromptId == currentConfiguration.PromptId,
                cancellationToken);

            if (currentPrompt != null)
            {
                _db.Prompts.Remove(currentPrompt);
            }
        }

        await _userAuditService.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private async Task SetOnlyCurrentPromptConfigurationAsync(
        long promptConfigurationId,
        CancellationToken cancellationToken)
    {
        await _db.PromptConfigurations
            .Where(configuration =>
                configuration.IsRecordActive &&
                configuration.CurrentPrompt)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(configuration => configuration.CurrentPrompt, false)
                .SetProperty(configuration => configuration.ModifiedUser, _userAuditService.CurrentUserId),
                cancellationToken);

        await _db.PromptConfigurations
            .Where(configuration => configuration.PromptConfigurationId == promptConfigurationId)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(configuration => configuration.IsRecordActive, true)
                .SetProperty(configuration => configuration.CurrentPrompt, true)
                .SetProperty(configuration => configuration.ModifiedUser, _userAuditService.CurrentUserId),
                cancellationToken);
    }

    private async Task<int> GetNextPromptVersionAsync(CancellationToken cancellationToken)
    {
        var currentMaxVersion = await _db.PromptConfigurations
            .Select(configuration => (int?)configuration.PromptVersion)
            .MaxAsync(cancellationToken);

        return (currentMaxVersion ?? 0) + 1;
    }

    private static string? NormalizeOptionalReasoningEffort(string? reasoningEffort)
    {
        return string.IsNullOrWhiteSpace(reasoningEffort) ? null : reasoningEffort.Trim();
    }

    private static string ResolveRequestedReasoningEffort(ReplacePromptConfigurationRequestViewModel request)
    {
        var normalizedReasoningEffort = NormalizeOptionalReasoningEffort(
            request.ReasoningEffort
            ?? request.Reasoning
            ?? request.ReasoningEffortSnakeCase)
            ?.ToLowerInvariant();

        return normalizedReasoningEffort switch
        {
            LowReasoningEffort => LowReasoningEffort,
            MediumReasoningEffort => MediumReasoningEffort,
            HighReasoningEffort => HighReasoningEffort,
            _ => throw new ArgumentException("Reasoning effort must be low, medium, or high.", nameof(request))
        };
    }

    internal static string NormalizePromptType(string? promptType)
    {
        if (string.IsNullOrWhiteSpace(promptType))
            return MainPromptType;

        return promptType.Trim().ToLowerInvariant() switch
        {
            "main" or "eligibility" => MainPromptType,
            "summary" or "outcomesummary" or "outcome-summary" => SummaryPromptType,
            _ => throw new ArgumentException("Prompt type must be main or summary.", nameof(promptType))
        };
    }

    private static string ResolveMainPromptText(PromptConfiguration configuration)
    {
        var promptText = configuration.Prompt.MainPromptText;

        if (string.IsNullOrWhiteSpace(promptText))
            throw new InvalidOperationException($"Prompt configuration {configuration.PromptConfigurationId} has no main prompt text.");

        return promptText;
    }

    private static string ResolveSummaryPromptText(PromptConfiguration configuration)
    {
        var promptText = configuration.Prompt.SummaryPromptText;

        if (string.IsNullOrWhiteSpace(promptText))
            throw new InvalidOperationException($"Prompt configuration {configuration.PromptConfigurationId} has no summary prompt text.");

        return promptText;
    }

    private static string ResolvePromptText(PromptConfiguration configuration, string promptType)
    {
        return promptType == MainPromptType
            ? ResolveMainPromptText(configuration)
            : ResolveSummaryPromptText(configuration);
    }

    private static void EnsureEditablePromptConfiguration(PromptConfiguration configuration)
    {
        if (!string.Equals(configuration.Prompt.PromptType, EligibilityPromptType, StringComparison.Ordinal) ||
            string.IsNullOrWhiteSpace(configuration.Prompt.MainPromptText) ||
            string.IsNullOrWhiteSpace(configuration.Prompt.SummaryPromptText))
        {
            throw new InvalidOperationException(
                $"Prompt configuration {configuration.PromptConfigurationId} is not an editable prompt configuration.");
        }
    }

    private sealed record SuggestedPromptGenerationPrompt(
        PromptConfiguration Configuration,
        string PromptText);
}

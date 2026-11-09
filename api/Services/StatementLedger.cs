//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using api.Services.Interfaces;

namespace api.Services;

/*
   Statement ledger: deterministic code around the transaction-extraction model call.

   The model only reads and labels what is printed. Everything that decides the total lives here:
   - Extraction units are built from whole pages and, where possible, whole statements, with no overlap,
     so a row can only ever be extracted by one call.
   - Every itemized row is kept with its page and its position on the page. Two identical purchases on the
     same day are two rows; duplicates are removed only when the same (document, page, row position) is
     returned twice.
   - Amounts are parsed strictly. A value such as "63,00" is rejected instead of being read as 6300.
   - Each statement is reconciled against its own printed Account/Activity Summary, and the summary itself
     is checked with the balance equation. Anything that does not reconcile is flagged for staff review.
   - A second filed copy of the same statement (same account, period and printed figures) is shown but not
     counted again.
*/
internal static class StatementLedgerBuilder
{
    public const string CategoryPurchase = "purchase";
    public const string CategoryCashAdvance = "cash_advance";
    public const string CategoryBalanceTransfer = "balance_transfer";
    public const string CategoryFee = "fee";
    public const string CategoryInterest = "interest";
    public const string CategoryPayment = "payment";
    public const string CategoryCredit = "credit";
    public const string CategoryOtherDebit = "other_debit";
    public const string CategoryOther = "other";

    public static readonly string[] Categories =
    [
        CategoryPurchase,
        CategoryCashAdvance,
        CategoryBalanceTransfer,
        CategoryFee,
        CategoryInterest,
        CategoryPayment,
        CategoryCredit,
        CategoryOtherDebit,
        CategoryOther
    ];

    // Statement-block detection. A page starts a statement block when it prints "Page 1 of N", or when it prints an
    // Account/Activity Summary and is not itself a later page ("Page 2 of N", ...) of a statement. So a statement
    // whose page 1 is a cover and whose summary is on page 2 stays one block, and a summary box repeated on a
    // continuation page never splits a statement.
    private static readonly Regex PageOfRegex = new(
        @"\bpage\s*(\d+)\s*of\s*\d+\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex SummaryHeadingRegex = new(
        @"\b(account|activity)\s+summary\b|\bsummary\s+of\s+account\s+activity\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static bool StartsStatement(string? pageText)
    {
        var text = pageText ?? string.Empty;
        var pageNumbers = PageOfRegex.Matches(text)
            .Select(match => int.TryParse(match.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) ? number : 0)
            .ToList();
        if (pageNumbers.Contains(1))
            return true;
        if (pageNumbers.Any(number => number > 1))
            return false;
        return SummaryHeadingRegex.IsMatch(text);
    }

    private static readonly string[] DateFormats =
    [
        "M/d/yyyy", "MM/dd/yyyy", "M/d/yy", "MM/dd/yy",
        "MMM d, yyyy", "MMM dd, yyyy", "MMMM d, yyyy", "MMMM dd, yyyy",
        "MMM d yyyy", "MMM dd yyyy", "MMMM d yyyy", "MMMM dd yyyy",
        "MMM. d, yyyy", "yyyy-MM-dd", "yyyy-M-d"
    ];

    // ---------------------------------------------------------------------------------------------
    // Extraction units
    // ---------------------------------------------------------------------------------------------

    public static IReadOnlyList<TransactionExtractionUnit> CreateUnits(
        IReadOnlyCollection<EvidenceDocument> documents,
        int maxCharacters)
    {
        var units = new List<TransactionExtractionUnit>();
        foreach (var document in documents)
        {
            var pages = document.Extraction.Pages.OrderBy(page => page.PageNumber).ToList();
            if (pages.Count == 0)
                continue;

            // Group pages into statement-sized blocks.
            var blocks = new List<List<ExtractedDocumentPage>>();
            foreach (var page in pages)
            {
                if (blocks.Count == 0 || StartsStatement(page.Text))
                    blocks.Add([]);
                blocks[^1].Add(page);
            }

            var blockStarts = blocks.Select(block => block[0].PageNumber).ToArray();

            // Pack whole blocks into units. A block larger than the limit is split at page boundaries only.
            var ordinal = 1;
            var current = new List<ExtractedDocumentPage>();
            var currentLength = 0;
            foreach (var block in blocks)
            {
                var blockLength = block.Sum(page => FormatPage(page.PageNumber, page.Text).Length);
                if (blockLength > maxCharacters)
                {
                    Flush(document, units, current, blockStarts, ref ordinal);
                    currentLength = 0;
                    foreach (var page in block)
                    {
                        var pageLength = FormatPage(page.PageNumber, page.Text).Length;
                        if (current.Count > 0 && currentLength + pageLength > maxCharacters)
                        {
                            Flush(document, units, current, blockStarts, ref ordinal);
                            currentLength = 0;
                        }

                        current.Add(page);
                        currentLength += pageLength;
                    }

                    Flush(document, units, current, blockStarts, ref ordinal);
                    currentLength = 0;
                    continue;
                }

                if (current.Count > 0 && currentLength + blockLength > maxCharacters)
                {
                    Flush(document, units, current, blockStarts, ref ordinal);
                    currentLength = 0;
                }

                current.AddRange(block);
                currentLength += blockLength;
            }

            Flush(document, units, current, blockStarts, ref ordinal);
        }

        return units;
    }

    // Splits a unit into one unit per page. Used when a response is cut off by the output limit.
    public static IReadOnlyList<TransactionExtractionUnit> SplitIntoPages(
        TransactionExtractionUnit unit,
        EvidenceDocument document)
    {
        return document.Extraction.Pages
            .Where(page => unit.Pages.Contains(page.PageNumber))
            .OrderBy(page => page.PageNumber)
            .Select(page => BuildUnit(document, $"{unit.UnitId}-p{page.PageNumber:D4}", [page], unit.DocumentBlockStarts))
            .ToList();
    }

    private static void Flush(
        EvidenceDocument document,
        ICollection<TransactionExtractionUnit> destination,
        List<ExtractedDocumentPage> pages,
        IReadOnlyList<int> blockStarts,
        ref int ordinal)
    {
        if (pages.Count == 0)
            return;

        destination.Add(BuildUnit(document, $"document-{document.DocumentId}-ledger-{ordinal++:D4}", pages, blockStarts));
        pages.Clear();
    }

    private static TransactionExtractionUnit BuildUnit(
        EvidenceDocument document,
        string unitId,
        IReadOnlyList<ExtractedDocumentPage> pages,
        IReadOnlyList<int> blockStarts)
    {
        var text = string.Join(Environment.NewLine, pages.Select(page => FormatPage(page.PageNumber, page.Text)));
        return new TransactionExtractionUnit(
            unitId,
            document.DocumentId,
            document.SourceFileName,
            pages.Select(page => page.PageNumber).ToArray(),
            text,
            blockStarts);
    }

    // Same page markers as DocumentChunkingService, so prompts and citations stay consistent.
    private static string FormatPage(int pageNumber, string? text) =>
        $"=== PAGE {pageNumber} START ==={Environment.NewLine}{(text ?? string.Empty).Trim()}{Environment.NewLine}=== PAGE {pageNumber} END ==={Environment.NewLine}";

    // ---------------------------------------------------------------------------------------------
    // Amount parsing
    // ---------------------------------------------------------------------------------------------

    private static readonly Regex AmountBodyRegex = new(
        @"^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex WholeDollarBodyRegex = new(
        @"^(?:\d{1,3}(?:,\d{3})+|\d+)$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /*
       Strict currency parser. Accepts "$1,234.56", "1234.56", "-$12.00", "- $482.00", "$12.00-",
       "$12.00CR", "($12.00)" and "+$0.00". Rejects anything else, including OCR comma-decimals such as
       "63,00", which a naive "remove commas" parser would read as 6300.
       Whole-dollar values ("$14,500") are accepted only when allowWholeDollars is true (printed
       summary/credit-line figures), never for transaction rows.
    */
    public static bool TryParseAmount(string? raw, out decimal value, bool allowWholeDollars = false)
    {
        value = 0m;
        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var text = raw.Trim()
            .Replace('\u2212', '-')
            .Replace('\u2013', '-')
            .Replace('\u2014', '-');
        var negative = false;

        if (text.StartsWith('(') && text.EndsWith(')'))
        {
            negative = true;
            text = text[1..^1].Trim();
        }

        if (text.EndsWith("CR", StringComparison.OrdinalIgnoreCase))
        {
            negative = true;
            text = text[..^2].Trim();
        }

        if (text.EndsWith('-'))
        {
            negative = true;
            text = text[..^1].Trim();
        }

        if (text.StartsWith('-'))
        {
            negative = true;
            text = text[1..].Trim();
        }
        else if (text.StartsWith('+'))
        {
            text = text[1..].Trim();
        }

        if (text.StartsWith('$'))
            text = text[1..].Trim();

        // A sign may also follow the dollar sign: "$-12.00".
        if (text.StartsWith('-'))
        {
            negative = true;
            text = text[1..].Trim();
        }

        if (!AmountBodyRegex.IsMatch(text) && !(allowWholeDollars && WholeDollarBodyRegex.IsMatch(text)))
            return false;

        if (!decimal.TryParse(
                text.Replace(",", string.Empty, StringComparison.Ordinal),
                NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture,
                out var parsed))
            return false;

        value = negative ? -parsed : parsed;
        return true;
    }

    public static string FormatMoney(decimal value) =>
        value < 0
            ? $"-${Math.Abs(value).ToString("#,##0.00", CultureInfo.InvariantCulture)}"
            : $"${value.ToString("#,##0.00", CultureInfo.InvariantCulture)}";

    private static string? NormalizeDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var text = Regex.Replace(raw.Trim(), @"\s+", " ");
        if (DateTime.TryParseExact(text, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var exact))
            return exact.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (DateTime.TryParse(text, CultureInfo.GetCultureInfo("en-US"), DateTimeStyles.AllowWhiteSpaces, out var loose))
            return loose.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        return text.ToLowerInvariant();
    }

    // ---------------------------------------------------------------------------------------------
    // Validation of one model response for one unit
    // ---------------------------------------------------------------------------------------------

    public static UnitValidation Validate(TransactionExtractionUnit unit, TransactionExtractionResult result)
    {
        var errors = new List<string>();
        var pages = unit.Pages.ToHashSet();
        var statements = new List<ExtractedStatementSummary>();
        var rows = new List<ExtractedLedgerRow>();
        var values = new List<ExtractedMonetaryValue>();
        var seenRows = new HashSet<(int Page, int Row)>();
        var seenSummaryPages = new HashSet<int>();

        foreach (var statement in result.Statements ?? [])
        {
            if (!pages.Contains(statement.SummaryPage))
            {
                errors.Add($"Statement summary page {statement.SummaryPage} is outside pages {unit.PageRange}.");
                continue;
            }

            if (!seenSummaryPages.Add(statement.SummaryPage))
            {
                errors.Add($"Statement summary on page {statement.SummaryPage} was returned more than once.");
                continue;
            }

            statements.Add(statement);
        }

        foreach (var row in result.Transactions ?? [])
        {
            if (!pages.Contains(row.SourcePage))
            {
                errors.Add($"Row on page {row.SourcePage} is outside pages {unit.PageRange}.");
                continue;
            }

            if (row.RowOnPage < 1)
            {
                errors.Add($"Row on page {row.SourcePage} has an invalid row_on_page ({row.RowOnPage}).");
                continue;
            }

            if (!seenRows.Add((row.SourcePage, row.RowOnPage)))
            {
                errors.Add($"Page {row.SourcePage} row {row.RowOnPage} was returned more than once.");
                continue;
            }

            if (!Categories.Contains(row.Category, StringComparer.Ordinal))
            {
                errors.Add($"Page {row.SourcePage} row {row.RowOnPage} has unknown category '{row.Category}'.");
                continue;
            }

            if (string.IsNullOrWhiteSpace(row.Description))
            {
                errors.Add($"Page {row.SourcePage} row {row.RowOnPage} has no description.");
                continue;
            }

            if (!TryParseAmount(row.Amount, out _))
            {
                errors.Add($"Page {row.SourcePage} row {row.RowOnPage} amount '{row.Amount}' is not a valid currency amount.");
                continue;
            }

            rows.Add(row);
        }

        foreach (var value in result.MonetaryValues ?? [])
        {
            if (!pages.Contains(value.SourcePage))
            {
                errors.Add($"Monetary value '{value.Label}' on page {value.SourcePage} is outside pages {unit.PageRange}.");
                continue;
            }

            values.Add(value);
        }

        return new UnitValidation(
            new TransactionExtractionResult(statements, rows, values),
            errors);
    }

    // ---------------------------------------------------------------------------------------------
    // Ledger
    // ---------------------------------------------------------------------------------------------

    public static StatementLedger Build(IReadOnlyList<UnitExtraction> extractions)
    {
        var warnings = extractions.SelectMany(extraction => extraction.Warnings).ToList();
        var statements = new List<LedgerStatement>();
        var rows = new List<LedgerRow>();
        var values = new List<LedgerMonetaryValue>();

        // Units never overlap, but guard anyway: the same (document, page, row) or (document, summary page)
        // is kept once.
        var seenRows = new HashSet<(long DocumentId, int Page, int Row)>();
        var seenSummaries = new HashSet<(long DocumentId, int Page)>();
        var seenValues = new HashSet<(long DocumentId, int Page, string Label, string Amount)>();
        var blockStartsByDocument = new Dictionary<long, int[]>();
        var documentNames = new Dictionary<long, string>();

        foreach (var extraction in extractions.OrderBy(item => item.Unit.DocumentId).ThenBy(item => item.Unit.Pages.Min()))
        {
            var unit = extraction.Unit;
            documentNames[unit.DocumentId] = unit.SourceFileName;
            if (!blockStartsByDocument.ContainsKey(unit.DocumentId))
                blockStartsByDocument[unit.DocumentId] = unit.DocumentBlockStarts.Order().ToArray();

            foreach (var summary in extraction.Result.Statements ?? [])
            {
                if (!seenSummaries.Add((unit.DocumentId, summary.SummaryPage)))
                {
                    warnings.Add($"{unit.SourceFileName}, page {summary.SummaryPage}: statement summary returned twice; kept the first.");
                    continue;
                }

                statements.Add(LedgerStatement.From(unit, summary));
            }

            foreach (var row in extraction.Result.Transactions ?? [])
            {
                if (!seenRows.Add((unit.DocumentId, row.SourcePage, row.RowOnPage)))
                {
                    warnings.Add($"{unit.SourceFileName}, page {row.SourcePage} row {row.RowOnPage}: returned twice; kept the first.");
                    continue;
                }

                TryParseAmount(row.Amount, out var amount);
                rows.Add(new LedgerRow(
                    unit.DocumentId,
                    unit.SourceFileName,
                    row.SourcePage,
                    row.RowOnPage,
                    Clean(row.SectionHeading),
                    Clean(row.TransactionDate),
                    Clean(row.PostDate),
                    Clean(row.ReferenceNumber),
                    row.Description.Trim(),
                    row.Amount.Trim(),
                    amount,
                    row.Category,
                    OwnerSummaryPage: null));
            }

            foreach (var value in extraction.Result.MonetaryValues ?? [])
            {
                var label = (value.Label ?? string.Empty).Trim();
                var amountText = (value.Amount ?? string.Empty).Trim();
                if (!seenValues.Add((unit.DocumentId, value.SourcePage, label.ToLowerInvariant(), amountText)))
                    continue;

                values.Add(new LedgerMonetaryValue(unit.DocumentId, unit.SourceFileName, value.SourcePage, label, amountText));
            }
        }

        statements = statements
            .OrderBy(statement => statement.DocumentId)
            .ThenBy(statement => statement.SummaryPage)
            .ToList();

        int BlockOf(long documentId, int page)
        {
            if (!blockStartsByDocument.TryGetValue(documentId, out var starts) || starts.Length == 0)
                return 1;
            var start = starts[0];
            foreach (var candidate in starts)
            {
                if (candidate > page)
                    break;
                start = candidate;
            }

            return start;
        }

        // Attach each row to a statement in the same statement block (pages from one statement start to the next):
        // the last summary at or before the row, else the first summary later in the block (a statement whose summary
        // is printed after some of its rows). Rows in a block with no summary fall back to the last summary at or before
        // the row in the document, then to the document's first summary. Only documents without any summary have
        // rows that are not tied to a statement.
        LedgerStatement? FindOwner(LedgerRow row)
        {
            var documentStatements = statements.Where(statement => statement.DocumentId == row.DocumentId).ToList();
            if (documentStatements.Count == 0)
                return null;

            var block = BlockOf(row.DocumentId, row.SourcePage);
            var inBlock = documentStatements.Where(statement => BlockOf(statement.DocumentId, statement.SummaryPage) == block).ToList();
            if (inBlock.Count > 0)
            {
                return inBlock.LastOrDefault(statement => statement.SummaryPage <= row.SourcePage)
                    ?? inBlock.First();
            }

            return documentStatements.LastOrDefault(statement => statement.SummaryPage <= row.SourcePage)
                ?? documentStatements.First();
        }

        // Two summaries for the same account and period with the same printed figures:
        // - in the same statement block, it is the same statement's summary printed again: its rows belong to the
        //   first summary and it is not counted separately;
        // - in different blocks, it is a second filed copy of the statement: shown, but not counted again.
        // Figures must actually be printed on both; two unreadable summaries are never treated as the same statement.
        var duplicateOf = new Dictionary<LedgerStatement, LedgerStatement>();
        var repeatedOf = new Dictionary<LedgerStatement, LedgerStatement>();
        foreach (var group in statements
                     .Where(statement => statement.PeriodKey is not null)
                     .GroupBy(statement => (statement.AccountKey, statement.PeriodKey)))
        {
            var ordered = group.ToList();
            if (ordered.Count < 2)
                continue;

            var first = ordered[0];
            foreach (var other in ordered.Skip(1))
            {
                var sameBlock = other.DocumentId == first.DocumentId &&
                    BlockOf(other.DocumentId, other.SummaryPage) == BlockOf(first.DocumentId, first.SummaryPage);
                if (other.HasSameFigures(first) && sameBlock)
                {
                    repeatedOf[other] = first;
                }
                else if (other.HasSameFigures(first))
                {
                    duplicateOf[other] = first;
                    warnings.Add(
                        $"{other.SourceDocument}, page {other.SummaryPage}: duplicate copy of the statement for {first.PeriodDisplay} " +
                        $"({first.SourceDocument}, page {first.SummaryPage}). Shown, but not counted again.");
                }
                else
                {
                    warnings.Add(
                        $"Two statement summaries cover {first.PeriodDisplay} for the same account " +
                        $"({first.SourceDocument}, page {first.SummaryPage} and {other.SourceDocument}, page {other.SummaryPage}) " +
                        "and could not be confirmed as identical copies. Both are counted; staff review required.");
                }
            }
        }

        var rowsByStatement = new Dictionary<LedgerStatement, List<LedgerRow>>();
        var unattachedRows = new List<LedgerRow>();
        for (var index = 0; index < rows.Count; index++)
        {
            var owner = FindOwner(rows[index]);
            if (owner is not null && repeatedOf.TryGetValue(owner, out var canonical))
                owner = canonical;
            if (owner is null)
            {
                unattachedRows.Add(rows[index]);
                continue;
            }

            rows[index] = rows[index] with { OwnerSummaryPage = owner.SummaryPage };
            if (!rowsByStatement.TryGetValue(owner, out var list))
                rowsByStatement[owner] = list = [];
            list.Add(rows[index]);
        }

        var ledgerStatements = new List<LedgerStatementResult>();
        foreach (var statement in statements)
        {
            var statementRows = rowsByStatement.TryGetValue(statement, out var ownedRows)
                ? ownedRows
                : new List<LedgerRow>();
            ledgerStatements.Add(Reconcile(
                statement,
                statementRows,
                duplicateOf.GetValueOrDefault(statement),
                repeatedOf.GetValueOrDefault(statement)));
        }

        foreach (var group in unattachedRows.GroupBy(row => row.DocumentId))
        {
            var purchaseRows = group.Count(row => row.Category == CategoryPurchase);
            warnings.Add(
                $"{documentNames.GetValueOrDefault(group.Key, "document")}: no statement summary was found, so {group.Count()} row(s) " +
                $"({purchaseRows} purchase row(s)) could not be checked against a printed total. Purchase rows are counted as itemized.");
        }

        var unattachedPurchases = unattachedRows.Where(row => row.Category == CategoryPurchase).Sum(row => row.Amount);
        var total = ledgerStatements.Where(item => item.CountsTowardTotal).Sum(item => item.PurchasesUsed) + unattachedPurchases;
        var itemizedTotal = ledgerStatements.Where(item => item.CountsTowardTotal).Sum(item => item.ItemizedPurchases) + unattachedPurchases;

        foreach (var item in ledgerStatements.Where(item => item.Status is not (StatementStatus.Reconciled or StatementStatus.DuplicateCopy or StatementStatus.RepeatedSummary)))
            warnings.Add($"{item.Statement.SourceDocument}, page {item.Statement.SummaryPage} ({item.Statement.PeriodDisplay}): {item.StatusNote}");

        var needsReview = warnings.Count > 0 ||
            ledgerStatements.Any(item => item.Status is not (StatementStatus.Reconciled or StatementStatus.DuplicateCopy or StatementStatus.RepeatedSummary));

        return new StatementLedger(
            ledgerStatements,
            rows.OrderBy(row => row.DocumentId).ThenBy(row => row.SourcePage).ThenBy(row => row.RowOnPage).ToList(),
            values.OrderBy(value => value.DocumentId).ThenBy(value => value.SourcePage).ToList(),
            unattachedRows,
            total,
            itemizedTotal,
            needsReview ? "NEEDS REVIEW" : "VERIFIED",
            warnings.Distinct().ToList());
    }

    private static LedgerStatementResult Reconcile(
        LedgerStatement statement,
        IReadOnlyList<LedgerRow> rows,
        LedgerStatement? duplicateOf,
        LedgerStatement? repeatedOf)
    {
        decimal SumOf(string category) => rows.Where(row => row.Category == category).Sum(row => row.Amount);

        var itemizedPurchases = SumOf(CategoryPurchase);
        var itemizedAdvances = SumOf(CategoryCashAdvance);
        var purchaseRowCount = rows.Count(row => row.Category == CategoryPurchase);
        var balanceCheck = statement.BalanceEquationHolds();
        var balanceNote = balanceCheck switch
        {
            true => "summary balances",
            false => "summary does not balance (a printed summary figure may be misread)",
            null => "balance check not possible (previous or new balance missing)"
        };

        if (repeatedOf is not null)
        {
            return new LedgerStatementResult(
                statement, StatementStatus.RepeatedSummary, 0m, 0m, 0,
                0m, false, balanceCheck,
                $"Same summary printed again for the statement on page {repeatedOf.SummaryPage}; its rows are counted there.");
        }

        if (duplicateOf is not null)
        {
            return new LedgerStatementResult(
                statement, StatementStatus.DuplicateCopy, itemizedPurchases, itemizedAdvances, purchaseRowCount,
                0m, false, balanceCheck,
                $"Duplicate of {duplicateOf.SourceDocument}, page {duplicateOf.SummaryPage}; not counted again.");
        }

        if (statement.Purchases is not decimal printed)
        {
            return new LedgerStatementResult(
                statement, StatementStatus.NoPrintedPurchases, itemizedPurchases, itemizedAdvances, purchaseRowCount,
                itemizedPurchases, true, balanceCheck,
                $"No readable Purchases line in the summary; itemized purchases {FormatMoney(itemizedPurchases)} used ({balanceNote}).");
        }

        var advancesNote = statement.CashAdvances is decimal printedAdvances && printedAdvances != itemizedAdvances
            ? $" Cash advance rows total {FormatMoney(itemizedAdvances)} but the summary shows {FormatMoney(printedAdvances)}."
            : string.Empty;

        if (printed == itemizedPurchases)
        {
            var status = balanceCheck == false ? StatementStatus.SummaryDoesNotBalance : StatementStatus.Reconciled;
            return new LedgerStatementResult(
                statement, status, itemizedPurchases, itemizedAdvances, purchaseRowCount,
                printed, true, balanceCheck,
                status == StatementStatus.Reconciled
                    ? $"Itemized purchases match the printed {statement.PurchasesLabel} line ({balanceNote}).{advancesNote}"
                    : $"Itemized purchases match the printed line, but the {balanceNote}.{advancesNote}");
        }

        if (purchaseRowCount == 0 && printed != 0m)
        {
            return new LedgerStatementResult(
                statement, StatementStatus.SummaryOnly, itemizedPurchases, itemizedAdvances, purchaseRowCount,
                printed, true, balanceCheck,
                $"Summary shows {statement.PurchasesLabel} {FormatMoney(printed)} but no itemized purchase rows were found; printed figure used ({balanceNote}).{advancesNote}");
        }

        // Mismatch. Trust the printed figure only when the summary is internally consistent.
        var used = balanceCheck == true ? printed : itemizedPurchases;
        return new LedgerStatementResult(
            statement, StatementStatus.Mismatch, itemizedPurchases, itemizedAdvances, purchaseRowCount,
            used, true, balanceCheck,
            $"Itemized purchases {FormatMoney(itemizedPurchases)} do not match the printed {statement.PurchasesLabel} line " +
            $"{FormatMoney(printed)} (difference {FormatMoney(itemizedPurchases - printed)}); " +
            (balanceCheck == true
                ? "the printed figure is used because the summary balances."
                : $"the itemized figure is used because the {balanceNote}.") +
            advancesNote);
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    internal static string? NormalizeForKey(string? value) => NormalizeDate(value);
}

internal enum StatementStatus
{
    Reconciled,
    Mismatch,
    SummaryOnly,
    NoPrintedPurchases,
    SummaryDoesNotBalance,
    DuplicateCopy,
    RepeatedSummary
}

internal sealed record TransactionExtractionUnit(
    string UnitId,
    long DocumentId,
    string SourceFileName,
    IReadOnlyList<int> Pages,
    string Text,
    IReadOnlyList<int> DocumentBlockStarts)
{
    public string PageRange => Pages.Count == 0
        ? "none"
        : Pages.Min() == Pages.Max() ? $"{Pages.Min()}" : $"{Pages.Min()}-{Pages.Max()}";
}

// ----- Model output (structured output schema, snake_case on the wire) -----

internal sealed record TransactionExtractionResult(
    IReadOnlyList<ExtractedStatementSummary>? Statements,
    IReadOnlyList<ExtractedLedgerRow>? Transactions,
    IReadOnlyList<ExtractedMonetaryValue>? MonetaryValues);

internal sealed record ExtractedStatementSummary(
    int SummaryPage,
    string? AccountIdentifier,
    string? PeriodStart,
    string? PeriodEnd,
    string? PreviousBalance,
    string? Payments,
    string? OtherCredits,
    string? PurchasesLabel,
    string? Purchases,
    string? BalanceTransfers,
    string? CashAdvances,
    string? OtherDebits,
    string? FeesCharged,
    string? InterestCharged,
    string? NewBalance);

internal sealed record ExtractedLedgerRow(
    int SourcePage,
    int RowOnPage,
    string? SectionHeading,
    string? TransactionDate,
    string? PostDate,
    string? ReferenceNumber,
    string Description,
    string Amount,
    string Category);

internal sealed record ExtractedMonetaryValue(
    int SourcePage,
    string Label,
    string Amount);

internal sealed record UnitValidation(
    TransactionExtractionResult Sanitized,
    IReadOnlyList<string> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

internal sealed record UnitExtraction(
    TransactionExtractionUnit Unit,
    TransactionExtractionResult Result,
    IReadOnlyList<string> Warnings);

// ----- Ledger -----

internal sealed class LedgerStatement
{
    public required long DocumentId { get; init; }
    public required string SourceDocument { get; init; }
    public required int SummaryPage { get; init; }
    public string? AccountIdentifier { get; init; }
    public string? PeriodStart { get; init; }
    public string? PeriodEnd { get; init; }
    public required string PurchasesLabel { get; init; }
    public required ExtractedStatementSummary Raw { get; init; }
    public decimal? PreviousBalance { get; init; }
    public decimal? Payments { get; init; }
    public decimal? OtherCredits { get; init; }
    public decimal? Purchases { get; init; }
    public decimal? BalanceTransfers { get; init; }
    public decimal? CashAdvances { get; init; }
    public decimal? OtherDebits { get; init; }
    public decimal? FeesCharged { get; init; }
    public decimal? InterestCharged { get; init; }
    public decimal? NewBalance { get; init; }

    public string PeriodDisplay =>
        PeriodStart is null && PeriodEnd is null
            ? "period not printed"
            : $"{PeriodStart ?? "?"} - {PeriodEnd ?? "?"}";

    public string? PeriodKey
    {
        get
        {
            var start = StatementLedgerBuilder.NormalizeForKey(PeriodStart);
            var end = StatementLedgerBuilder.NormalizeForKey(PeriodEnd);
            return start is null || end is null ? null : $"{start}|{end}";
        }
    }

    // Last four digits of the printed account identifier, so "8004 2123", "Account: ...2123" and
    // "ending in 2123" all match. Empty when no identifier is printed.
    public string AccountKey
    {
        get
        {
            if (string.IsNullOrWhiteSpace(AccountIdentifier))
                return string.Empty;

            var digits = new string(AccountIdentifier.Where(char.IsDigit).ToArray());
            return digits.Length >= 4
                ? digits[^4..]
                : AccountIdentifier.Trim().ToUpperInvariant();
        }
    }

    public static LedgerStatement From(TransactionExtractionUnit unit, ExtractedStatementSummary raw)
    {
        static decimal? Parse(string? value) =>
            StatementLedgerBuilder.TryParseAmount(value, out var parsed, allowWholeDollars: true) ? parsed : null;

        return new LedgerStatement
        {
            DocumentId = unit.DocumentId,
            SourceDocument = unit.SourceFileName,
            SummaryPage = raw.SummaryPage,
            AccountIdentifier = string.IsNullOrWhiteSpace(raw.AccountIdentifier) ? null : raw.AccountIdentifier.Trim(),
            PeriodStart = string.IsNullOrWhiteSpace(raw.PeriodStart) ? null : raw.PeriodStart.Trim(),
            PeriodEnd = string.IsNullOrWhiteSpace(raw.PeriodEnd) ? null : raw.PeriodEnd.Trim(),
            PurchasesLabel = string.IsNullOrWhiteSpace(raw.PurchasesLabel) ? "Purchases" : raw.PurchasesLabel.Trim(),
            Raw = raw,
            PreviousBalance = Parse(raw.PreviousBalance),
            Payments = Parse(raw.Payments),
            OtherCredits = Parse(raw.OtherCredits),
            Purchases = Parse(raw.Purchases),
            BalanceTransfers = Parse(raw.BalanceTransfers),
            CashAdvances = Parse(raw.CashAdvances),
            OtherDebits = Parse(raw.OtherDebits),
            FeesCharged = Parse(raw.FeesCharged),
            InterestCharged = Parse(raw.InterestCharged),
            NewBalance = Parse(raw.NewBalance)
        };
    }

    // Previous - payments - credits + purchases + transfers + advances + other debits + fees + interest = new.
    // Payments and credits reduce the balance whether they are printed with a minus sign or not.
    public bool? BalanceEquationHolds()
    {
        if (PreviousBalance is not decimal previous || NewBalance is not decimal next)
            return null;

        var computed = previous
            - Math.Abs(Payments ?? 0m)
            - Math.Abs(OtherCredits ?? 0m)
            + (Purchases ?? 0m)
            + (BalanceTransfers ?? 0m)
            + (CashAdvances ?? 0m)
            + (OtherDebits ?? 0m)
            + (FeesCharged ?? 0m)
            + (InterestCharged ?? 0m);
        return computed == next;
    }

    // Two summaries are the same filed statement only when the key figures are printed on both and equal.
    public bool HasSameFigures(LedgerStatement other) =>
        NewBalance is not null &&
        other.NewBalance is not null &&
        (PreviousBalance is not null || Purchases is not null) &&
        NewBalance == other.NewBalance &&
        PreviousBalance == other.PreviousBalance &&
        Purchases == other.Purchases &&
        Payments == other.Payments;
}

internal sealed record LedgerStatementResult(
    LedgerStatement Statement,
    StatementStatus Status,
    decimal ItemizedPurchases,
    decimal ItemizedCashAdvances,
    int PurchaseRowCount,
    decimal PurchasesUsed,
    bool CountsTowardTotal,
    bool? BalanceEquationHolds,
    string StatusNote);

internal sealed record LedgerRow(
    long DocumentId,
    string SourceDocument,
    int SourcePage,
    int RowOnPage,
    string? SectionHeading,
    string? TransactionDate,
    string? PostDate,
    string? ReferenceNumber,
    string Description,
    string AmountText,
    decimal Amount,
    string Category,
    int? OwnerSummaryPage);

internal sealed record LedgerMonetaryValue(
    long DocumentId,
    string SourceDocument,
    int SourcePage,
    string Label,
    string Amount);

internal sealed record StatementLedger(
    IReadOnlyList<LedgerStatementResult> Statements,
    IReadOnlyList<LedgerRow> Rows,
    IReadOnlyList<LedgerMonetaryValue> MonetaryValues,
    IReadOnlyList<LedgerRow> UnattachedRows,
    decimal TotalPurchases,
    decimal ItemizedPurchaseTotal,
    string Status,
    IReadOnlyList<string> Warnings)
{
    public bool HasExtractedValues => Statements.Count > 0 || Rows.Count > 0 || MonetaryValues.Count > 0;

    public string CalculatedSum => TotalPurchases.ToString("0.00", CultureInfo.InvariantCulture);

    private static bool Counts(LedgerStatementResult item) => item.CountsTowardTotal;

    // Rows of duplicate statement copies are shown but never counted.
    public bool IsRowCounted(LedgerRow row)
    {
        if (row.Category != StatementLedgerBuilder.CategoryPurchase)
            return false;
        var owner = OwnerOf(row);
        return owner is null || Counts(owner);
    }

    // The statement a row was attached to when the ledger was built (null for documents with no summary).
    public LedgerStatementResult? OwnerOf(LedgerRow row) =>
        row.OwnerSummaryPage is int summaryPage
            ? Statements.FirstOrDefault(item =>
                item.Statement.DocumentId == row.DocumentId && item.Statement.SummaryPage == summaryPage)
            : null;

    // Plain-text ledger: uploaded as statement-ledger.txt and appended to the evidence digest.
    public string ToLedgerText()
    {
        var builder = new StringBuilder();
        builder.AppendLine("STATEMENT LEDGER");
        builder.AppendLine("Computed in code from individually extracted rows and each statement's printed summary. The model did not add anything up.");
        builder.AppendLine();
        builder.AppendLine("COMPUTED SUMMARY");
        builder.AppendLine($"LedgerStatus: {Status}");
        builder.AppendLine($"TotalPurchases: ${CalculatedSum}");
        builder.AppendLine($"ItemizedPurchaseRowsTotal: ${ItemizedPurchaseTotal.ToString("0.00", CultureInfo.InvariantCulture)}");
        builder.AppendLine($"StatementCount: {Statements.Count(Counts)} counted, {Statements.Count(item => !Counts(item))} not counted (duplicate copies or repeated summaries)");
        builder.AppendLine($"PurchaseRowCount: {Rows.Count(IsRowCounted)}");
        builder.AppendLine("Basis: purchases only. Cash advances, balance transfers, fees, interest, payments and credits are listed but excluded.");
        builder.AppendLine();

        builder.AppendLine("STATEMENTS");
        builder.AppendLine("Source Document | Summary Page | Account | Period | Printed Purchases Line | Itemized Purchases | Purchases Used | Status | Previous Balance | Payments | Other Credits | Cash Advances | Balance Transfers | Other Debits | Fees | Interest | New Balance | Balance Check | Note");
        foreach (var item in Statements)
        {
            var s = item.Statement;
            builder.AppendLine(string.Join(" | ",
                s.SourceDocument,
                s.SummaryPage.ToString(CultureInfo.InvariantCulture),
                s.AccountIdentifier ?? "Not printed",
                s.PeriodDisplay,
                $"{s.PurchasesLabel}: {s.Raw.Purchases ?? "Not printed"}",
                StatementLedgerBuilder.FormatMoney(item.ItemizedPurchases),
                item.CountsTowardTotal ? StatementLedgerBuilder.FormatMoney(item.PurchasesUsed) : "Not counted",
                item.Status.ToString(),
                s.Raw.PreviousBalance ?? "-",
                s.Raw.Payments ?? "-",
                s.Raw.OtherCredits ?? "-",
                s.Raw.CashAdvances ?? "-",
                s.Raw.BalanceTransfers ?? "-",
                s.Raw.OtherDebits ?? "-",
                s.Raw.FeesCharged ?? "-",
                s.Raw.InterestCharged ?? "-",
                s.Raw.NewBalance ?? "-",
                item.BalanceEquationHolds switch { true => "Balances", false => "Does not balance", null => "Not checked" },
                item.StatusNote));
        }

        if (Statements.Count == 0)
            builder.AppendLine("None found.");

        builder.AppendLine();
        builder.AppendLine("TRANSACTIONS");
        builder.AppendLine("Source Document | Source Page | Row | Section | Transaction Date | Post Date | Reference | Description | Amount | Category | Counted In TotalPurchases | Statement");
        foreach (var row in Rows)
        {
            var owner = OwnerOf(row);
            builder.AppendLine(string.Join(" | ",
                row.SourceDocument,
                row.SourcePage.ToString(CultureInfo.InvariantCulture),
                row.RowOnPage.ToString(CultureInfo.InvariantCulture),
                row.SectionHeading ?? "-",
                row.TransactionDate ?? "-",
                row.PostDate ?? "-",
                row.ReferenceNumber ?? "-",
                row.Description,
                row.AmountText,
                row.Category,
                IsRowCounted(row) ? "Yes" : "No",
                owner is null ? "Not tied to a statement" : $"{owner.Statement.PeriodDisplay} (page {owner.Statement.SummaryPage})"));
        }

        if (Rows.Count == 0)
            builder.AppendLine("None found.");

        builder.AppendLine();
        builder.AppendLine("OTHER PRINTED AMOUNTS (not added to any total)");
        if (MonetaryValues.Count == 0)
        {
            builder.AppendLine("None found.");
        }
        else
        {
            builder.AppendLine("Label | Amount | Source Document | Source Page");
            foreach (var value in MonetaryValues)
                builder.AppendLine($"{value.Label} | {value.Amount} | {value.SourceDocument} | {value.SourcePage}");
        }

        builder.AppendLine();
        builder.AppendLine("WARNINGS");
        if (Warnings.Count == 0)
        {
            builder.AppendLine("None. Every statement reconciled to its printed summary.");
        }
        else
        {
            foreach (var warning in Warnings)
                builder.AppendLine($"- {warning}");
        }

        return builder.ToString().Trim();
    }

    // Markdown section appended to the final review.
    public string ToMarkdown()
    {
        static string Cell(string? value) =>
            (value ?? "-").Replace("|", "\\|").Replace("\r", " ").Replace("\n", " ");

        var builder = new StringBuilder();
        builder.AppendLine("## Transaction Summary");
        builder.AppendLine($"- Ledger status: **{Status}**");
        builder.AppendLine($"- Total purchases: **${TotalPurchases.ToString("#,##0.00", CultureInfo.InvariantCulture)}**");
        builder.AppendLine($"- Statements: {Statements.Count(Counts)} counted" +
            (Statements.Any(item => !Counts(item)) ? $", {Statements.Count(item => !Counts(item))} not counted (duplicate copies or repeated summaries)" : string.Empty));
        builder.AppendLine($"- Purchase rows counted: {Rows.Count(IsRowCounted)} (itemized total ${ItemizedPurchaseTotal.ToString("#,##0.00", CultureInfo.InvariantCulture)})");
        builder.AppendLine("- Cash advances, balance transfers, fees, interest, payments and credits are listed below but not included in total purchases.");
        builder.AppendLine();

        if (Warnings.Count > 0)
        {
            builder.AppendLine("### Needs review");
            foreach (var warning in Warnings)
                builder.AppendLine($"- {Cell(warning)}");
            builder.AppendLine();
        }

        builder.AppendLine("## Statements");
        builder.AppendLine("| Period | Printed purchases | Itemized purchases | Used | Status | Previous balance | Cash advances | Fees | Interest | New balance | Source |");
        builder.AppendLine("|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---|");
        if (Statements.Count == 0)
        {
            builder.AppendLine("| — | — | — | — | No statement summaries found | — | — | — | — | — | — |");
        }

        foreach (var item in Statements)
        {
            var s = item.Statement;
            builder.AppendLine(
                $"| {Cell(s.PeriodDisplay)} | {Cell(s.Raw.Purchases ?? "Not printed")} | {StatementLedgerBuilder.FormatMoney(item.ItemizedPurchases)} | " +
                $"{(item.CountsTowardTotal ? StatementLedgerBuilder.FormatMoney(item.PurchasesUsed) : "Not counted")} | {item.Status} | " +
                $"{Cell(s.Raw.PreviousBalance)} | {Cell(s.Raw.CashAdvances)} | {Cell(s.Raw.FeesCharged)} | {Cell(s.Raw.InterestCharged)} | {Cell(s.Raw.NewBalance)} | " +
                $"[{Cell(s.SourceDocument)}, page {s.SummaryPage}] |");
        }

        builder.AppendLine();
        builder.AppendLine("## Transactions");
        builder.AppendLine("| Date | Description | Amount | Category | Counted | Source |");
        builder.AppendLine("|---|---|---:|---|---|---|");
        if (Rows.Count == 0)
            builder.AppendLine("| — | No itemized rows found | — | — | — | — |");

        foreach (var row in Rows)
        {
            builder.AppendLine(
                $"| {Cell(row.TransactionDate ?? row.PostDate ?? "Not printed")} | {Cell(row.Description)} | {Cell(row.AmountText)} | {row.Category} | " +
                $"{(IsRowCounted(row) ? "Yes" : "No")} | [{Cell(row.SourceDocument)}, page {row.SourcePage}] |");
        }

        builder.AppendLine();
        builder.AppendLine("## Other Printed Amounts");
        builder.AppendLine("Captured as printed; not added to any total.");
        builder.AppendLine("| Label | Amount | Source |");
        builder.AppendLine("|---|---:|---|");
        if (MonetaryValues.Count == 0)
            builder.AppendLine("| — | — | None found |");

        foreach (var value in MonetaryValues)
            builder.AppendLine($"| {Cell(value.Label)} | {Cell(value.Amount)} | [{Cell(value.SourceDocument)}, page {value.SourcePage}] |");

        return builder.ToString().Trim();
    }
}

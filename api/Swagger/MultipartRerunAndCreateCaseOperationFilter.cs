//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace api.Swagger;

public sealed class MultipartRerunAndCreateCaseOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var relativePath = context.ApiDescription.RelativePath ?? string.Empty;

        if (!string.Equals(context.ApiDescription.HttpMethod, HttpMethod.Post.Method, StringComparison.OrdinalIgnoreCase))
            return;

        if (relativePath.EndsWith("/rerun-review", StringComparison.OrdinalIgnoreCase))
        {
            operation.RequestBody = BuildRequestBody(
                requiredFields: ["PromptConfigurationId"],
                properties: new Dictionary<string, OpenApiSchema>
                {
                    ["PromptConfigurationId"] = new()
                    {
                        Type = "integer",
                        Format = "int64",
                        Description = "Prompt configuration id to run. Add more document entries by duplicating the Documents[n] fields and increasing n."
                    },
                    ["Documents"] = new()
                    {
                        Type = "array",
                        Description = "Add one entry per existing or new document. Each item can carry either a DocumentId or a file upload plus SubmittedBy and TransactionEvidence.",
                        Items = new OpenApiSchema
                        {
                            Type = "object",
                            Properties = new Dictionary<string, OpenApiSchema>
                            {
                                ["DocumentId"] = new()
                                {
                                    Type = "integer",
                                    Format = "int64",
                                    Description = "Existing document id for this rerun item."
                                },
                                ["Document"] = new()
                                {
                                    Type = "string",
                                    Format = "binary",
                                    Description = "Uploaded file for this rerun item."
                                },
                                ["SubmittedBy"] = new()
                                {
                                    Type = "string",
                                    Description = "Submitted by code for this rerun item."
                                },
                                ["TransactionEvidence"] = new()
                                {
                                    Type = "boolean",
                                    Description = "Whether this rerun item is transaction evidence."
                                }
                            }
                        }
                    }
                },
                example: new OpenApiObject
                {
                    ["PromptConfigurationId"] = new OpenApiInteger(123),
                    ["Documents"] = new OpenApiArray
                    {
                        new OpenApiObject
                        {
                            ["DocumentId"] = new OpenApiLong(1001),
                            ["SubmittedBy"] = new OpenApiString("D"),
                            ["TransactionEvidence"] = new OpenApiBoolean(true)
                        },
                        new OpenApiObject
                        {
                            ["Document"] = new OpenApiString("<file>"),
                            ["SubmittedBy"] = new OpenApiString("P"),
                            ["TransactionEvidence"] = new OpenApiBoolean(false)
                        }
                    }
                });

            return;
        }

        if (relativePath.Equals("api/v1/run-review", StringComparison.OrdinalIgnoreCase))
        {
            operation.RequestBody = BuildRequestBody(
                requiredFields: ["CaseNumber", "CaseName", "FilingDate"],
                properties: new Dictionary<string, OpenApiSchema>
                {
                    ["CaseNumber"] = new()
                    {
                        Type = "string",
                        Description = "Case number."
                    },
                    ["CaseName"] = new()
                    {
                        Type = "string",
                        Description = "Case name."
                    },
                    ["FilingDate"] = new()
                    {
                        Type = "string",
                        Format = "date",
                        Description = "Filing date in YYYY-MM-DD format."
                    },
                    ["Documents"] = new()
                    {
                        Type = "array",
                        Description = "Add one row per uploaded document. Each item includes the file and its SubmittedBy and TransactionEvidence values.",
                        Items = new OpenApiSchema
                        {
                            Type = "object",
                            Properties = new Dictionary<string, OpenApiSchema>
                            {
                                ["Document"] = new()
                                {
                                    Type = "string",
                                    Format = "binary",
                                    Description = "Uploaded file for this document entry."
                                },
                                ["SubmittedBy"] = new()
                                {
                                    Type = "string",
                                    Description = "Submitted by code for this document entry."
                                },
                                ["TransactionEvidence"] = new()
                                {
                                    Type = "boolean",
                                    Description = "Whether this document entry is transaction evidence."
                                }
                            }
                        }
                    }
                },
                example: new OpenApiObject
                {
                    ["CaseNumber"] = new OpenApiString("12345"),
                    ["CaseName"] = new OpenApiString("Example Case"),
                    ["FilingDate"] = new OpenApiString("2026-09-02"),
                    ["Documents"] = new OpenApiArray
                    {
                        new OpenApiObject
                        {
                            ["Document"] = new OpenApiString("<file>"),
                            ["SubmittedBy"] = new OpenApiString("P"),
                            ["TransactionEvidence"] = new OpenApiBoolean(false)
                        },
                        new OpenApiObject
                        {
                            ["Document"] = new OpenApiString("<file>"),
                            ["SubmittedBy"] = new OpenApiString("D"),
                            ["TransactionEvidence"] = new OpenApiBoolean(true)
                        }
                    }
                });
        }
    }

    private static OpenApiRequestBody BuildRequestBody(
        IReadOnlyCollection<string> requiredFields,
        IDictionary<string, OpenApiSchema> properties,
        IOpenApiAny? example = null)
    {
        return new OpenApiRequestBody
        {
            Required = true,
            Content =
            {
                ["multipart/form-data"] = new OpenApiMediaType
                {
                    Schema = new OpenApiSchema
                    {
                        Type = "object",
                        Required = requiredFields.ToHashSet(),
                        Properties = properties
                    },
                    Example = example
                }
            }
        };
    }
}

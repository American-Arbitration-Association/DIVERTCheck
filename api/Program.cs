//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
using api.Data;
using api.Models;
using api.Services;
using api.Services.Interfaces;
using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using NLog.Web;
using OpenTelemetry.Trace;
using System.Reflection;
using System.Text;
using api.Swagger;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Host.UseNLog();

const long MaximumUploadSizeBytes = 500L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(options =>
    options.Limits.MaxRequestBodySize = MaximumUploadSizeBytes);
builder.Services.Configure<FormOptions>(options =>
    options.MultipartBodyLengthLimit = MaximumUploadSizeBytes);

const string FrontendCorsPolicy = "Frontend";

DivertCheckDbContext.DatabaseSchema =
    builder.Configuration["Database:Schema"]?.Trim()
    ?? "your_db_schema";

var credential = new DefaultAzureCredential(new DefaultAzureCredentialOptions
{
    ExcludeManagedIdentityCredential = false
});

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>();

if ((allowedOrigins == null || allowedOrigins.Length == 0) && builder.Environment.IsDevelopment())
{
    allowedOrigins =
    [
        "http://localhost:5174",
        "https://localhost:5174"
    ];
}

if (allowedOrigins == null || allowedOrigins.Length == 0)
{
    throw new InvalidOperationException(
        "CORS origins were not found at 'Cors:AllowedOrigins'.");
}

builder.Services.AddControllers();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var jwtKey = builder.Configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey))
        {
            if (!builder.Environment.IsDevelopment())
            {
                throw new InvalidOperationException("Jwt:Key is not configured.");
            }

            jwtKey = "local-development-authentication-key-change-before-deploy";
            builder.Configuration["Jwt:Key"] = jwtKey;
        }

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "divertCheck-api",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "divertCheck-client",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromMinutes(2)
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCorsPolicy, policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddHealthChecks();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Case API",
        Version = "v1"
    });

    var jwtSecurityScheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Description = "Enter a bearer token. Example: Bearer eyJhbGciOi...",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Reference = new OpenApiReference
        {
            Type = ReferenceType.SecurityScheme,
            Id = JwtBearerDefaults.AuthenticationScheme
        }
    };

    options.AddSecurityDefinition(JwtBearerDefaults.AuthenticationScheme, jwtSecurityScheme);
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [jwtSecurityScheme] = []
    });

    var xmlFilename = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFilename);
    if (File.Exists(xmlPath))
    {
        options.IncludeXmlComments(xmlPath);
    }

    options.OperationFilter<MultipartRerunAndCreateCaseOperationFilter>();
});

var keyVaultUri = builder.Configuration["AzureKeyVault"];
if (string.IsNullOrWhiteSpace(keyVaultUri))
{
    throw new InvalidOperationException("AzureKeyVault was not found.");
}

try
{
    builder.Configuration.AddAzureKeyVault(
        new Uri(keyVaultUri),
        credential);
}
catch (Azure.Identity.CredentialUnavailableException ex)
{
    throw new InvalidOperationException(
        $"Azure Key Vault credential unavailable for '{keyVaultUri}'. Run 'az login' or set AZURE_CLIENT_ID/AZURE_TENANT_ID/AZURE_CLIENT_SECRET.",
        ex);
}
catch (Exception ex)
{
    throw new InvalidOperationException(
        $"Failed to load Azure Key Vault configuration from '{keyVaultUri}'.",
        ex);
}

// Key Vault is added after appsettings files and normally takes precedence.
// For a local Development tracing check, let only a non-placeholder local
// Application Insights connection string override the Key Vault value.
if (builder.Environment.IsDevelopment())
{
    var localDevelopmentSettings = new ConfigurationBuilder()
        .SetBasePath(builder.Environment.ContentRootPath)
        .AddJsonFile("appsettings.Development.json", optional: true)
        .Build();
    var localAzureMonitorConnectionString = localDevelopmentSettings["AzureMonitor:ConnectionString"];

    if (!string.IsNullOrWhiteSpace(localAzureMonitorConnectionString) &&
        !localAzureMonitorConnectionString.StartsWith("PASTE_", StringComparison.Ordinal))
    {
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AzureMonitor:ConnectionString"] = localAzureMonitorConnectionString
        });
    }
}

builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));

// Azure Monitor exports ASP.NET Core, HttpClient, and our custom AI spans to the
// Application Insights resource connected to the Foundry project.
builder.Services.AddOpenTelemetry()
    .UseAzureMonitor(options =>
    {
        options.ConnectionString = builder.Configuration["AzureMonitor:ConnectionString"];
        options.SamplingRatio = builder.Configuration.GetValue<float?>("AzureMonitor:SamplingRatio") ?? 1.0F;
    });
builder.Services.ConfigureOpenTelemetryTracerProvider((_, tracing) =>
    tracing.AddSource(OpenAiExecutionService.ActivitySourceName));

var dbConnectionString = builder.Configuration["ConnectionStrings:DivertCheck:Connection"];
if (string.IsNullOrWhiteSpace(dbConnectionString))
{
    throw new InvalidOperationException(
        "Database connection string was not found. Ensure Azure Key Vault has a non-empty secret named 'ConnectionStrings--DivertCheck--Connection'.");
}

builder.Services.AddDbContext<DivertCheckDbContext>(options =>
    options.UseNpgsql(dbConnectionString));
builder.Services.AddHttpContextAccessor();

var blobConnectionString = builder.Configuration["AzureStorage:StorageConnectionString-DivertCheck"];
if (string.IsNullOrWhiteSpace(blobConnectionString))
{
    throw new InvalidOperationException(
        "Azure blob connection string was not found at 'AzureStorage:StorageConnectionString-DivertCheck'.");
}

builder.Services.AddSingleton(new BlobServiceClient(blobConnectionString));
builder.Services.AddHttpClient("OpenAI_LongRunning", client =>
{
    client.Timeout = TimeSpan.FromMinutes(30);
});

builder.Services.AddScoped<ICaseRepository, CaseRepository>();
builder.Services.AddScoped<IDocumentRepository, DocumentRepository>();
builder.Services.AddScoped<ICaseService, CaseService>();
builder.Services.AddScoped<IDocumentService, DocumentService>();
builder.Services.AddScoped<IBlobStorageService, BlobStorageService>();
builder.Services.AddScoped<IAiJobService, AiJobService>();
builder.Services.AddSingleton<IAiCancellationService, AiCancellationService>();
builder.Services.AddScoped<IAiExecutionService, OpenAiExecutionService>();
builder.Services.AddScoped<IPromptVisionExtractionService, PromptVisionExtractionService>();
builder.Services.AddScoped<IPromptConfigurationService, PromptConfigurationService>();
builder.Services.AddScoped<IAiSuggestedPromptResponseService, AiSuggestedPromptResponseService>();
builder.Services.AddScoped<IReviewService, ReviewService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserAuditService, UserAuditService>();
builder.Services.AddScoped<ITokenService, JwtTokenService>();
builder.Services.AddSingleton<IPasswordResetCodeService, PasswordResetCodeService>();
builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.AddHostedService<AiJobQueueHostedService>();
builder.Services.Configure<HostOptions>(options =>
{
    options.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.Ignore;
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.UseCors(FrontendCorsPolicy);
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health").AllowAnonymous();

app.MapControllers();


app.Run();

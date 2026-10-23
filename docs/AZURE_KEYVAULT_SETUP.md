# DIVERTCheck - Azure Key Vault Setup for .NET App

This document is a checklist for connecting the DIVERTCheck ASP.NET Core API to Azure Key Vault.

Use it when you need to:

- Point the API at a Key Vault.
- Give a developer local Key Vault access.
- Give an Azure App Service access to Key Vault.
- Add or verify the secrets used by the API.

Replace placeholder values such as `your-keyvault-name`, `YOUR_RESOURCE_GROUP`, `YOUR_SUBSCRIPTION_NAME_OR_ID`, and `YOUR_TENANT_ID` with values for the target environment.

For the wider first-run setup (database, Azure AI Foundry, frontend environment variables), see [SETUP.md](SETUP.md).

## Linked Index

### Setup Flow

- [1. Choose the Key Vault](#1-choose-the-key-vault)
- [2. Local Development Login](#2-local-development-login)
- [3. Create or Configure the Key Vault](#3-create-or-configure-the-key-vault)
- [4. Configure Key Vault Access](#4-configure-key-vault-access)
- [5. Add Secrets](#5-add-secrets)
- [6. Configure appsettings](#6-configure-appsettings)
- [7. Required NuGet Packages](#7-required-nuget-packages)

### Reference

- [8. Current Program.cs Behavior](#8-current-programcs-behavior)
- [9. Validation Checklist](#9-validation-checklist)
- [10. Common Errors and Fixes](#10-common-errors-and-fixes)
- [11. Optional Azure CLI Commands](#11-optional-azure-cli-commands)
- [12. Microsoft References](#12-microsoft-references)

## 1. Choose the Key Vault

Do not hard-code an example vault name unless it is the real vault for the environment.

Use this pattern:

```text
Vault name: your-keyvault-name
Vault URI:  https://your-keyvault-name.vault.azure.net/
```

The vault URI lives under the top-level `AzureKeyVault` key, and each environment file points at its own vault:

```json
"AzureKeyVault": "https://your-keyvault-name.vault.azure.net/"
```

| File | Vault |
| --- | --- |
| [api/appsettings.json](../api/appsettings.json) | Production |
| [api/appsettings.Development.json](../api/appsettings.Development.json) | Development |
| [api/appsettings.Staging.json](../api/appsettings.Staging.json) | UAT / staging |

## 2. Local Development Login

For local development, run `az login` before starting the API.

`Program.cs` uses `DefaultAzureCredential` with managed identity excluded, so locally it falls through to whichever developer credential is available — Azure CLI, Azure PowerShell, Visual Studio, or a service principal supplied through the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_CLIENT_SECRET` environment variables. `az login` is the expected path.

```powershell
az login
```

Confirm the active account and subscription:

```powershell
az account show
```

If needed, set the correct subscription:

```powershell
az account set --subscription "YOUR_SUBSCRIPTION_NAME_OR_ID"
```

Then run the API:

```powershell
dotnet run --project api/DIVERTCheck.csproj
```

## 3. Create or Configure the Key Vault

Use Azure Portal to create a new Key Vault or verify an existing one.

| Step | Action |
| --- | --- |
| Create or open the vault | Go to `Azure Portal > Key vaults > Create`, or open the existing vault. |
| Basics | Choose the correct subscription, resource group, region, and Key Vault name. |
| Access configuration | Use Azure RBAC unless the team standard requires vault access policies. |
| Protection | Keep soft delete enabled. Purge protection is recommended for shared environments. |
| Networking | Use public access only if allowed. For locked-down environments, coordinate private endpoint or trusted service settings with infrastructure/security. |
| Create | Review and create the vault. |

## 4. Configure Key Vault Access

The API must be able to read secret values from Key Vault.

Assign these roles at the Key Vault scope:

| Principal | Used for | Roles |
| --- | --- | --- |
| Developer Azure account | Local development after `az login` | `Key Vault Reader`, `Key Vault Secrets User` |
| App Service managed identity | Deployed Azure App Service | `Key Vault Reader`, `Key Vault Secrets User` |

### Local Developer Access

Use this flow when a developer runs the API locally after `az login`.

In Azure Portal, open:

```text
Key Vault > Access control (IAM) > Add role assignment
```

1. Select `Key Vault Secrets User`.
2. Select `User, group, or service principal`.
3. Search for the developer's company email.
4. Review and assign.
5. Repeat for `Key Vault Reader`.

### Deployed App Service Access

Use this flow when the deployed Azure App Service needs to read secrets from Key Vault.

First, turn on the App Service identity:

1. Open the App Service in Azure Portal.
2. Go to `Identity`.
3. Turn `System assigned` managed identity on.
4. Save the change.

Then grant that identity access to Key Vault:

```text
Key Vault > Access control (IAM) > Add role assignment
```

1. Select `Key Vault Secrets User`.
2. Select `Managed identity`.
3. Choose `App Service`.
4. Select the target App Service name.
5. Review and assign.
6. Repeat for `Key Vault Reader`.
7. Restart the App Service.

Managed identity lets the deployed API authenticate to Key Vault without storing credentials in `appsettings.json`, environment variables, or code.

Important: `Program.cs` currently sets `ExcludeManagedIdentityCredential = true`. For App Service managed identity to work in Azure, that value must be `false` for deployed environments.

## 5. Add Secrets

ASP.NET Core configuration keys use colons, such as `AzureOpenAI:ApiKeyDivertCheck`.

Azure Key Vault secret names cannot use colons. Use double hyphens instead. The Key Vault configuration provider maps `--` back to `:` when secrets are loaded.

```text
AzureOpenAI:ApiKeyDivertCheck -> AzureOpenAI--ApiKeyDivertCheck
```

These are the secrets DIVERTCheck reads:

| Key Vault secret name | Configuration key | Value to store |
| --- | --- | --- |
| `ConnectionStrings--DivertCheck--Connection` | `ConnectionStrings:DivertCheck:Connection` | PostgreSQL connection string. Startup throws without it. |
| `AzureStorage--StorageConnectionString-DivertCheck` | `AzureStorage:StorageConnectionString-DivertCheck` | Blob Storage connection string for uploaded documents. Startup throws without it. |
| `AzureOpenAI--ApiKeyDivertCheck` | `AzureOpenAI:ApiKeyDivertCheck` | Azure OpenAI / AI Foundry API key |
| `Smtp--Password` | `Smtp:Password` | SMTP password for outbound mail via `` |
| `AzureMonitor--ConnectionString` | `AzureMonitor:ConnectionString` | Application Insights / Azure Monitor connection string |

The PostgreSQL connection string value should look like this:

```text
Host=YOUR_PG_HOST;Database=your_database_name;Username=YOUR_PG_USER;Password=YOUR_PG_PASSWORD;SSL Mode=Require;Trust Server Certificate=true
```

If a secret name does not resolve, list the vault and confirm the exact spelling rather than guessing:

```powershell
az keyvault secret list --vault-name your-keyvault-name --query "[].name" -o tsv
```

Do not commit real connection strings, usernames, passwords, or API keys.

## 6. Configure appsettings

Keep the vault URI and non-secret defaults in `appsettings.json`, `appsettings.Development.json`, `appsettings.Staging.json`, or environment-specific app settings.

Leave actual secret values blank when they are stored in Key Vault. Key Vault is added after the JSON files, so its values take precedence at startup.

```json
{
  "AzureKeyVault": "https://your-keyvault-name.vault.azure.net/",
  "Database": {
    "Schema": "your_db_schema",
    "CommandTimeoutSeconds": 30
  },
  "ConnectionStrings": {
    "DivertCheck": {
      "Connection": ""
    }
  },
  "AzureStorage": {
    "StorageConnectionString-DivertCheck": "",
    "ContainerName": "your_container_name"
  },
  "Smtp": {
    "Username": "",
    "Password": "",
    "Host": "",
    "Port": 25,
    "EnableSsl": true
  },
  "AzureOpenAI": {
    "ApiKeyDivertCheck": "",
    "DefaultModelName": "your_model_name",
    "ResponsesEndpoint": "https://YOUR_AZURE_OPENAI_RESOURCE.openai.azure.com/openai/v1/responses"
  },
  "AzureMonitor": {
    "ConnectionString": "",
    "SamplingRatio": 1.0,
    "TraceOpenAIPayloads": false,
    "TracePayloadMaxChars": 8000
  }
}
```

Recommended approach:

- Put non-secret machine-specific values in `appsettings.Development.json`.
- Put shared secrets in Azure Key Vault.
- Keep `appsettings.json` safe for shared defaults.

## 7. Required NuGet Packages

These packages should already be in [api/DIVERTCheck.csproj](../api/DIVERTCheck.csproj):

```powershell
dotnet add package Azure.Extensions.AspNetCore.Configuration.Secrets
dotnet add package Azure.Identity
dotnet add package Azure.Security.KeyVault.Secrets
```

## 8. Current Program.cs Behavior

The API builds the credential near the top of [api/Program.cs](../api/Program.cs) and adds Key Vault before it reads the database connection string, blob storage connection string, SMTP options, Azure OpenAI settings, and Azure Monitor settings.

Current authentication behavior:

```csharp
var credential = new DefaultAzureCredential(new DefaultAzureCredentialOptions
{
    ExcludeManagedIdentityCredential = true //Local-only behavior. Set to false for App Service.
});
```

Only managed identity is excluded, so locally the credential chain falls through to Azure CLI and the other developer credentials. This is why local development depends on `az login`.

For Azure App Service managed identity, update the deployed configuration/code path so `ExcludeManagedIdentityCredential` is `false`.

Startup fails fast if configuration is missing:

| Missing value | Startup error |
| --- | --- |
| `AzureKeyVault` | `AzureKeyVault was not found.` |
| `ConnectionStrings:DivertCheck:Connection` | `Database connection string was not found.` |
| `AzureStorage:StorageConnectionString-DivertCheck` | `Azure blob connection string was not found...` |

In Development only, a non-empty `AzureMonitor:ConnectionString` in `appsettings.Development.json` is re-applied over the Key Vault value so local traces can be pointed elsewhere.

## 9. Validation Checklist

- `AzureKeyVault` points to the correct vault URI for the environment.
- The active Azure account is in the correct tenant and subscription.
- The developer has Key Vault secret read access.
- `az login` has been run locally.
- Secret names use `--` for nested configuration sections.
- Key Vault is added in `Program.cs` before the API reads secret-backed settings.
- The App Service managed identity is enabled for deployed environments.
- The App Service managed identity has Key Vault access.
- `ExcludeManagedIdentityCredential` is not blocking deployed managed identity authentication.

## 10. Common Errors and Fixes

| Error or symptom | Likely fix |
| --- | --- |
| `403 Forbidden` | The signed-in user or managed identity does not have Key Vault secret read access. |
| Secret value is `null` | The secret name does not match the .NET configuration key. Use `--` instead of `:` in Key Vault. |
| `DefaultAzureCredential` failed locally | Run `az login`, check `az account show`, and confirm the subscription. |
| Works locally but fails in Azure | Managed identity may be disabled, excluded in code, or missing Key Vault roles. |
| `Database connection string was not found` | Create or fill `ConnectionStrings--DivertCheck--Connection` in Key Vault. |
| `Azure blob connection string was not found` | Create or fill `AzureStorage--StorageConnectionString-DivertCheck` in Key Vault. |
| `AzureKeyVault was not found` | The vault URI is missing from the environment's appsettings file. |
| AI reviews fail with an auth error | `AzureOpenAI--ApiKeyDivertCheck` is missing, empty, or rotated. Restart the API after updating it. |

## 11. Optional Azure CLI Commands

These commands are optional if you prefer Azure CLI instead of Azure Portal.

Login and select subscription:

```powershell
az login --tenant YOUR_TENANT_ID
az account set --subscription "YOUR_SUBSCRIPTION_NAME_OR_ID"
```

Create a Key Vault:

```powershell
az keyvault create `
  --name your-keyvault-name `
  --resource-group YOUR_RESOURCE_GROUP `
  --location YOUR_LOCATION `
  --enable-rbac-authorization true
```

Add a secret:

```powershell
az keyvault secret set `
  --vault-name your-keyvault-name `
  --name AzureOpenAI--ApiKeyDivertCheck `
  --value "YOUR_AZURE_OPENAI_KEY"
```

Add the PostgreSQL connection string secret:

```powershell
az keyvault secret set `
  --vault-name your-keyvault-name `
  --name ConnectionStrings--DivertCheck--Connection `
  --value "Host=YOUR_PG_HOST;Database=your_database_name;Username=YOUR_PG_USER;Password=YOUR_PG_PASSWORD;SSL Mode=Require;Trust Server Certificate=true"
```

## 12. Microsoft References

- ASP.NET Core Azure Key Vault configuration provider: https://learn.microsoft.com/en-us/aspnet/core/security/key-vault-configuration
- Azure Key Vault configuration provider package guidance: https://learn.microsoft.com/en-us/dotnet/api/overview/azure/extensions.aspnetcore.configuration.secrets-readme
- Azure Key Vault RBAC guidance: https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide

# DIVERTCheck - Setup

How to get DIVERTCheck running on a new machine. See the [README](../README.md) for what the app does and the day-to-day commands, and [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

For server deployment notes, see [HOSTING.md](HOSTING.md).

## Setup flow

1. Install the required tools: .NET SDK, Node.js, Azure CLI, and PostgreSQL access.
2. Sign in to Azure and confirm Key Vault access.
3. Confirm Azure AI Foundry has the required model and API key.
4. Confirm database and Blob Storage secrets exist in Key Vault.
5. Run the API, then run the frontend.
6. Use Swagger login and **Authorize** to test protected API endpoints.

- [Prerequisites](#prerequisites)
- [Azure access](#azure-access)
- [Azure AI Foundry setup](#azure-ai-foundry-setup)
- [Configuration files](#configuration-files)
- [Azure Key Vault values](#azure-key-vault-values)
- [Frontend environment variables](#frontend-environment-variables)
- [Ports and origins](#ports-and-origins)
- [Swagger authorization](#swagger-authorization)
- [Database](#database)
- [First run](#first-run)
- [Troubleshooting](#troubleshooting)

## Prerequisites

| Tool | Notes |
| --- | --- |
| .NET 10 SDK | Builds and runs [api/DIVERTCheck.csproj](../api/DIVERTCheck.csproj) |
| Node.js + npm | Vite 7 / React 19 frontend |
| Azure CLI | Used for local Key Vault authentication |
| PostgreSQL access | Existing database; the app does not create one |

You do not need Docker, and there is no local message broker — the AI job queue is a table in PostgreSQL.

## Azure access

The API loads its secrets from Azure Key Vault at startup using `DefaultAzureCredential`, so **the app will not start until you can authenticate to Azure.** Locally that means signing in with the Azure CLI:

```powershell
az login
az account set --subscription "<subscription name or id>"
```

Ask the team to grant your account **Get** and **List** secret permissions on the development vault:

- Development: `https://your-dev-azure-resource.vault.azure.net/`
- Staging: `https://your-staging-azure-resource.vault.azure.net/`

As an alternative to `az login`, `DefaultAzureCredential` also accepts a service principal through the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_CLIENT_SECRET` environment variables. Deployed environments use managed identity.

## Azure AI Foundry setup

The AI review flow calls Azure OpenAI through the Azure AI Foundry resource.

`Note: The database stores the prompt configuration and model name, but it does **not** create or deploy the model. The model must also be available in the Azure AI Foundry resource, or AI review jobs will fail even when the model name already exists in the database.`

### Add or verify the model

1. Open Azure AI Foundry for the environment you are configuring.
2. Go to the Foundry resource used by this app.
3. Open the Model catalog or deployments area.
4. Add/run the required model from the catalog if it is not already available.
5. Confirm the model or deployment name matches the value used by the app:
   - `AzureOpenAI:DefaultModelName` in [api/appsettings.json](../api/appsettings.json), or
   - the active prompt configuration's `AiModelName` value in the database.

If the app says a model is configured but Azure returns a model/deployment not found error, check Foundry first. Updating the database only changes which model name the app requests; it does not make that model available in Azure.

### Get the API key

1. In Azure, open the AI Foundry, resource for this environment.
2. Find **Keys and Endpoint**.
3. Copy one API key.
4. Store it in Key Vault as:

| Secret name | Configuration key |
| --- | --- |
| `AzureOpenAI--ApiKeyDivertCheck` | `AzureOpenAI:ApiKeyDivertCheck` |

After adding or rotating the API key, restart the API so configuration is reloaded from Key Vault.

### Connecting Application Insights to Foundry tracing

Azure AI Foundry does not automatically know which Application Insights resource should receive or display traces for this project. Connect it once in Foundry, then use the same Application Insights connection string in the API configuration.

1. Open the Azure AI Foundry project for the environment.
2. Open **Tracing** from the left menu.
3. If Foundry says tracing is not connected, select **Manage connections**.
4. Add or choose an **Application Insights** connection.
5. Select the Application Insights resource that should store this app's traces.
6. Save the connection and return to **Tracing**.
7. In the Azure portal, open the same Application Insights resource and copy its **Connection String**.
8. Store that value in Key Vault as `AzureMonitor--ConnectionString`, which maps to `AzureMonitor:ConnectionString`.
9. Restart the API so it reloads the connection string from Key Vault.
10. Run an AI review. The API exports spans to Application Insights, and Foundry can show those traces through the connected resource.

If Foundry is connected but no traces appear, confirm `AzureMonitor:ConnectionString` points to the same Application Insights resource selected in **Manage connections**, then check Application Insights **Logs** for recent rows in `dependencies` and `traces`.


## Configuration files

| File | Purpose |
| --- | --- |
| [api/appsettings.json](../api/appsettings.json) | Prod CORS origins, schema `your_db_schema`, prod Key Vault URI, token limits, document chunking, job timeouts, JWT issuer/audience, NLog file targets|
| [api/appsettings.Development.json](../api/appsettings.Development.json) | Dev CORS origins, schema `your_db_schema`, dev Key Vault URI, token limits, document chunking, job timeouts, JWT issuer/audience, NLog file targets|
| [api/appsettings.Staging.json](../api/appsettings.Staging.json) | UAT  CORS origins, schema `your_db_schema`, UAT Key Vault URI, token limits, document chunking, job timeouts, JWT issuer/audience, NLog file targets |
| [frontend/.env.development](../frontend/.env.development) | Dev API base URL |
| [frontend/.env.staging](../frontend/.env.staging) | UAT API base URL |

Secret-valued keys are committed as empty strings on purpose. Leave them empty — Key Vault supplies the real values at startup and takes precedence over the JSON files.

Settings worth knowing about when you first look at `appsettings.json`:

- `Database:Schema` — the PostgreSQL schema the EF Core context targets (`your_dev_db_schema` locally, `your_uat_db_schema` in staging).
- `AzureOpenAI:DefaultModelName` and the `*MaxOutputTokens` keys — model and output budgets per AI operation.
- `DocumentProcessing:*` — chunk size, overlap, and how many vision/evidence calls run in parallel.
- `AiJobProcessing:JobTimeoutSeconds` — how long a queued review may run before it is failed.

## Azure Key Vault values

Key Vault secret names map to configuration keys by replacing `--` with `:`. The API needs these secrets present and non-empty:

| Secret name | Configuration key | Used for |
| --- | --- | --- |
| `ConnectionStrings--DivertCheck--Connection` | `ConnectionStrings:DivertCheck:Connection` | PostgreSQL connection (startup fails without it) |
| `AzureStorage--StorageConnectionString-DivertCheck` | `AzureStorage:StorageConnectionString-DivertCheck` | Blob Storage for uploaded documents (startup fails without it) |
| `AzureOpenAI--ApiKeyDivertCheck` | `AzureOpenAI:ApiKeyDivertCheck` | Azure OpenAI / Foundry calls |
| `Smtp--Password` | `Smtp:Password` | Outbound mail via `your_org_email` |
| `AzureMonitor--ConnectionString` | `AzureMonitor:ConnectionString` | Application Insights on Azure Foundry |

If a secret name above does not resolve, list the vault to confirm the exact spelling rather than guessing:

```powershell
az keyvault secret list --vault-name your-aze-keyvault-name --query "[].name" -o tsv
```

Never commit real values for any of these, or for local publish profiles.

## Frontend environment variables

The frontend reads one variable, resolved by Vite mode:

| Variable | Mode | Value |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `development` (`npm run dev`) | `http://your_dev_api_url/api/v1` |
| `VITE_API_BASE_URL` | `staging` (`npm run dev:uat`) | `https://your_uat_api_url/api/v1` |

`frontend/.env.production` exists but is empty; production builds get the value from the deployment pipeline.

To point the dev frontend at the API running on your own machine, set it to `http://localhost:5175/api/v1` in a local, uncommitted `.env.local`.

## Ports and origins

| Service | URL |
| --- | --- |
| API (HTTP) | `http://localhost:5175` |
| API (HTTPS) | `https://localhost:7273` |
| Swagger | `http://localhost:5175/swagger` |
| Frontend | `http://localhost:5174/login` |

The API only accepts browser calls from origins listed under `Cors:AllowedOrigins`. Development already includes `http://localhost:5174` and `https://localhost:5174`; if you serve the frontend from a different port, add that origin to [api/appsettings.Development.json](../api/appsettings.Development.json).

## Swagger authorization

Swagger is available at `http://localhost:5175/swagger` after the API starts. Most endpoints require a JWT bearer token, so sign in once and add that token to Swagger's top **Authorize** dialog before trying protected routes.

1. Open `http://localhost:5175/swagger`.
2. Expand `POST /api/v1/Auth/login`.
3. Select **Try it out** and enter your email and password:

```json
{
  "email": "you@example.com",
  "password": "your-password"
}
```

4. Select **Execute**.
5. Copy the `accessToken` value from the `200` response body.
6. Select **Authorize** at the top of the Swagger page.
7. Paste the token in this format:

```text
Bearer <accessToken>
```

8. Select **Authorize**, then **Close**. Swagger now sends the token with protected API calls until you clear it or refresh the page.

If a protected endpoint still returns `401`, sign in again and replace the token; JWTs can expire, and role changes require signing in again.

## Database

The project is database-first: there is no EF Core migrations folder, and the app does not create or update the schema. Add your connection string in the Azure Keyvault (if setup) or add the value in `ConnectionStrings:DivertCheck:Connection`. Make sure to comment out the KeyVault access code in Program.cs.

### Steps to Set up the Database -
- Run the MAIN_SCRIPT.sql from [Main Schema Script](/api/SQLScripts/MAIN_SCHEMA.sql)
 to Create Schema, Tables, Functions, Triggers, Contraints.
- Make sure to update the Database and Schema as per your system while running the above.
- Run the Scaffold command - if you alter anything - example column/constraint/keys. The scaffold command should update the DbContext file under `/Models`
- Finally - run the INSERT scripts to add the Code Values, Code Types, the static Prompts (Vision, Eligibility Prompt generation, Summary Prompt Generation, Transaction Extraction), sample Eligibility Prompt and Summary Prompts and finally the Prompt Configuration for model input to get started. The sample prompts can be edited and saved as new versions on the Prompts screen.

Here is the command:
```
dotnet ef dbcontext scaffold "Host=your_host_name;Database=your_db_name;Username=your_db_username;Password=<password>;SSL Mode=Require;Trust Server Certificate=true" Npgsql.EntityFrameworkCore.PostgreSQL --context DivertCheckDbContext --context-dir Models --output-dir Models --schema your_schema_name --force --no-onconfiguring
```
Note (only if you run the Scaffold Command): 
1. Add this first line in the "Partial Class DivertCheckDbContext" -

```
public static string DatabaseSchema { get; set; } = "your_default_schema_name";
```

2. Make sure to Remove the individual Schema mentioned for each table and add this right at the top of the function - OnModelCreating(). 
(Easier to maintain)

```
        modelBuilder.HasPostgresExtension("citext");
        var schema = DatabaseSchema?.Trim();

        if (!string.IsNullOrWhiteSpace(schema))
        {
            modelBuilder.HasDefaultSchema(schema);
        }

```
- This takes the schema name from the appsettings for the particular environment.

### System prompts live in the database

Four prompts are seeded by `INSERT.sql` and have **no screen in the application**: Vision extraction, Transaction extraction, Eligibility prompt generation, and Summary prompt generation. They are edited directly in the `prompt` table. Only the case-review Eligibility Prompt and Summary Prompts are managed through the UI.

Each one is resolved at run time by **most recently modified wins** — there is no "current" flag on three of the four:

| Prompt | `prompt_type` | Resolved from | Newest by |
| --- | --- | --- | --- |
| Vision extraction | `Vision` | `prompt_configuration` joined to `prompt` | `prompt_configuration.modified_dttm`, then `prompt_version` |
| Transaction extraction | `Transaction` | `prompt` only — no configuration row is read | `prompt.modified_dttm` |
| Eligibility / Summary prompt generation | `Suggested` | `prompt_configuration` joined to `prompt` | `prompt.modified_dttm` |
| Case review | `Eligibility` | `prompt_configuration` | `current_prompt = true`, then `modified_dttm` |

A row is only considered if `is_record_active = true` on both the prompt and its configuration, and the relevant text column is non-empty. `prompt_type` is matched case-sensitively, exactly as spelled above.

**Insert a new row rather than editing one in place.** Updating text on an existing row rewrites history: past reviews then point at a prompt whose wording has silently changed, and there is no way to tell what the model was actually given. Add a new row, leave the old one active, and let the timestamp promote it.

This matters most for Vision. Extractions are cached in `document_vision_extractions` keyed on *document content hash + vision `prompt_configuration_id`*, so:

- Re-Running a case with the same file and the same vision configuration reuses the stored extraction and makes no model call.
- Inserting a new vision `prompt_configuration` row changes the key, which forces a re-extraction and writes a new `document_vision_extractions` row. Earlier rows are kept and still point at their own cached blobs.
- Editing the existing vision configuration in place does **not** change the key, so cached extractions produced by the previous wording keep being served.

Because every extraction row records the hash, the configuration id, and the blob it produced, that table is the audit trail for which prompt actually produced a given document's text. Transaction and Suggested prompts are not part of any cache key, so changes to them take effect on the next run.

## First run

From the repository root:

```powershell
# API — http://localhost:5175 (Swagger at /swagger) and https://localhost:7273
dotnet restore api/DIVERTCheck.csproj
dotnet run --project api/DIVERTCheck.csproj
```

```powershell
# Frontend — http://localhost:5174
cd frontend
npm install
npm run dev
```

`dotnet run` uses the `ASPNETCORE_ENVIRONMENT=Development` profile from [api/Properties/launchSettings.json](../api/Properties/launchSettings.json). To run against staging configuration instead:

```powershell
$env:ASPNETCORE_ENVIRONMENT="Staging"
dotnet run --project api/DIVERTCheck.csproj
```

A successful start means Key Vault, PostgreSQL, and Blob Storage all resolved — `Program.cs` throws at startup if any of them is missing.

### Your first account

Register through the app, then expect to be a plain user: every account created through registration gets the role `USER`. The prompt-administration screens are hidden until someone with database access promotes the account:

```sql
UPDATE users
SET role_code = 'ADMIN'
WHERE email = 'you@example.com';
```

Sign out and sign back in afterwards — the role is carried in the JWT, so an existing session keeps the old one. See [Roles And Access](../README.md#roles-and-access) for the details.


## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Azure Key Vault credential unavailable` | Not signed in. Run `az login`, or set `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET`. |
| `Failed to load Azure Key Vault configuration` | Signed in, but your account lacks Get/List on the vault, or the wrong subscription is selected. |
| `Database connection string was not found` | The `ConnectionStrings--DivertCheck--Connection` secret is missing or empty in the vault. |
| `Azure blob connection string was not found` | Same, for `AzureStorage--StorageConnectionString-DivertCheck`. |
| `CORS origins were not found at 'Cors:AllowedOrigins'` | Running a non-Development environment whose appsettings file has no CORS list. |
| Frontend loads but every call fails with CORS | The frontend origin is not in `Cors:AllowedOrigins`, or `VITE_API_BASE_URL` points at a different API than the one you started. |
| Reviews stay queued forever | The background worker runs inside the API process — confirm the API is still running, and check `C:\Temp\DIVERTCheck\error.log`. |
| Nothing in the log files | NLog writes to `C:\Temp\DIVERTCheck\`; create the folder if it does not exist. |

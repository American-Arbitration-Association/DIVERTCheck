# DIVERTCheck - Hosting

Short guide for where the app runs and what it needs in hosted environments.

## Required runtime settings

The API needs:

- PostgreSQL connection string.
- Azure Blob Storage connection string.
- Azure OpenAI API key and endpoints.
- Azure Monitor / Application Insights connection string.
- JWT issuer, audience, and signing key.
- CORS origins for the hosted frontend URL.

The frontend needs:

- `VITE_API_BASE_URL`, pointing to the hosted API base path, for example `https://example.com/api/v1`.

## Hosting options

- **OCA Server**
- **IIS / Windows Server**: publish the ASP.NET Core API, serve the frontend build from IIS, and run both behind HTTPS.
- **Azure App Service**: host the API as an App Service and the frontend as Static Web Apps, Storage static website, or another App Service.
- **Containers**: run API/frontend containers with Docker Compose or a platform-specific container service.
- **Static frontend + managed API**: serve `frontend/dist` from static hosting and run only the API as a managed service.

## Checks after deployment

- Open `/health` on the API.
- Open Swagger and sign in through `POST /api/v1/Auth/login`.
- Confirm frontend login works.
- Upload a small document and confirm the AI job completes.
- Check Application Insights for `case_review.execute` and `openai.*` traces.

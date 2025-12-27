# Spill Your Guts Log

A public web app for logging events (starting with water intake) via NFC links, built on Cloudflare Pages with D1 database and Gitea webhook integration.

## Features

- Simple web interface for logging water intake
- NFC link support with prefilled amounts
- Cloudflare D1 database for storage
- Gitea webhook to sync events to WINTERMUTE repo as monthly JSON files
- Safety controls: rate limiting, same-origin checks, idempotency

## Project Structure

```
spillyourguts-log/
├── apps/
│   ├── web/                    # Static frontend (Cloudflare Pages)
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js
│   └── functions/              # Pages Functions (API routes)
│       ├── api/
│       │   └── events/
│       │       └── water.ts    # POST handler for water events
│       └── utils/
│           └── gitea.ts        # Gitea API client
├── migrations/                 # D1 database migrations
│   └── 0001_initial.sql
├── wrangler.toml               # Cloudflare config
├── package.json
└── tsconfig.json
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create D1 Database

```bash
wrangler d1 create spillyourguts-log
```

This will output a database ID. Update `wrangler.toml` with the `database_id` in the `[env.production.d1_databases]` section.

### 3. Run Migrations

For local development:
```bash
npm run migrate:local
```

For production:
```bash
npm run migrate
```

### 4. Set Cloudflare Secrets

Set the Gitea configuration as Cloudflare secrets (for Pages Functions, use the Cloudflare dashboard or wrangler):

```bash
# For Pages, set these in the Cloudflare dashboard under:
# Pages > Your Project > Settings > Environment Variables

# Or via wrangler (if using Workers):
wrangler secret put GITEA_URL
wrangler secret put GITEA_TOKEN
wrangler secret put GITEA_OWNER
wrangler secret put GITEA_REPO
```

**Required secrets:**
- `GITEA_URL` - Your Gitea instance URL (e.g., `https://gitea.example.com`)
- `GITEA_TOKEN` - Gitea personal access token with repo write permissions
- `GITEA_OWNER` - Repository owner/username
- `GITEA_REPO` - Repository name (WINTERMUTE)

### 5. Local Development

```bash
npm run dev
```

This starts a local development server with Pages Functions support.

### 6. Deployment

#### Deploy to Cloudflare Pages

1. Connect your GitHub repo to Cloudflare Pages
2. Set build settings:
   - Build output directory: `apps/web`
   - Functions directory: `apps/functions`
3. Add environment variables in the Cloudflare dashboard (GITEA_URL, GITEA_TOKEN, etc.)
4. Deploy!

The Pages Functions will automatically handle `/api/*` routes.

## Usage

### Basic Flow

1. User opens: `https://log.spillyourguts.online/water?amount=64`
2. Page loads with amount prefilled
3. User clicks "Submit"
4. Event is saved to D1 and synced to Gitea

### API Endpoint

**POST `/api/events/water`**

Request body:
```json
{
  "amount_oz": 64,
  "source": "bottle",
  "note": "optional note"
}
```

Response:
```json
{
  "success": true,
  "id": "uuid",
  "amount_oz": 64,
  "created_at": 1234567890
}
```

### Safety Controls

- **Same-origin check**: Only accepts requests from the same origin
- **Rate limiting**: 10 requests per minute per IP
- **Idempotency**: Prevents duplicate submissions within 5 seconds

## Gitea Integration

Events are automatically synced to your WINTERMUTE Gitea repository as monthly JSON files:

- Path: `events/YYYY-MM.json`
- Format: Array of event objects
- Updates: Appends new events to existing files

The webhook runs asynchronously and won't block the API response. If Gitea is unavailable, events are still saved to D1 and will sync on the next successful request.

## Future Extensions

- Add more event types: caffeine, supplements, workout sets
- Optional "tap-to-log" endpoint gated by per-tag token
- Dashboard page summarizing daily totals

## License

MIT


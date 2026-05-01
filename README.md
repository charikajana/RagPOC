# 🤖 RAG Engine — AI-Driven Test Automation

A production-grade **Retrieval-Augmented Generation** backend that automatically generates Cucumber `.feature` files and TypeScript step definitions from Azure DevOps User Stories.

---

## 📐 Architecture

```
Azure DevOps API
      │
      ▼
 ADO Loader ─────────────────────────────────┐
      │                                       │
 Feature Files  ──► Chunker (RecursiveChar)  │
 Step Defs      ──► Embedder (text-emb-3-sm) │
 PDF/MD Docs    ──►                           │
                          │                  │
                          ▼                  │
                    ChromaDB (Vector DB)      │
                          │                  │
                          ▼                  │
              RAG Chain (LangChain.js) ◄──────┘
                          │
                   Azure OpenAI (GPT-4o)
                          │
                          ▼
              Gherkin .feature + TypeScript Steps
```

---

## 🚀 Quick Start

### 1. Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js     | ≥ 18    |
| Docker      | ≥ 24    |
| Azure OpenAI | Active subscription |
| Azure DevOps PAT | Read scope on Work Items |

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Azure OpenAI and ADO credentials
```

### 4. Start ChromaDB

```bash
# Option A: Docker (recommended)
docker compose up chromadb -d

# Option B: Python pip
pip install chromadb
chroma run --host localhost --port 8000
```

### 5. Index Your Knowledge Base

```bash
# Index your existing .feature files and step definitions
npm run ingest:features

# Index ADO User Stories (all, or filtered by area)
npm run ingest:ado
npm run ingest:ado -- --area "MyProject\Backend"

# Index a single story
npm run ingest:ado -- --story 12345

# Index PDF/Markdown documentation
npm run ingest:docs
```

### 6. Start the API Server

```bash
# Development (hot reload)
npm run dev

# Production
npm run build && npm start
```

---

## 📡 API Reference

### `POST /api/generate-test`

Generates a Gherkin feature file and TypeScript step definitions for a given ADO story.

**Request:**
```json
{
  "storyId": 12345
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "storyId": 12345,
    "storyTitle": "User Login with SSO",
    "featureFile": "Feature: User Login with SSO\n  ...",
    "stepDefinitions": "import { Given, When, Then } from '@cucumber/cucumber';\n  ...",
    "retrievedChunks": [
      {
        "content": "...",
        "source": "feature-file",
        "metadata": { "filePath": "login.feature", ... }
      }
    ]
  }
}
```

---

### `POST /api/search`

Performs a semantic search across all indexed documents.

**Request:**
```json
{
  "query": "user authentication login flow",
  "k": 5,
  "source": "feature-file"
}
```

**`source` filter options:** `azure-devops` | `feature-file` | `step-definition` | `documentation`

---

### `GET /api/story/:id`

Fetches a raw ADO work item by ID.

---

### `GET /api/health`

Returns server health status.

---

## 🗂️ Project Structure

```
RagPOC/
├── src/
│   ├── config.ts                  # Centralized configuration
│   ├── server.ts                  # Express entry point
│   ├── api/
│   │   └── routes.ts              # API route handlers
│   ├── connectors/
│   │   ├── adoClient.ts           # Azure DevOps REST API client
│   │   ├── adoLoader.ts           # ADO → LangChain Document converter
│   │   └── frameworkLoader.ts     # Feature/step/doc file loader
│   ├── rag/
│   │   └── ragChain.ts            # Core RAG pipeline (retrieval + generation)
│   ├── vectorStore/
│   │   └── chromaClient.ts        # ChromaDB connection & helpers
│   └── scripts/
│       ├── ingestADO.ts           # CLI: ingest ADO work items
│       ├── ingestFeatures.ts      # CLI: ingest .feature & step files
│       └── ingestDocs.ts          # CLI: ingest PDF/Markdown docs
├── knowledge/
│   ├── features/                  # Your .feature files (style examples)
│   ├── steps/                     # Your TypeScript step definitions
│   └── docs/                      # PDF / Markdown business rules
├── docker-compose.yml             # ChromaDB + RAG Engine services
├── Dockerfile                     # Container for the API
├── .env.example                   # Environment variable template
└── tsconfig.json
```

---

## ⚙️ Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API Key | `abc123...` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL | `https://my-resource.openai.azure.com/` |
| `AZURE_OPENAI_API_VERSION` | API version | `2024-02-01` |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Embedding model deployment name | `text-embedding-3-small` |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | Chat model deployment name | `gpt-4o` |
| `ADO_ORGANIZATION` | ADO org name | `mycompany` |
| `ADO_PROJECT` | ADO project name | `MyProduct` |
| `ADO_PAT` | Personal Access Token (Read: Work Items) | `xxxx...` |
| `CHROMA_URL` | ChromaDB server URL | `http://localhost:8000` |
| `CHROMA_COLLECTION_NAME` | ChromaDB collection name | `rag_test_automation` |
| `PORT` | API server port | `3001` |

---

## 🔄 Ingestion Pipeline Detail

```
Source Data
    │
    ├── ADO Work Items ──► adoLoader.ts ──────────────────────┐
    │    (Title, Desc, AC, Comments)                           │
    │                                                           │
    ├── .feature files ──► frameworkLoader.ts ─────────────────┤
    │                                                           │
    ├── step defs .ts ───► frameworkLoader.ts ─────────────────┤
    │                                                           │
    └── PDF/MD docs ─────► frameworkLoader.ts ─────────────────┤
                                                                │
                                              RecursiveCharacterTextSplitter
                                              (800 tokens, 80 overlap)
                                                                │
                                              text-embedding-3-small
                                              (Azure OpenAI)
                                                                │
                                              ChromaDB (persisted)
```

---

## 🐳 Full Docker Setup

```bash
# Start everything
docker compose up -d

# View logs
docker compose logs -f

# Stop everything
docker compose down
```

---

## 💡 Tips

- **Re-index regularly**: Run `npm run ingest:ado` after ADO stories are updated.
- **Teach style**: The more `.feature` files you add to `knowledge/features/`, the better the AI matches your team's style.
- **Filter by area**: Use `--area "Project\FeatureArea"` to ingest only relevant stories.
- **Reset index**: Add `--reset` flag to `ingest:ado` to wipe and rebuild the collection.

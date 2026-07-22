# AI Agents, RAG, Voice, Meetings

## 1. Agent orchestration frameworks

| Framework | Lang | Mode | Best for | Notes |
|-----------|------|------|----------|-------|
| **LangGraph** | Py/JS | EMBED | **Production default** — stateful graphs, checkpoints, HITL, retries | Klarna-scale narratives; pairs with LangChain tools |
| **LangChain** | Py/JS | EMBED | Tools, retrievers, model abstraction | Use with LangGraph, not chains-only |
| **CrewAI** | Py | EMBED | Fast multi-agent “roles” prototypes | Less control than graphs |
| **AutoGen / AG2** | Py | EMBED | Conversational multi-agent | MS ecosystem |
| **LlamaIndex** | Py/TS | EMBED | **RAG + data agents** | Best when docs/schedules are the brain |
| **Haystack** | Py | EMBED | Deterministic RAG pipelines | deepset |
| **Semantic Kernel** | C#/Py/Java | EMBED | Enterprise MS shops | |
| **Pydantic AI** | Py | EMBED | Type-safe agents | |
| **Smolagents** | Py | EMBED | Minimal code agents (HF) | |
| **Mastra** | TS | EMBED | TS-first agents | |
| **OpenAI Agents SDK** | Py | EMBED | OpenAI-native | Provider lock |
| **Claude Agent SDK** | Py/TS | EMBED | Anthropic tool+sandbox | Provider lock |
| **Dify** | — | INTEGRATE | Visual agent+RAG platform self-host | Fast internal tools |
| **Flowise** | — | INTEGRATE | Visual LangChain | |
| **AnyThingLLM** | — | INTEGRATE | Doc chat workspace | |

**Tornix agent map → implementation:**
| Tornix agent | Build with |
|--------------|------------|
| Super Agent / Twin | LangGraph supervisor + tools |
| Scheduling | Tools: get_cpm, explain_delay, import_p6 |
| Cost | Tools: evm_snapshot, budget_variance |
| Risk | Tools: risk_matrix, monte_carlo_summary |
| Documents | LlamaIndex over specs/RFIs |
| Reporting | Graph → markdown/PDF |
| Memory | Postgres + vector store of decisions |

**Must:** tool allowlists, citation of entity IDs, human approve on money/schedule baseline changes.

---

## 2. RAG & vector stores

| Component | Options |
|-----------|---------|
| Embeddings | OpenAI, Cohere, `sentence-transformers`, Ollama models |
| Vectors in PG | **pgvector** |
| Dedicated | Qdrant, Weaviate, Milvus, Chroma |
| Hybrid search | Meilisearch/Typesense + vectors |
| Unstructured ingest | Unstructured.io OSS, LlamaParse (paid), markitdown |
| PDF text | pypdf, pdfplumber, pymupdf |
| Chunking | LlamaIndex node parsers |

**Construction tip:** Chunk by **document revision + section + sheet number**, not blind 512 tokens. Metadata: `project_id`, `doc_type`, `rev`, `discipline`.

---

## 3. MCP (Model Context Protocol)
- Official MCP servers ecosystem — expose our API as MCP tools for Cursor/Claude/Helix-style agents  
- OpenProject added MCP server (v17) — pattern to copy  
- SVAR Gantt MCP for UI coding assistance  

**Build:** `tornix-mcp-server` wrapping REST tools for external agent hosts.

---

## 4. Speech-to-text / meetings

| Tool | Mode | Notes |
|------|------|-------|
| **OpenAI Whisper** / faster-whisper | EMBED | Batch meeting audio |
| **WhisperLiveKit** | INTEGRATE | Real-time STT, diarization, translation, Apache-2.0 narratives |
| **whisper.cpp** | EMBED | Edge/CPU |
| **LiveKit** | INTEGRATE | WebRTC rooms + agents SFU — **meetings product** |
| **LiveKit Agents** | EMBED | Voice agents on rooms |
| **Pyannote** | EMBED | Diarization (model gated) |
| **Vosk** | EMBED | Offline STT lighter |
| **Deepgram** | commercial API | Latency |
| **assemblyai** | commercial | |

**Tornix meetings path:** LiveKit (A/V) → WhisperLiveKit/faster-whisper → LLM summary → tasks created via tools.

---

## 5. TTS / voice replies
| Tool | Notes |
|------|-------|
| Piper TTS | Offline MIT-class |
| Coqui TTS | Check license |
| OpenAI/Azure TTS | Quality AR voices — test Arabic |
| Edge-TTS | Unofficial edge voices |

**Arabic quality:** always A/B test; may need commercial neural AR.

---

## 6. LLM gateways / observability
| Tool | Mode |
|------|------|
| **LiteLLM** | EMBED proxy multi-provider |
| **Langfuse** | INTEGRATE traces/evals |
| **LangSmith** | managed |
| **Phoenix (Arize)** | OSS observability |
| **Helicone** alternatives | self-host proxies |
| **Ollama** / vLLM | local models |

---

## 7. Eval & safety
- Promptfoo, Ragas (RAG eval)  
- Guardrails AI, NeMo Guardrails  
- PII redaction before embed (Presidio)  

import os
import logging
import requests
import chromadb
from chromadb.utils import embedding_functions


logger = logging.getLogger("rag_manager")

class GoogleGeminiEmbeddingFunction(embedding_functions.EmbeddingFunction):
    """
    Custom embedding function using Google Gemini API (REST).
    Avoids dependency hell with langchain/google-genai libraries.
    """
    def __init__(self, api_key: str, model_name: str = "models/gemini-embedding-001"):
        self.api_key = api_key
        self.model_name = model_name
        self.api_url = f"https://generativelanguage.googleapis.com/v1beta/{model_name}:batchEmbedContents?key={api_key}"

    def __call__(self, input: list[str]) -> list[list[float]]:
        try:
            # Gemini Batch API format
            # requests: [{model: ..., content: {parts: [{text: ...}]}}]
            payload = {
                "requests": [
                    {
                        "model": self.model_name,
                        "content": {"parts": [{"text": text}]}
                    }
                    for text in input
                ]
            }
            
            response = requests.post(
                self.api_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            data = response.json()
            
            if "error" in data:
                raise Exception(f"Gemini API Error: {data['error']}")
            
            # Extract embeddings
            # Response: {embeddings: [{values: [...]}, ...]}
            # Note: The structure might be 'embeddings' key in older API, or list of results.
            # verify_rag.py will test this. 
            # Current v1beta batch response typically matches order.
            
            if "embeddings" in data:
                 return [e["values"] for e in data["embeddings"]]
            
            # Fallback for different response shape if any (usually 'embeddings')
            raise Exception(f"Unexpected API response: {data.keys()}")

        except Exception as e:
            logger.error(f"Gemini embedding failed: {e}")
            raise e

class RAGManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RAGManager, cls).__new__(cls)
            cls._instance.initialize()
        return cls._instance

    def initialize(self):
        """
        Initialize ChromaDB client and collections.
        Uses Google Gemini API for embeddings (Free, Fast, Reliable).
        """
        try:
            # Persist data in a folder named 'chroma_db' inside AI_Agents
            current_dir = os.path.dirname(os.path.abspath(__file__))
            self.persist_directory = os.path.join(current_dir, '..', 'chroma_db')
            os.makedirs(self.persist_directory, exist_ok=True)
            
            self.client = chromadb.PersistentClient(path=self.persist_directory)
            
            # --- GOOGLE GEMINI EMBEDDINGS ---
            google_api_key = os.getenv("GOOGLE_API_KEY")
            if not google_api_key:
                logger.error("GOOGLE_API_KEY is missing!")
                raise ValueError("Missing GOOGLE_API_KEY in .env. Cannot run RAG.")

            logger.info("Using Google Gemini API for embeddings (Custom Rest)")
            
            # Use Custom Function
            self.embedding_fn = GoogleGeminiEmbeddingFunction(
                api_key=google_api_key
            )
            
            # --- Collection 1: Clinical Knowledge ---
            self.collection_name = "medical_knowledge"
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                embedding_function=self.embedding_fn
            )
            
            # --- Collection 2: Task Planning Knowledge ---
            self.task_collection_name = "task_knowledge"
            self.task_collection = self.client.get_or_create_collection(
                name=self.task_collection_name,
                embedding_function=self.embedding_fn
            )

            # --- Collection 3: Monitoring Protocols ---
            self.monitoring_collection_name = "monitoring_protocols"
            self.monitoring_collection = self.client.get_or_create_collection(
                name=self.monitoring_collection_name,
                embedding_function=self.embedding_fn
            )

            logger.info(f"RAGManager initialized. DB Path: {self.persist_directory}")
            
            # Auto-ingest if empty
            if self.collection.count() == 0:
                logger.info("Clinical Collection empty. Auto-ingesting knowledge base...")
                self.ingest_knowledge_base('knowledge_base.md', self.collection)

            if self.task_collection.count() == 0:
                logger.info("Task Collection empty. Auto-ingesting task knowledge base...")
                self.ingest_knowledge_base('task_planning_kb.md', self.task_collection)

            if self.monitoring_collection.count() == 0:
                logger.info("Monitoring Collection empty. Auto-ingesting monitoring knowledge base...")
                self.ingest_knowledge_base('monitoring_protocols_kb.md', self.monitoring_collection)
                
        except Exception as e:
            logger.error(f"Failed to initialize RAGManager: {e}")
            raise e

    def reingest_task_kb(self):
        """
        Clear and re-ingest the task planning knowledge base.
        Call this after updating task_planning_kb.md.
        """
        try:
            self.client.delete_collection(self.task_collection_name)
            self.task_collection = self.client.get_or_create_collection(
                name=self.task_collection_name,
                embedding_function=self.embedding_fn
            )
            self.ingest_knowledge_base('task_planning_kb.md', self.task_collection)
            logger.info("Task KB re-ingested successfully.")
            return True
        except Exception as e:
            logger.error(f"Failed to reingest task KB: {e}")
            return False

    def ingest_knowledge_base(self, filename: str, collection):
        """
        Reads a markdown file, splits by headers, and ingests into the specified collection.
        """
        try:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            kb_path = os.path.join(current_dir, filename)
            
            if not os.path.exists(kb_path):
                logger.error(f"Knowledge base file not found at {kb_path}")
                return

            with open(kb_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Split by headers (## )
            sections = content.split("## ")
            
            documents = []
            ids = []
            metadatas = []
            
            for i, sec in enumerate(sections):
                if not sec.strip():
                    continue
                
                # Reconstruct full section for context
                full_text = "## " + sec
                
                # Extract title for metadata
                title = sec.split('\n')[0].strip()
                
                documents.append(full_text)
                ids.append(f"{filename}_doc_{i}")
                metadatas.append({"title": title, "source": filename})
            
            if documents:
                collection.upsert(
                    documents=documents,
                    ids=ids,
                    metadatas=metadatas
                )
                logger.info(f"Successfully ingested {len(documents)} snippets from {filename} into ChromaDB.")
            
        except Exception as e:
            logger.error(f"Error ingesting {filename}: {e}")

    def search(self, query: str, k: int = None, collection_type: str = "clinical") -> str:
        """
        Semantic search for relevant protocols.
        collection_type: 'clinical', 'task', or 'monitoring'
        For task/monitoring queries, defaults to k=3 to ensure the condition protocol
        + adaptive escalation protocols are both returned.
        """
        try:
            # Select collection based on type
            if collection_type == "task":
                target_collection = self.task_collection
            elif collection_type == "monitoring":
                target_collection = self.monitoring_collection
            else:
                target_collection = self.collection

            # Default k: 3 for task/monitoring (protocol + escalation + related), 1 for clinical
            if k is None:
                k = 1 if collection_type == "clinical" else 3

            results = target_collection.query(
                query_texts=[query],
                n_results=k
            )
            
            docs = results.get('documents', [[]])[0]
            metadatas = results.get('metadatas', [[]])[0]
            
            if not docs:
                return f"No specific info found in {collection_type} knowledge base."
            
            formatted_results = []
            for doc, meta in zip(docs, metadatas):
                title = meta.get('title', 'Untitled')
                formatted_results.append(f"--- Protocol: {title} ---\n{doc}")
                
            return "\n\n".join(formatted_results)
            
        except Exception as e:
            logger.error(f"RAG search failed: {e}")
            return f"Error performing semantic search: {e}"

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
    def __init__(self, api_key: str, model_name: str = "models/text-embedding-004"):
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
        Initialize ChromaDB client and collection.
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
            
            self.collection_name = "medical_knowledge"
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                embedding_function=self.embedding_fn
            )
            logger.info(f"RAGManager initialized. DB Path: {self.persist_directory}")
            
            # Auto-ingest if empty
            if self.collection.count() == 0:
                logger.info("Collection empty. Auto-ingesting knowledge base...")
                self.ingest_knowledge_base()
                
        except Exception as e:
            logger.error(f"Failed to initialize RAGManager: {e}")
            raise e

    def ingest_knowledge_base(self):
        """
        Reads knowledge_base.md, splits by headers, and ingests into ChromaDB.
        """
        try:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            kb_path = os.path.join(current_dir, 'knowledge_base.md')
            
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
                ids.append(f"doc_{i}")
                metadatas.append({"title": title, "source": "knowledge_base.md"})
            
            if documents:
                self.collection.upsert(
                    documents=documents,
                    ids=ids,
                    metadatas=metadatas
                )
                logger.info(f"Successfully ingested {len(documents)} snippets into ChromaDB.")
            
        except Exception as e:
            logger.error(f"Error ingesting knowledge base: {e}")

    def search(self, query: str, k: int = 1) -> str:
        """
        Semantic search for relevant protocols.
        Returns a formatted string of the top-k results.
        """
        try:
            # Note: For search queries, we should ideally use task_type="RETRIEVAL_QUERY"
            # but Chroma's function wrapper handles what it can. 
            # If strictly needed, we can re-instantiate embedding function with RETRIEVAL_QUERY for the query call.
            # For simplicity, we use the default or document one as the difference is often minor for this scale.
            
            results = self.collection.query(
                query_texts=[query],
                n_results=k
            )
            
            # results is a dict with lists of lists (batch support)
            # We only have one query, so access results['documents'][0]
            
            docs = results.get('documents', [[]])[0]
            metadatas = results.get('metadatas', [[]])[0]
            
            if not docs:
                return "No specific protocols found in the knowledge base."
            
            formatted_results = []
            for doc, meta in zip(docs, metadatas):
                title = meta.get('title', 'Untitled')
                formatted_results.append(f"--- Protocol: {title} ---\n{doc}")
                
            return "\n\n".join(formatted_results)
            
        except Exception as e:
            logger.error(f"RAG search failed: {e}")
            return f"Error performing semantic search: {e}"

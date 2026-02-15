from typing import Dict, List
from fastapi import WebSocket
import logging
import asyncio

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Map patient_id -> list of active connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, patient_id: str):
        await websocket.accept()
        if patient_id not in self.active_connections:
            self.active_connections[patient_id] = []
        self.active_connections[patient_id].append(websocket)
        logger.info(f"WebSocket connected for patient {patient_id}")

    def disconnect(self, websocket: WebSocket, patient_id: str):
        if patient_id in self.active_connections:
            if websocket in self.active_connections[patient_id]:
                self.active_connections[patient_id].remove(websocket)
            if not self.active_connections[patient_id]:
                del self.active_connections[patient_id]
        logger.info(f"WebSocket disconnected for patient {patient_id}")

    async def broadcast(self, message: Dict, patient_id: str, exclude: WebSocket = None):
        if patient_id in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[patient_id]:
                if exclude and connection == exclude:
                    continue
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to send to WS: {e}")
                    dead_connections.append(connection)
            
            # Cleanup dead connections
            for dead in dead_connections:
                self.disconnect(dead, patient_id)

manager = ConnectionManager()
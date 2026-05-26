<div align="center">

# 🏥 Aviral — Agentic AI Nurse

### Intelligent Patient Health Monitoring & Risk Assessment Platform

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![CrewAI](https://img.shields.io/badge/CrewAI-Multi--Agent-FF6B6B?style=for-the-badge)](https://crewai.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-UUID-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)

<br />

*A full-stack, AI-powered patient health monitoring system that uses a **5-agent CrewAI pipeline** to analyze vitals, conduct real-time symptom inquiries via **Human-in-the-Loop**, assess risk, and escalate to doctors — with role-based dashboards, WebSocket communication, Firebase push notifications, WhatsApp medication reminders, and a PWA-enabled frontend.*

<br />

[Features](#-features) · [Architecture](#-architecture) · [AI Pipeline](#-ai-agent-pipeline) · [Tech Stack](#-tech-stack) · [Getting Started](#-getting-started) · [API Reference](#-api-reference) · [Deployment](#-deployment)

</div>

---

## 📸 Overview

Aviral is an **agentic AI nursing assistant** that automates patient health monitoring and clinical decision-making through a multi-agent architecture. Nurses submit patient vitals, and the system autonomously evaluates them through a 5-stage AI pipeline — asking the patient follow-up questions in real-time when needed, consulting a medical knowledge base (RAG), computing a risk score, and deciding on an action: **monitor at home**, **schedule appointment**, **alert caregiver**, or **trigger emergency escalation** via WhatsApp to a doctor.

### Key Highlights

- 🤖 **5 Specialized AI Agents** working in sequence (Groq-hosted Llama 3.1 & 3.3 models)
- 💬 **Human-in-the-Loop** — AI asks patients follow-up questions via WebSocket in real-time
- 📚 **RAG Knowledge Base** — ChromaDB-backed clinical protocol search
- 🔐 **5 User Roles** — Admin, Nurse, Doctor, Patient, Caretaker (RBAC)
- 📱 **PWA** — Installable, offline-capable, with service worker caching
- 🔔 **Push Notifications** — Firebase Cloud Messaging to caretakers on critical events
- 💊 **Medication Reminders** — WhatsApp reminders via n8n automation workflows
- 📹 **WebRTC Video Calling** — Patient-to-staff video calls via WebSocket signaling
- 📍 **Live GPS Tracking** — Real-time patient location via WebSocket
- 🧠 **MCP Server** — Model Context Protocol server exposing AI tools for external agents

---

## ✨ Features

### 🩺 Clinical Assessment Pipeline

| Stage | Agent | Model | Purpose |
|:-----:|-------|-------|---------|
| 1 | **Vital Analysis** | Llama 3.1 8B | Classifies vitals as `NORMAL` / `WARNING` / `CRITICAL` |
| 2 | **Symptom Inquiry** | Llama 3.3 70B | Asks follow-up questions to the patient via HITL + RAG search |
| 3 | **Context Aggregation** | Llama 3.1 8B | Synthesizes vitals, symptoms, history, and knowledge base data |
| 4 | **Risk Assessment** | Llama 3.3 70B | Quantifies risk: `LOW` / `MODERATE` / `HIGH` / `CRITICAL` with score |
| 5 | **Decision & Action** | Llama 3.1 8B | Decides action: `MONITOR_HOME` / `SCHEDULE_APPOINTMENT` / `ALERT_CAREGIVER` / `EMERGENCY_ESCALATION` |

### 👥 Role-Based Dashboards

| Role | Dashboard Features |
|------|--------------------|
| **Admin / Nurse** | Patient registry, start assessments, view stats (total patients, critical alerts, active monitoring), recent activity feed |
| **Doctor** | View patient list, assessment history, vitals history, provide recommendations |
| **Patient** | Personal dashboard, assessment status & history, AI-generated daily health plan, medication reminders, video call |
| **Caretaker** | Linked patients list, vitals monitoring, medication adherence tracking, task validation, emergency SOS, push notifications |

### 💊 Medication Management

- Create medication reminders with dosage, timing, and stock count
- **WhatsApp reminders** via n8n webhook automation
- Adherence tracking: `TAKEN` / `MISSED` / `SKIPPED` / `PENDING` statuses
- Low-stock warnings (< 5 remaining) with one-click refill
- Caretaker medication oversight and status updates

### 🧠 AI-Generated Daily Health Plans

- Generate personalized daily task plans using a dedicated **Task Planner Agent**
- Tasks based on patient conditions, medications, vitals history, and lifestyle guidelines
- Dual status tracking: patient self-report + caretaker validation (`VALIDATED` / `REFUSED`)
- Multi-day completion summaries and trends

### 🔔 Real-Time Communication

- **WebSocket** rooms per patient for live status updates
- **Firebase Cloud Messaging** push notifications to caretakers on critical events
- **WebRTC** video calling with signaling relay through WebSocket
- **Live GPS** location sharing for patient tracking

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React PWA)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Login   │ │Dashboard │ │Assessmnt │ │Reminders │ │Caretaker │ │
│  │  Page    │ │  Pages   │ │ Monitor  │ │  Page    │ │Dashboard │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       └─────────────┴────────────┴─────────────┴────────────┘       │
│                    Axios HTTP  │  WebSocket  │  Firebase FCM        │
└────────────────────────────────┼─────────────┼──────────────────────┘
                                 │             │
┌────────────────────────────────┼─────────────┼──────────────────────┐
│                      BACKEND (FastAPI)       │                      │
│  ┌─────────────────────────────┴─────────────┴───────────────────┐  │
│  │                     API Gateway (main.py)                     │  │
│  │  /api/v1/analyze  │  /api/v1/status  │  /ws/{patient_id}     │  │
│  └──────────┬────────────────┬───────────────────┬───────────────┘  │
│             │                │                   │                   │
│  ┌──────────▼──────┐ ┌──────▼──────┐ ┌──────────▼──────────────┐   │
│  │  Route Modules  │ │  WebSocket  │ │  Auth (JWT + Argon2)    │   │
│  │  - auth         │ │  Manager    │ │  - RBAC Guards          │   │
│  │  - patients     │ │  - Rooms    │ │  - 5 Role Levels        │   │
│  │  - dashboard    │ │  - WebRTC   │ └─────────────────────────┘   │
│  │  - reminders    │ │  - GPS      │                               │
│  │  - medications  │ └─────────────┘                               │
│  │  - tasks        │                                               │
│  │  - callbacks    │                                               │
│  │  - caretaker    │         ┌──────────────────────────────────┐  │
│  │  - notifications│         │       AI Agent Pipeline          │  │
│  └─────────────────┘         │  ┌────────┐  ┌──────────────┐   │  │
│                              │  │ CrewAI │──│ 5 Sequential │   │  │
│                              │  │ Engine │  │   Agents     │   │  │
│                              │  └───┬────┘  └──────┬───────┘   │  │
│                              │      │              │           │  │
│                              │  ┌───▼────┐  ┌──────▼───────┐  │  │
│                              │  │  Groq  │  │  RAG Search  │  │  │
│                              │  │  LLMs  │  │  (ChromaDB)  │  │  │
│                              │  └────────┘  └──────────────┘  │  │
│                              └──────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   MCP Server     │  │  PostgreSQL  │  │  Firebase Admin    │    │
│  │  (FastMCP Tools) │  │   (14 Models)│  │  (Push Notifs)     │    │
│  └──────────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     n8n Workflows       │
                    │  - WhatsApp Reminders   │
                    │  - Doctor Escalation    │
                    │  - Medication Callbacks  │
                    └─────────────────────────┘
```

---

## 🤖 AI Agent Pipeline

The core of Aviral is a **5-stage sequential CrewAI pipeline** that processes patient vitals through specialized agents. Each agent has a defined role, goal, and backstory, and uses Groq-hosted Llama models for inference.

```
Patient Vitals Submitted
        │
        ▼
┌───────────────────┐     Rate-limit retry
│  1. Vital Analysis│────  with exponential
│     (8B model)    │     backoff + 15s
└───────┬───────────┘     cooldown between
        │                 each stage
        ▼
┌───────────────────┐
│ 2. Symptom Inquiry│──── Human-in-the-Loop
│    (70B model)    │     questions via WS
│                   │──── RAG knowledge base
└───────┬───────────┘     search (ChromaDB)
        │
        ▼
┌───────────────────┐
│ 3. Context        │──── Synthesizes vitals
│    Aggregation    │     + symptoms + history
│    (8B model)     │     + medication data
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ 4. Risk Assessment│──── Risk score 0-100
│    (70B model)    │     LOW/MODERATE/HIGH
└───────┬───────────┘     /CRITICAL
        │
        ▼
┌───────────────────┐     MONITOR_HOME
│ 5. Decision &     │──── SCHEDULE_APPOINTMENT
│    Action         │──── ALERT_CAREGIVER
│    (8B model)     │──── EMERGENCY_ESCALATION
└───────┬───────────┘          │
        │                      ▼
        │              ┌───────────────┐
        │              │  n8n Webhook  │
        │              │  → WhatsApp   │
        │              │  → Doctor     │
        │              └───────────────┘
        ▼
  Results stored in DB
  + Push notification
  to caretaker
```

### Human-in-the-Loop (HITL) Flow

1. The **Symptom Inquiry Agent** generates a follow-up question
2. Question is saved to `agent_interactions` table with status `PENDING`
3. WebSocket broadcasts the question to the patient's connected frontend
4. Patient types an answer in the Assessment Monitor UI
5. Answer is submitted via `POST /api/v1/interaction/{id}` → status becomes `ANSWERED`
6. Agent (polling DB every few seconds for up to 5 minutes) reads the answer and continues

### RAG Knowledge Base

- **ChromaDB** vector store with clinical protocol documents
- Embedded markdown files covering vital ranges, symptom guidelines, medication protocols
- Agents perform semantic search to ground their reasoning in evidence-based knowledge
- Separate collections for clinical protocols and daily task/lifestyle planning

---

## 🛠 Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| **FastAPI** | REST API framework with async support |
| **CrewAI** | Multi-agent orchestration framework |
| **Groq** (Llama 3.1 8B / 3.3 70B) | LLM inference (dual API key round-robin) |
| **SQLAlchemy** | ORM with PostgreSQL |
| **PostgreSQL** | Primary database (UUID PKs, JSONB columns) |
| **ChromaDB** | RAG vector store for medical knowledge |
| **FastMCP** | Model Context Protocol server |
| **Firebase Admin SDK** | FCM push notifications |
| **python-jose** | JWT token management |
| **Passlib (Argon2)** | Password hashing |
| **APScheduler** | Background job scheduling |
| **Gunicorn + Uvicorn** | Production ASGI server |
| **httpx** | Async HTTP client (n8n webhooks) |

### Frontend

| Technology | Purpose |
|------------|---------|
| **React 18** | UI library |
| **Vite 5** | Build tool with HMR |
| **TailwindCSS 3** | Utility-first CSS framework |
| **React Router 6** | Client-side routing with role-based guards |
| **Framer Motion** | Animations and transitions |
| **React Hook Form** | Form management with validation |
| **Axios** | HTTP client |
| **Firebase SDK** | Push notification client (FCM) |
| **VitePWA** | Progressive Web App plugin |
| **Lucide React** | Icon library |
| **date-fns** | Date formatting utilities |

### External Services

| Service | Purpose |
|---------|---------|
| **Groq Cloud** | LLM API hosting (Llama models) |
| **n8n** | Workflow automation — WhatsApp reminders, doctor escalation |
| **Firebase** | Cloud Messaging (FCM) for web push |
| **Render** | Cloud deployment (backend + frontend + PostgreSQL) |

---

## 🚀 Getting Started

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+
- **PostgreSQL** (local or cloud instance)
- **Groq API Key** — [Get one free at groq.com](https://console.groq.com)
- **Firebase Project** — For push notifications (optional)
- **n8n Instance** — For WhatsApp/doctor webhooks (optional)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/agentic-ai-nurse.git
cd agentic-ai-nurse
```

### 2. Backend Setup

```bash
cd Backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt
```

#### Environment Variables

Create a `.env` file in the `Backend/` directory:

```env
# ──── Database ────
DATABASE_URL=postgresql://user:password@localhost:5432/vitaliq

# ──── AI / LLM ────
GROQ_API_KEY=gsk_your_primary_key_here
GROQ_API_KEY_2=gsk_your_secondary_key_here     # Optional: for round-robin rate-limit handling

# ──── Authentication ────
JWT_SECRET_KEY=your-super-secret-jwt-key

# ──── n8n Webhooks (Optional) ────
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/medication-reminder
N8N_ESCALATION_WEBHOOK_URL=https://your-n8n-instance.com/webhook/doctor-escalation

# ──── Firebase (Optional) ────
FIREBASE_CREDENTIALS_BASE64=<base64-encoded-service-account-json>

# ──── Server ────
BACKEND_URL=http://localhost:8000
```

#### Initialize the Database

```bash
python scripts/init_database.py
```

#### Run the Backend

```bash
# Development
uvicorn Platform.main:app --reload --host 0.0.0.0 --port 8000

# Production
gunicorn -w 1 -k uvicorn.workers.UvicornWorker Platform.main:app --bind 0.0.0.0:8000
```

### 3. Frontend Setup

```bash
cd Frontend

# Install dependencies
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:8000" > .env
```

#### Run the Frontend

```bash
# Development
npm run dev

# Production build
npm run build
npm run preview
```

### 4. First-Time Setup

1. Open the app in your browser (default: `http://localhost:5173`)
2. Use the **Setup Admin** endpoint to create the first admin account:
   ```bash
   curl -X POST http://localhost:8000/api/v1/auth/setup-admin \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "your-password", "full_name": "System Admin"}'
   ```
3. Log in with admin credentials
4. Register nurses, doctors, patients, and caretakers through the admin dashboard

---

## 📡 API Reference

### Authentication — `/api/v1/auth`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/register` | Create user account | Admin, Nurse |
| `POST` | `/login` | Form-based JWT login | Public |
| `POST` | `/login/json` | JSON-body JWT login | Public |
| `GET` | `/me` | Current user profile | Bearer Token |
| `POST` | `/setup-admin` | One-time admin creation | Public (first run) |

### AI Analysis — `/api/v1`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/analyze` | Start 5-agent AI analysis pipeline | Authenticated |
| `GET` | `/status/{patient_id}` | Poll analysis status | Authenticated |
| `POST` | `/interaction/{id}` | Submit HITL answer | Authenticated |
| `POST` | `/escalate` | Trigger doctor escalation webhook | Authenticated |

### Patients — `/api/v1/patients`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/` | Register new patient | Admin, Nurse |
| `GET` | `/` | List all patients | Staff |
| `GET` | `/me` | Get own patient record | Patient |
| `GET` | `/{id}` | Get patient details | Role-based |
| `PUT` | `/{id}` | Update patient info | Admin, Nurse |
| `GET` | `/{id}/history` | Assessment history | Role-based |
| `GET` | `/{id}/vitals` | Vitals history | Role-based |

### Dashboard — `/api/v1/dashboard`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/stats` | Overview stats (patients, alerts, monitoring) | Staff |

### Reminders — `/api/v1/reminders`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/` | Get my reminders | Patient |
| `POST` | `/` | Create reminder + WhatsApp webhook | Patient |
| `PUT` | `/{id}/refill` | Refill medicine stock | Patient, Caretaker |
| `GET` | `/patient/{id}` | Get patient's reminders | Authenticated |

### Medications — `/api/v1/medication`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/log` | Receive status from n8n | Webhook |
| `GET` | `/history/{patient_id}` | Medication log history | Role-based |
| `PUT` | `/log/{id}` | Update medication status | Role-based |

### Daily Tasks — `/api/v1/tasks`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/{patient_id}` | Get daily tasks | Authenticated |
| `POST` | `/{patient_id}/manual` | Create manual task | Staff, Caretaker |
| `PUT` | `/{task_id}/status` | Update task status | Role-based |
| `POST` | `/generate/{patient_id}` | AI-generate daily health plan | Authenticated |
| `GET` | `/summary/{patient_id}` | Completion summary (N days) | Authenticated |

### Caretaker — `/api/v1/caretaker`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/my-patients` | List linked patients | Caretaker |
| `POST` | `/link` | Link to a patient | Caretaker |
| `GET` | `/test-push` | Test push notification | Caretaker |

### Callbacks — `/api/v1/callbacks`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/doctor-advice` | Receive doctor advice from n8n | Webhook |
| `GET` | `/recommendations` | Fetch doctor recommendations | Public |
| `POST` | `/medication-reply` | Handle WhatsApp medication reply | Webhook |

### WebSocket — `/ws/{patient_id}`

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `LOCATION_UPDATE` | Client → Server | GPS coordinates broadcast |
| `WEBRTC_SIGNAL` | Bidirectional | Video call signaling relay |
| `PING` / `PONG` | Bidirectional | Connection keepalive |
| `analysis_update` | Server → Client | AI pipeline status changes |
| `hitl_question` | Server → Client | Agent follow-up question |

---

## 🗄 Database Schema

The system uses **14 SQLAlchemy models** with PostgreSQL, UUID primary keys, and JSONB columns:

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│    Users     │     │    Patients      │     │ Monitoring Logs   │
│──────────────│     │──────────────────│     │───────────────────│
│ id (UUID)    │◄────│ user_id (FK)     │     │ patient_id (FK)   │
│ username     │     │ name             │     │ blood_pressure    │
│ role (enum)  │     │ age, gender      │     │ heart_rate        │
│ password_hash│     │ conditions (JSON)│     │ blood_sugar       │
│ full_name    │     │ medications(JSON)│     │ temperature       │
└──────┬───────┘     │ gps_lat/lng      │     │ oxygen_saturation │
       │             └────────┬─────────┘     │ sleep_hours       │
       │                      │               │ gps_lat/lng       │
       │                      │               └───────────────────┘
       │                      │
       │             ┌────────▼─────────┐     ┌───────────────────┐
       │             │  AI Assessments  │     │     Alerts        │
       │             │──────────────────│     │───────────────────│
       │             │ patient_id (FK)  │     │ patient_id (FK)   │
       │             │ risk_score       │     │ type              │
       │             │ risk_level       │     │ message           │
       │             │ analysis (JSON)  │     │ call_received     │
       │             └──────────────────┘     └───────────────────┘
       │
       │  ┌──────────────────────┐   ┌────────────────────────┐
       │  │  Agent Interactions  │   │      Reminders         │
       │  │──────────────────────│   │────────────────────────│
       │  │ patient_id (FK)      │   │ patient_id (FK)        │
       │  │ question / answer    │   │ medicine_name          │
       │  │ status (PENDING/     │   │ dosage, time           │
       │  │         ANSWERED)    │   │ stock_count            │
       │  └──────────────────────┘   └────────────────────────┘
       │
       │  ┌──────────────────────┐   ┌────────────────────────┐
       │  │   Medication Logs    │   │     Daily Tasks        │
       │  │──────────────────────│   │────────────────────────│
       │  │ patient_id (FK)      │   │ patient_id (FK)        │
       │  │ reminder_id (FK)     │   │ title, description     │
       │  │ status (TAKEN/MISSED │   │ patient_status         │
       │  │   /SKIPPED/PENDING)  │   │ caretaker_status       │
       │  └──────────────────────┘   │ is_ai_generated        │
       │                             └────────────────────────┘
       │
       │  ┌──────────────────────┐   ┌────────────────────────┐
       │  │ Caretaker-Patient    │   │  Doctor Recommendations│
       │  │      Links           │   │────────────────────────│
       │  │──────────────────────│   │ patient_id (FK)        │
       │  │ caretaker_id (FK)    │   │ doctor_name            │
       │  │ patient_id (FK)      │   │ diagnosis, advice      │
       │  │ relationship_label   │   │ medications (JSON)     │
       │  └──────────────────────┘   └────────────────────────┘
       │
       │  ┌──────────────────────┐   ┌────────────────────────┐
       │  │   Device Tokens      │   │  Notification Logs     │
       │  │──────────────────────│   │────────────────────────│
       │  │ user_id (FK)         │   │ user_id (FK)           │
       │  │ token (FCM)          │   │ title, body            │
       │  │ device_info          │   │ success (bool)         │
       │  └──────────────────────┘   └────────────────────────┘
```

---

## 🧩 MCP Server

VitalIQ includes a **Model Context Protocol (MCP) server** that exposes the AI nurse capabilities as callable tools for external AI agents and IDEs:

| Tool | Description |
|------|-------------|
| `analyze_vitals` | Run vital analysis agent on a JSON vitals payload |
| `consult_knowledge_base` | Search clinical protocols via RAG |
| `ask_patient_question` | Trigger HITL question and wait for patient response |
| `run_risk_assessment` | Run risk assessment agent on aggregated case context |
| `schedule_medication_reminder` | Create reminder in DB + trigger WhatsApp webhook |

### Running the MCP Server

```bash
cd Backend
python -m MCP.mcp_server
```

### MCP Client (Interactive CLI)

```bash
cd Backend
python -m MCP.mcp_client

# Commands:
#   list                      — List available tools
#   call analyze_vitals {...}  — Call a tool with JSON args
#   quit                      — Exit
```

---

## ☁️ Deployment

### Render (Current Setup)

The project is deployed on **Render** with the following services:

| Service | URL | Type |
|---------|-----|------|
| Backend API | `agentic-nurse.onrender.com` | Web Service (Python) |
| Frontend PWA | `vital-iq.onrender.com` | Static Site |
| PostgreSQL | Render-managed | Database |

#### Backend Deployment

```bash
# Procfile (already configured)
web: gunicorn -w 1 -k uvicorn.workers.UvicornWorker Platform.main:app --bind 0.0.0.0:$PORT
```

- Set all environment variables in Render dashboard
- Root directory: `Backend/`
- Build command: `pip install -r requirements.txt`

#### Frontend Deployment

- Root directory: `Frontend/`
- Build command: `npm install && npm run build`
- Publish directory: `dist/`
- Set `VITE_API_URL` to your backend URL

---

## 📁 Project Structure

```
agentic-ai-nurse/
├── Backend/
│   ├── Platform/                  # FastAPI application
│   │   ├── main.py               # App entry point, core routes, AI pipeline runner
│   │   ├── websocket_manager.py  # WebSocket connection manager
│   │   ├── auth/                 # JWT auth, RBAC guards, Argon2 hashing
│   │   │   ├── security.py       # Token creation/verification
│   │   │   ├── dependencies.py   # Role-based dependency injection
│   │   │   └── schemas.py        # Pydantic auth schemas
│   │   ├── routes/               # API route modules
│   │   │   ├── auth.py           # Registration, login, admin setup
│   │   │   ├── patients.py       # Patient CRUD, history, vitals
│   │   │   ├── dashboard.py      # Dashboard stats
│   │   │   ├── reminders.py      # Medication reminders
│   │   │   ├── medications.py    # Medication logs & adherence
│   │   │   ├── tasks.py          # Daily tasks & AI plan generation
│   │   │   ├── caretaker.py      # Caretaker-patient linking
│   │   │   └── callbacks.py      # n8n webhook callbacks
│   │   └── notifications/        # Firebase push notification service
│   │       ├── router.py         # Token registration, test push
│   │       └── service.py        # FCM send logic, token cleanup
│   ├── MCP/                      # Model Context Protocol
│   │   ├── mcp_server.py         # MCP tool definitions (FastMCP)
│   │   └── mcp_client.py         # Interactive MCP CLI client
│   ├── Shared/
│   │   ├── AI_Agents/            # CrewAI agent system
│   │   │   ├── main.py           # Standalone CLI entry point
│   │   │   ├── medical_agents/
│   │   │   │   ├── crew.py       # 5-agent pipeline + planning crew
│   │   │   │   ├── agents.py     # Agent definitions (roles, models)
│   │   │   │   ├── tasks.py      # Task definitions for each agent
│   │   │   │   └── tools.py      # HITL tool, RAG search tools
│   │   │   └── chroma_db/        # RAG vector store (persistent)
│   │   └── database/
│   │       ├── models.py         # 14 SQLAlchemy ORM models
│   │       └── session.py        # DB engine & session factory
│   ├── scripts/                  # Utility scripts
│   │   ├── init_database.py      # Create all tables
│   │   ├── full_db_reset.py      # Drop & recreate everything
│   │   └── ...                   # Diagnostics, testing, etc.
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── Procfile                  # Render deployment config
│
├── Frontend/
│   ├── public/
│   │   └── firebase-messaging-sw.js  # FCM service worker
│   ├── src/
│   │   ├── App.jsx               # Router with role-based guards
│   │   ├── main.jsx              # React entry point
│   │   ├── firebase.js           # Firebase FCM setup
│   │   ├── api/
│   │   │   └── client.js         # Axios instance with JWT interceptor
│   │   ├── components/
│   │   │   ├── Layout.jsx        # App shell with sidebar
│   │   │   ├── Sidebar.jsx       # Role-based navigation
│   │   │   ├── TaskGrid.jsx      # Daily task display grid
│   │   │   ├── VideoCallModal.jsx # WebRTC video call UI
│   │   │   └── ...
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx   # JWT auth state management
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx          # Staff dashboard
│   │   │   ├── PatientDashboardPage.jsx   # Patient dashboard
│   │   │   ├── CaretakerDashboardPage.jsx # Caretaker dashboard
│   │   │   ├── NewAssessmentPage.jsx      # 3-step assessment wizard
│   │   │   ├── AssessmentMonitorPage.jsx  # Real-time AI status monitor
│   │   │   ├── MedicineRemindersPage.jsx  # Medication management
│   │   │   ├── DoctorAdvicePage.jsx       # Doctor recommendations
│   │   │   ├── PatientsPage.jsx           # Patient registry
│   │   │   └── LoginPage.jsx             # Authentication
│   │   └── hooks/
│   │       ├── useLocationTracking.js     # GPS tracking hook
│   │       └── useNetworkStatus.js        # Online/offline detection
│   ├── package.json
│   ├── vite.config.js            # Vite + PWA config
│   ├── tailwind.config.js
│   └── index.html
│
└── README.md
```

---

## 🔒 Security

- **Argon2** password hashing (memory-hard, GPU-resistant)
- **JWT Bearer tokens** with HS256 signing (7-day expiry)
- **Role-Based Access Control** — 5 roles with endpoint-level guards
- **CORS** configured per environment
- **Firebase credentials** stored as base64 environment variable

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is for educational and demonstration purposes.

---

<div align="center">

**Built with ❤️ using CrewAI, FastAPI, React, and Groq**

*Aviral — Because every patient deserves an intelligent guardian.*

</div>

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, date, timedelta
import uuid

from database.session import get_db
from database.models import DailyTask, Patient, User, UserRole
from auth.dependencies import get_current_user
from medical_agents.crew import MedicalCrew
import json

router = APIRouter(
    prefix="/api/v1/tasks",
    tags=["tasks"]
)

# --- Pydantic Models ---
class TaskCreate(BaseModel):
    task_description: str
    category: str
    scheduled_date: Optional[date] = None
    priority: Optional[str] = "NORMAL"

class TaskUpdate(BaseModel):
    status_patient: Optional[str] = None
    status_caretaker: Optional[str] = None

class TaskResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    task_description: str
    category: str
    scheduled_date: datetime
    status_patient: str
    status_caretaker: str
    source: Optional[str] = "AI_GENERATED"
    priority: Optional[str] = "NORMAL"
    created_at: datetime
    
    class Config:
        orm_mode = True

# --- Routes ---

@router.get("/{patient_id}", response_model=List[TaskResponse])
def get_daily_tasks(
    patient_id: uuid.UUID,
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not target_date:
        target_date = date.today()
    
    # Filter by date range (start of day to end of day)
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date, datetime.max.time())

    tasks = db.query(DailyTask).filter(
        DailyTask.patient_id == patient_id,
        DailyTask.scheduled_date >= start_of_day,
        DailyTask.scheduled_date <= end_of_day
    ).all()
    
    return tasks

@router.post("/{patient_id}/manual", response_model=TaskResponse)
def create_manual_task(
    patient_id: uuid.UUID,
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only Admin, Nurse, Doctor can add tasks manually? Or Caretaker too?
    # For now allow Staff + Caretaker
    if current_user.role == UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Patients cannot assign tasks to themselves.")

    scheduled_dt = datetime.combine(
        task_data.scheduled_date or date.today(), 
        datetime.min.time()
    )

    new_task = DailyTask(
        id=uuid.uuid4(),
        patient_id=patient_id,
        task_description=task_data.task_description,
        category=task_data.category,
        scheduled_date=scheduled_dt,
        status_patient="PENDING",
        status_caretaker="PENDING",
        source="MANUAL",
        priority=task_data.priority or "NORMAL",
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@router.put("/{task_id}/status", response_model=TaskResponse)
def update_task_status(
    task_id: uuid.UUID,
    update_data: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(DailyTask).filter(DailyTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Access Control Logic
    if current_user.role == UserRole.PATIENT:
        # Patient can only update their own status
        if update_data.status_patient:
            task.status_patient = update_data.status_patient
    elif current_user.role in [UserRole.CARETAKER, UserRole.NURSE, UserRole.ADMIN, UserRole.DOCTOR]:
        # Caretakers/Staff can validate
        if update_data.status_caretaker:
            task.status_caretaker = update_data.status_caretaker
            # If validated, ensure patient status aligns? Optional.
    
    db.commit()
    db.refresh(task)
    return task

@router.post("/generate/{patient_id}", response_model=List[TaskResponse])
def generate_daily_tasks(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate adaptive daily tasks using the AI planner.

    Passes the full patient context (compliance history, vitals trends,
    medication adherence, risk assessment, active alerts) so the AI can
    produce personalized, difficulty-adjusted, and priority-tagged tasks.
    """
    # Retrieve Patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Check if tasks already generated today (prevent duplicates)
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_end = datetime.combine(date.today(), datetime.max.time())
    existing_ai_tasks = db.query(DailyTask).filter(
        DailyTask.patient_id == patient_id,
        DailyTask.scheduled_date >= today_start,
        DailyTask.scheduled_date <= today_end,
        DailyTask.source.in_(["AI_GENERATED", "KB_BASELINE", "SMART_REMEDIATION"]),
    ).count()

    if existing_ai_tasks > 0:
        raise HTTPException(
            status_code=409,
            detail="Tasks already generated for today. Use the regenerate endpoint to replace them."
        )

    # Build rich patient context (the core improvement)
    from routes.patient_context import build_patient_context
    context = build_patient_context(patient_id, db)

    if "error" in context:
        raise HTTPException(status_code=404, detail=context["error"])

    patient_data_str = json.dumps(context, default=str)

    # Run AI Crew
    try:
        crew = MedicalCrew(patient_id=str(patient_id))
        result = crew.run_planning_crew(patient_data_str)
        
        # Parse Result (Expect JSON List)
        output_str = str(result)
        try:
             start = output_str.find('[')
             end = output_str.rfind(']') + 1
             if start != -1 and end != -1:
                 json_content = json.loads(output_str[start:end])
             else:
                 json_content = json.loads(output_str)
        except Exception as e:
            print(f"JSON Parse Error: {e} - Content: {output_str}")
            raise HTTPException(status_code=500, detail=f"AI Output Parse Error: {str(e)}. Raw Output: {output_str[:200]}...")

        generated_tasks = []
        today = date.today()
        
        for item in json_content:
            # Validate and normalize source/priority from AI output
            raw_source = item.get("source", "AI_GENERATED")
            valid_sources = {"AI_GENERATED", "KB_BASELINE", "SMART_REMEDIATION"}
            source = raw_source if raw_source in valid_sources else "AI_GENERATED"

            raw_priority = item.get("priority", "NORMAL")
            valid_priorities = {"LOW", "NORMAL", "HIGH", "CRITICAL"}
            priority = raw_priority if raw_priority in valid_priorities else "NORMAL"

            new_task = DailyTask(
                id=uuid.uuid4(),
                patient_id=patient_id,
                task_description=item.get("task_description", "Unnamed Task"),
                category=item.get("category", "General"),
                scheduled_date=datetime.combine(today, datetime.min.time()),
                status_patient="PENDING",
                status_caretaker="PENDING",
                source=source,
                priority=priority,
            )
            db.add(new_task)
            generated_tasks.append(new_task)
        
        db.commit()
        return generated_tasks

    except HTTPException:
        raise
    except Exception as e:
         print(f"Error generating tasks: {e}")
         raise HTTPException(status_code=500, detail=str(e))


@router.post("/regenerate/{patient_id}", response_model=List[TaskResponse])
def regenerate_daily_tasks(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Clear today's AI-generated tasks and regenerate with fresh context.
    Manual tasks are preserved.
    """
    # Only staff can regenerate
    if current_user.role == UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Patients cannot regenerate tasks.")

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Delete today's AI-generated tasks (keep MANUAL ones)
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_end = datetime.combine(date.today(), datetime.max.time())

    db.query(DailyTask).filter(
        DailyTask.patient_id == patient_id,
        DailyTask.scheduled_date >= today_start,
        DailyTask.scheduled_date <= today_end,
        DailyTask.source.in_(["AI_GENERATED", "KB_BASELINE", "SMART_REMEDIATION"]),
    ).delete(synchronize_session="fetch")
    db.commit()

    # Build context and regenerate
    from routes.patient_context import build_patient_context
    context = build_patient_context(patient_id, db)
    patient_data_str = json.dumps(context, default=str)

    try:
        crew = MedicalCrew(patient_id=str(patient_id))
        result = crew.run_planning_crew(patient_data_str)
        
        output_str = str(result)
        try:
            start = output_str.find('[')
            end = output_str.rfind(']') + 1
            if start != -1 and end != -1:
                json_content = json.loads(output_str[start:end])
            else:
                json_content = json.loads(output_str)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI Output Parse Error: {str(e)}")

        generated_tasks = []
        today = date.today()
        
        for item in json_content:
            raw_source = item.get("source", "AI_GENERATED")
            valid_sources = {"AI_GENERATED", "KB_BASELINE", "SMART_REMEDIATION"}
            source = raw_source if raw_source in valid_sources else "AI_GENERATED"

            raw_priority = item.get("priority", "NORMAL")
            valid_priorities = {"LOW", "NORMAL", "HIGH", "CRITICAL"}
            priority = raw_priority if raw_priority in valid_priorities else "NORMAL"

            new_task = DailyTask(
                id=uuid.uuid4(),
                patient_id=patient_id,
                task_description=item.get("task_description", "Unnamed Task"),
                category=item.get("category", "General"),
                scheduled_date=datetime.combine(today, datetime.min.time()),
                status_patient="PENDING",
                status_caretaker="PENDING",
                source=source,
                priority=priority,
            )
            db.add(new_task)
            generated_tasks.append(new_task)
        
        db.commit()
        return generated_tasks

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error regenerating tasks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary/{patient_id}")
def get_task_summary(
    patient_id: uuid.UUID,
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Stats for last N days
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    tasks = db.query(DailyTask).filter(
        DailyTask.patient_id == patient_id,
        DailyTask.scheduled_date >= start_date
    ).all()
    
    total = len(tasks)
    completed_by_patient = len([t for t in tasks if t.status_patient == 'COMPLETED'])
    validated = len([t for t in tasks if t.status_caretaker == 'VALIDATED'])
    
    return {
        "period_days": days,
        "total_tasks": total,
        "patient_completion_rate": (completed_by_patient / total * 100) if total > 0 else 0,
        "caretaker_validation_rate": (validated / total * 100) if total > 0 else 0
    }

from fastapi import FastAPI, UploadFile, File, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from sarvamai import SarvamAI
from jiwer import wer
import os
import shutil
from dotenv import load_dotenv

from models import TranscriptionResult, init_db, get_db

load_dotenv()
init_db()

app = FastAPI()
client = SarvamAI(api_subscription_key=os.getenv('SARVAM_API_KEY'))

@app.post("/transcribe")
async def transcribe_and_score(
    reference_text: str = Form(...),
    accent_group: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    response = client.speech_to_text.transcribe(
        file=open(temp_path, "rb"),
        model="saaras:v3",
        mode="transcribe"
    )

    os.remove(temp_path)

    hypothesis = response.transcript
    error_rate = wer(reference_text, hypothesis)

    result = TranscriptionResult(
        filename=file.filename,
        accent_group=accent_group,
        language_code=response.language_code,
        reference_text=reference_text,
        transcript=hypothesis,
        wer=error_rate,
        language_confidence=response.language_probability
    )
    db.add(result)
    db.commit()
    db.refresh(result)

    return {
        "id": result.id,
        "reference": reference_text,
        "transcript": hypothesis,
        "wer": round(error_rate, 4),
        "accent_group": accent_group,
        "language_detected": response.language_code
    }

@app.get("/results")
async def get_all_results(db: Session = Depends(get_db)):
    results = db.query(TranscriptionResult).all()
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "accent_group": r.accent_group,
            "wer": r.wer,
            "language_detected": r.language_code,
            "created_at": r.created_at.isoformat()
        }
        for r in results
    ]

@app.get("/results/by-accent")
async def get_wer_by_accent(db: Session = Depends(get_db)):
    results = (
        db.query(
            TranscriptionResult.accent_group,
            func.avg(TranscriptionResult.wer).label("avg_wer"),
            func.count(TranscriptionResult.id).label("sample_count")
        )
        .group_by(TranscriptionResult.accent_group)
        .all()
    )
    return [
        {"accent_group": r.accent_group, "avg_wer": round(r.avg_wer, 4), "sample_count": r.sample_count}
        for r in results
    ]

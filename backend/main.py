from fastapi import FastAPI, UploadFile, File, Form, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from sarvamai import SarvamAI
from jiwer import wer, Compose, ToLowerCase, RemovePunctuation, RemoveMultipleSpaces, Strip, ReduceToListOfListOfWords

normalize = Compose([
    ToLowerCase(),
    RemovePunctuation(),
    RemoveMultipleSpaces(),
    Strip(),
    ReduceToListOfListOfWords()
])
import os
import shutil
from dotenv import load_dotenv

from models import TranscriptionResult, init_db, get_db

load_dotenv()
init_db()

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
client = SarvamAI(api_subscription_key=os.getenv('SARVAM_API_KEY'))

@app.post("/transcribe")
async def transcribe_and_score(
    reference_text: str = Form(...),
    accent_group: str = Form(...),
    native_state: str = Form(None),
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
    error_rate = wer(
        reference_text, hypothesis,
        reference_transform=normalize,
        hypothesis_transform=normalize
    )

    result = TranscriptionResult(
        filename=file.filename,
        accent_group=accent_group,
        native_state=native_state,
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

BENCHMARK_LANGUAGES = ["Bengali", "Hindi", "Kannada", "Malayalam", "Nepali", "Odia", "Punjabi", "Tamil", "Telugu", "Urdu"]

@app.get("/results/by-accent")
async def get_wer_by_accent(db: Session = Depends(get_db)):
    results = (
        db.query(
            TranscriptionResult.accent_group,
            func.avg(TranscriptionResult.wer).label("avg_wer"),
            func.count(TranscriptionResult.id).label("sample_count")
        )
        .filter(TranscriptionResult.accent_group.in_(BENCHMARK_LANGUAGES))
        .group_by(TranscriptionResult.accent_group)
        .all()
    )
    return [
        {"accent_group": r.accent_group, "avg_wer": round(r.avg_wer, 4), "sample_count": r.sample_count}
        for r in results
    ]

@app.get("/results/by-accent/{accent_group}")
async def get_samples_for_accent(accent_group: str, db: Session = Depends(get_db)):
    results = (
        db.query(TranscriptionResult)
        .filter(TranscriptionResult.accent_group == accent_group)
        .order_by(TranscriptionResult.wer.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "reference_text": r.reference_text,
            "transcript": r.transcript,
            "wer": round(r.wer, 4)
        }
        for r in results
    ]

from rapidfuzz import process, fuzz
import re as re_module

def build_vocab(db: Session):
    rows = db.query(TranscriptionResult.reference_text).all()
    vocab = set()
    for (ref,) in rows:
        words = re_module.findall(r"[a-zA-Z']+", ref.lower())
        vocab.update(words)
    return list(vocab)

def correct_transcript(transcript, vocab, threshold=80):
    words = transcript.split()
    corrected = []
    for word in words:
        clean_word = re_module.sub(r"[^a-zA-Z']", "", word.lower())
        if not clean_word:
            corrected.append(word)
            continue
        match = process.extractOne(clean_word, vocab, scorer=fuzz.ratio)
        if match and match[1] >= threshold and match[0] != clean_word:
            corrected.append(match[0])
        else:
            corrected.append(word)
    return " ".join(corrected)

@app.get("/results/by-state")
async def get_wer_by_state(db: Session = Depends(get_db)):
    results = (
        db.query(
            TranscriptionResult.native_state,
            func.avg(TranscriptionResult.wer).label("avg_wer"),
            func.count(TranscriptionResult.id).label("sample_count")
        )
        .filter(TranscriptionResult.native_state.isnot(None))
        .group_by(TranscriptionResult.native_state)
        .all()
    )
    return [
        {"state": r.native_state, "avg_wer": round(r.avg_wer, 4), "sample_count": r.sample_count}
        for r in results
    ]

@app.get("/mitigation/summary")
async def mitigation_summary(db: Session = Depends(get_db)):
    rows = db.query(TranscriptionResult).filter(TranscriptionResult.accent_group.in_(BENCHMARK_LANGUAGES)).all()
    vocab = build_vocab(db)

    improvements = []
    total_before = 0
    total_after = 0

    for r in rows:
        corrected = correct_transcript(r.transcript, vocab)
        new_wer = wer(
            r.reference_text, corrected,
            reference_transform=normalize,
            hypothesis_transform=normalize
        )
        total_before += r.wer
        total_after += new_wer

        if new_wer < r.wer:
            improvements.append({
                "accent_group": r.accent_group,
                "reference": r.reference_text,
                "before_transcript": r.transcript,
                "after_transcript": corrected,
                "before_wer": round(r.wer, 4),
                "after_wer": round(new_wer, 4)
            })

    improvements.sort(key=lambda x: x["before_wer"] - x["after_wer"], reverse=True)

    return {
        "total_samples": len(rows),
        "samples_improved": len(improvements),
        "avg_wer_before": round(total_before / len(rows), 4),
        "avg_wer_after": round(total_after / len(rows), 4),
        "top_examples": improvements[:5]
    }

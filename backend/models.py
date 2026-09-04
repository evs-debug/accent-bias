from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./accent_bias.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class TranscriptionResult(Base):
    __tablename__ = "transcription_results"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    accent_group = Column(String, index=True)
    language_code = Column(String)
    reference_text = Column(String)
    transcript = Column(String)
    wer = Column(Float)
    language_confidence = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

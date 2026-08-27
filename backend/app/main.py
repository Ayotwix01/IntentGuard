"""
FastAPI application entrypoint for IntentGuard.

Run with:
    uvicorn app.main:app --reload --port 8001
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router

app = FastAPI(
    title="IntentGuard",
    description="Intent-verification firewall for AI/automated Ethereum agents.",
    version="0.1.0",
)

# Allow the local Next.js (3000) and Vite/React (5173) dev servers to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://intent-guard-two.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
async def root():
    """Simple health check so you can confirm the server is up."""
    return {"status": "ok", "service": "IntentGuard"}

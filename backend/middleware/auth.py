import os
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth as firebase_auth
from services.firebase import _init_firebase

_security = HTTPBearer(auto_error=False)

# Routes that don't require authentication
PUBLIC_ROUTES = {
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}

SKIP_AUTH = os.getenv("ENVIRONMENT", "development") == "development"


async def verify_firebase_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> dict | None:
    """
    Dependency that verifies a Firebase ID token from the Authorization header.

    In development mode (ENVIRONMENT=development), auth is skipped and a
    mock user dict is returned so you can test endpoints without a Firebase project.

    Usage:
        @router.get("/protected")
        async def protected_route(user: dict = Depends(verify_firebase_token)):
            return {"uid": user["uid"]}
    """
    if SKIP_AUTH:
        return {"uid": "dev-user-001", "email": "dev@studybuddy.local"}

    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing. Provide a valid Firebase ID token.",
        )

    token = credentials.credentials
    try:
        _init_firebase()
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token has expired. Please sign in again.")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please sign in again.")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


# Optional: stricter dependency that always requires auth (ignores SKIP_AUTH)
async def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header required.")
    token = credentials.credentials
    try:
        _init_firebase()
        return firebase_auth.verify_id_token(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")
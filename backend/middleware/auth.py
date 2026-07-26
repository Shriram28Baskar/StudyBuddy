import os
from typing import Optional
from fastapi import Request, HTTPException, Depends, WebSocket
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth as firebase_auth
from services.firebase import _init_firebase

_security = HTTPBearer(auto_error=False)

SKIP_AUTH = os.getenv("ENVIRONMENT", "development") == "development"


async def verify_firebase_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
) -> Optional[dict]:
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


async def verify_ws_token(websocket: WebSocket, token: Optional[str] = None) -> Optional[dict]:
    """
    Verify a Firebase ID token passed as a query parameter for WebSocket connections.

    WebSocket handshakes cannot carry Authorization headers in the browser,
    so the client must pass the token as ?token=<id_token> in the WS URL.

    In development mode (ENVIRONMENT=development), auth is skipped and a
    mock user dict is returned.

    Usage inside a WebSocket endpoint:
        token: Optional[str] = Query(None)
        user = await verify_ws_token(websocket, token)
        if user is None:
            return  # connection already closed
    """
    if SKIP_AUTH:
        return {"uid": "dev-user-001", "email": "dev@studybuddy.local"}

    if not token:
        await websocket.close(code=4001, reason="Missing authentication token.")
        return None

    try:
        _init_firebase()
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except firebase_auth.ExpiredIdTokenError:
        await websocket.close(code=4001, reason="Token expired. Please sign in again.")
        return None
    except Exception:
        await websocket.close(code=4001, reason="Invalid authentication token.")
        return None
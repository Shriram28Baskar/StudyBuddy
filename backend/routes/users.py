from fastapi import APIRouter, Depends, HTTPException, Query
from middleware.auth import verify_firebase_token
from services import firebase

router = APIRouter()


@router.get('/profile')
async def get_profile(user=Depends(verify_firebase_token)):
    """Get current user's profile (generates Register ID if missing)."""
    try:
        profile = firebase.get_or_create_register_id(user['uid'])
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/search')
async def search_user(register_id: str = Query(...), user=Depends(verify_firebase_token)):
    """Search for a user by Register ID."""
    result = firebase.search_user_by_register_id(register_id)
    if not result:
        raise HTTPException(status_code=404, detail='User not found.')
    return {
        'uid': result['uid'],
        'displayName': result.get('displayName', ''),
        'registerId': result.get('registerId', ''),
        'photoURL': result.get('photoURL', ''),
    }


@router.put('/profile')
async def update_profile(data: dict, user=Depends(verify_firebase_token)):
    """Update user profile."""
    try:
        profile = firebase.update_user_profile(user['uid'], data)
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

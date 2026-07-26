from fastapi import APIRouter, Depends, HTTPException
from middleware.auth import verify_firebase_token
from services import firebase

router = APIRouter()


@router.post('/request')
async def send_request(data: dict, user=Depends(verify_firebase_token)):
    """Send a friend request by Register ID."""
    register_id = data.get('registerId', '').strip()
    if not register_id:
        raise HTTPException(status_code=400, detail='Register ID is required.')
    try:
        result = firebase.send_friend_request(user['uid'], register_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/requests/received')
async def received_requests(user=Depends(verify_firebase_token)):
    """Get pending received friend requests."""
    return firebase.get_received_friend_requests(user['uid'])


@router.get('/requests/sent')
async def sent_requests(user=Depends(verify_firebase_token)):
    """Get sent friend requests."""
    return firebase.get_sent_friend_requests(user['uid'])


@router.post('/requests/{request_id}/accept')
async def accept_request(request_id: str, user=Depends(verify_firebase_token)):
    """Accept a friend request."""
    try:
        result = firebase.accept_friend_request(request_id, user['uid'])
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post('/requests/{request_id}/reject')
async def reject_request(request_id: str, user=Depends(verify_firebase_token)):
    """Reject a friend request."""
    try:
        firebase.reject_friend_request(request_id, user['uid'])
        return {'detail': 'Request rejected.'}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get('/list')
async def list_friends(user=Depends(verify_firebase_token)):
    """List all friends."""
    return firebase.get_friends_list(user['uid'])


@router.delete('/{friendship_id}')
async def remove_friend(friendship_id: str, user=Depends(verify_firebase_token)):
    """Remove a friend."""
    try:
        firebase.remove_friend(friendship_id, user['uid'])
        return {'detail': 'Friend removed.'}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

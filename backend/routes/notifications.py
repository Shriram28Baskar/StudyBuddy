from fastapi import APIRouter, Depends, HTTPException
from middleware.auth import verify_firebase_token
from services import firebase

router = APIRouter()


@router.get('')
async def get_notifications(user=Depends(verify_firebase_token)):
    """Get user notifications."""
    return firebase.get_notifications(user['uid'])


@router.put('/read-all')
async def mark_all_read(user=Depends(verify_firebase_token)):
    """Mark all notifications as read."""
    firebase.mark_all_notifications_read(user['uid'])
    return {'detail': 'All marked as read.'}


@router.put('/{notification_id}/read')
async def mark_read(notification_id: str, user=Depends(verify_firebase_token)):
    """Mark a notification as read."""
    firebase.mark_notification_read(notification_id)
    return {'detail': 'Marked as read.'}

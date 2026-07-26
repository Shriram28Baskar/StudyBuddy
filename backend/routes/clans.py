from fastapi import APIRouter, Depends, HTTPException, Query
from middleware.auth import verify_firebase_token
from services import firebase

router = APIRouter()


@router.post('')
async def create_clan(data: dict, user=Depends(verify_firebase_token)):
    """Create a new clan."""
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    if not name:
        raise HTTPException(status_code=400, detail='Clan name is required.')
    if len(name) < 3 or len(name) > 30:
        raise HTTPException(status_code=400, detail='Clan name must be 3-30 characters.')
    if len(description) > 500:
        raise HTTPException(status_code=400, detail='Description must be under 500 characters.')
    try:
        clan = firebase.create_clan(
            leader_uid=user['uid'],
            name=name,
            description=description,
            max_members=data.get('maxMembers', 50),
            join_type=data.get('joinType', 'public'),
        )
        return clan
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get('/search')
async def search_clans(q: str = Query(''), user=Depends(verify_firebase_token)):
    """Search clans by name."""
    return firebase.search_clans(q)


@router.get('/my')
async def my_clans(user=Depends(verify_firebase_token)):
    """Get clans the user belongs to."""
    return firebase.get_user_clans(user['uid'])


@router.get('/{clan_id}')
async def get_clan(clan_id: str, user=Depends(verify_firebase_token)):
    """Get clan details."""
    clan = firebase.get_clan(clan_id)
    if not clan:
        raise HTTPException(status_code=404, detail='Clan not found.')
    return clan


@router.put('/{clan_id}')
async def update_clan(clan_id: str, data: dict, user=Depends(verify_firebase_token)):
    """Update clan details (leader only)."""
    try:
        return firebase.update_clan(clan_id, user['uid'], data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete('/{clan_id}')
async def delete_clan(clan_id: str, user=Depends(verify_firebase_token)):
    """Delete a clan (leader only)."""
    try:
        firebase.delete_clan(clan_id, user['uid'])
        return {'detail': 'Clan deleted.'}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post('/{clan_id}/join')
async def join_clan(clan_id: str, user=Depends(verify_firebase_token)):
    """Join a public clan or request to join invite-only."""
    try:
        return firebase.join_clan(clan_id, user['uid'])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get('/{clan_id}/members')
async def get_members(clan_id: str, user=Depends(verify_firebase_token)):
    """Get clan members."""
    return firebase.get_clan_members(clan_id)


@router.delete('/{clan_id}/members/{target_uid}')
async def remove_member(clan_id: str, target_uid: str, user=Depends(verify_firebase_token)):
    """Remove a member (leader/admin only)."""
    try:
        firebase.remove_clan_member(clan_id, user['uid'], target_uid)
        return {'detail': 'Member removed.'}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put('/{clan_id}/members/{target_uid}/role')
async def update_role(clan_id: str, target_uid: str, data: dict, user=Depends(verify_firebase_token)):
    """Update member role (leader only)."""
    role = data.get('role', '')
    try:
        return firebase.update_member_role(clan_id, user['uid'], target_uid, role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post('/{clan_id}/leave')
async def leave_clan(clan_id: str, user=Depends(verify_firebase_token)):
    """Leave a clan."""
    try:
        firebase.leave_clan(clan_id, user['uid'])
        return {'detail': 'Left clan.'}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post('/{clan_id}/transfer')
async def transfer_ownership(clan_id: str, data: dict, user=Depends(verify_firebase_token)):
    """Transfer clan ownership."""
    new_leader_uid = data.get('newLeaderUid', '')
    if not new_leader_uid:
        raise HTTPException(status_code=400, detail='New leader UID is required.')
    try:
        return firebase.transfer_clan_ownership(clan_id, user['uid'], new_leader_uid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get('/{clan_id}/join-requests')
async def get_join_requests(clan_id: str, user=Depends(verify_firebase_token)):
    """Get pending join requests (leader/admin only)."""
    try:
        return firebase.get_clan_join_requests(clan_id, user['uid'])
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post('/{clan_id}/join-requests/{request_id}/accept')
async def accept_join_request(clan_id: str, request_id: str, user=Depends(verify_firebase_token)):
    """Accept a join request."""
    try:
        return firebase.accept_clan_join_request(clan_id, request_id, user['uid'])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post('/{clan_id}/join-requests/{request_id}/reject')
async def reject_join_request(clan_id: str, request_id: str, user=Depends(verify_firebase_token)):
    """Reject a join request."""
    try:
        firebase.reject_clan_join_request(clan_id, request_id, user['uid'])
        return {'detail': 'Request rejected.'}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get('/{clan_id}/messages')
async def get_messages(clan_id: str, limit: int = 50, user=Depends(verify_firebase_token)):
    """Get recent clan messages."""
    return firebase.get_clan_messages(clan_id, limit)


@router.post('/{clan_id}/messages')
async def send_message(clan_id: str, data: dict, user=Depends(verify_firebase_token)):
    """Send a clan message."""
    try:
        return firebase.send_clan_message(clan_id, user['uid'], data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

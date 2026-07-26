import os
from typing import Optional, List
import firebase_admin
from firebase_admin import credentials, firestore, storage
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

_initialized = False


def _init_firebase() -> None:
    global _initialized
    if _initialized:
        return

    service_account_path = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT_PATH",
        "./serviceAccountKey.json"
    )

    if os.path.exists(service_account_path):
        # Load from JSON file (recommended for local dev)
        cred = credentials.Certificate(service_account_path)
    else:
        # Fallback: build from individual env vars
        private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
        if not private_key:
            raise RuntimeError("Firebase credentials missing. Please provide serviceAccountKey.json or set FIREBASE_PRIVATE_KEY environment variable.")
        
        cred = credentials.Certificate({
            "type":                        "service_account",
            "project_id":                  os.getenv("FIREBASE_PROJECT_ID", ""),
            "private_key_id":              os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
            "private_key":                 private_key,
            "client_email":                os.getenv("FIREBASE_CLIENT_EMAIL", ""),
            "client_id":                   os.getenv("FIREBASE_CLIENT_ID", ""),
            "auth_uri":                    "https://accounts.google.com/o/oauth2/auth",
            "token_uri":                   "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url":        "",
        })

    firebase_admin.initialize_app(
        cred,
        {"storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", "")}
    )
    _initialized = True
    print("[firebase] Firebase Admin SDK initialized")


def get_db():
    _init_firebase()
    return firestore.client()


def get_bucket():
    _init_firebase()
    return storage.bucket()


# ── Conversation history ──────────────────────────────────────────────

def save_conversation(user_id: str, messages: list, subject: str, topic: str) -> str:
    db  = get_db()
    ref = db.collection("conversations").document()
    ref.set({
        "user_id":    user_id,
        "messages":  messages,
        "subject":   subject,
        "topic":     topic,
        "timestamp": datetime.now(timezone.utc),
    })
    return ref.id


def get_conversations(user_id: str, limit: int = 20) -> list:
    db = get_db()
    docs = (
        db.collection("conversations")
        .where(filter=firestore.FieldFilter("user_id", "==", user_id))
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ── Study plans ───────────────────────────────────────────────────────

def save_study_plan(user_id: str, plan: dict) -> str:
    db = get_db()
    ref = db.collection("studyPlans").document()
    ref.set({**plan, "user_id": user_id, "created_at": datetime.now(timezone.utc)})
    return ref.id


# ── Community posts ───────────────────────────────────────────────────

def create_post(data: dict) -> str:
    db  = get_db()
    ref = db.collection("posts").document()
    ref.set({
        **data,
        "likes":        0,
        "commentCount": 0,
        "timestamp":    datetime.now(timezone.utc),
    })
    return ref.id


def get_posts(limit: int = 30) -> list:
    db   = get_db()
    docs = (
        db.collection("posts")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def like_post(post_id: str) -> None:
    db  = get_db()
    ref = db.collection("posts").document(post_id)
    ref.update({"likes": firestore.Increment(1)})


def add_comment(post_id: str, comment: dict) -> str:
    db  = get_db()
    ref = db.collection("posts").document(post_id).collection("comments").document()
    ref.set({**comment, "timestamp": datetime.now(timezone.utc)})
    db.collection("posts").document(post_id).update(
        {"commentCount": firestore.Increment(1)}
    )
    return ref.id


# ── Progress tracking ─────────────────────────────────────────────────

def save_progress_entry(user_id: str, subject: str, score: float, test_name: str) -> str:
    db  = get_db()
    ref = db.collection("progress").document()
    ref.set({
        "user_id":    user_id,
        "subject":   subject,
        "score":     score,
        "testName":  test_name,
        "timestamp": datetime.now(timezone.utc),
    })
    return ref.id


def get_progress(user_id: str, subject: Optional[str] = None) -> list:
    db    = get_db()
    query = db.collection("progress").where(filter=firestore.FieldFilter("user_id", "==", user_id))
    if subject:
        query = query.where(filter=firestore.FieldFilter("subject", "==", subject))
    docs = query.order_by("timestamp").stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ── Study plan deletion ───────────────────────────────────────────────

def delete_study_plan(plan_id: str) -> bool:
    db  = get_db()
    ref = db.collection("studyPlans").document(plan_id)
    doc = ref.get()
    if not doc.exists:
        return False
    ref.delete()
    return True


# ── Register ID ───────────────────────────────────────────────────────

def generate_register_id() -> str:
    """Generate a unique Register ID like SB-2026-000123 using atomic counter."""
    db = get_db()
    counter_ref = db.collection('counters').document('registerIdCounter')

    @firestore.transactional
    def increment_counter(transaction):
        snapshot = counter_ref.get(transaction=transaction)
        if snapshot.exists:
            current = snapshot.get('value')
        else:
            current = 0
        new_value = current + 1
        transaction.set(counter_ref, {'value': new_value})
        return new_value

    transaction = db.transaction()
    counter = increment_counter(transaction)
    year = datetime.now(timezone.utc).year
    return f"SB-{year}-{counter:06d}"


def get_or_create_register_id(uid: str, display_name: str = '', email: str = '') -> dict:
    """Get user profile, creating register ID if missing."""
    db = get_db()
    user_ref = db.collection('users').document(uid)
    user_doc = user_ref.get()

    if user_doc.exists:
        data = user_doc.to_dict()
        if 'registerId' not in data or not data.get('registerId'):
            register_id = generate_register_id()
            user_ref.update({'registerId': register_id})
            data['registerId'] = register_id
        return {**data, 'uid': uid}
    else:
        register_id = generate_register_id()
        profile = {
            'displayName': display_name,
            'email': email,
            'photoURL': '',
            'plan': 'free',
            'registerId': register_id,
            'friendCount': 0,
            'clanCount': 0,
            'createdAt': datetime.now(timezone.utc),
        }
        user_ref.set(profile)
        return {**profile, 'uid': uid}


def search_user_by_register_id(register_id: str) -> Optional[dict]:
    """Search for a user by their Register ID."""
    db = get_db()
    docs = db.collection('users').where(filter=firestore.FieldFilter('registerId', '==', register_id)).limit(1).stream()
    for d in docs:
        return {'uid': d.id, **d.to_dict()}
    return None


def get_user_profile(uid: str) -> Optional[dict]:
    """Get a user's full profile."""
    db = get_db()
    doc = db.collection('users').document(uid).get()
    if doc.exists:
        return {'uid': doc.id, **doc.to_dict()}
    return None


def update_user_profile(uid: str, data: dict) -> dict:
    """Update user profile fields."""
    db = get_db()
    allowed = {'displayName', 'photoURL'}
    filtered = {k: v for k, v in data.items() if k in allowed}
    if filtered:
        db.collection('users').document(uid).update(filtered)
    return get_user_profile(uid)


# ── Friends ───────────────────────────────────────────────────────────

def send_friend_request(from_uid: str, to_register_id: str) -> dict:
    """Send a friend request to a user by Register ID."""
    db = get_db()
    target = search_user_by_register_id(to_register_id)
    if not target:
        raise ValueError('User not found with that Register ID.')
    if target['uid'] == from_uid:
        raise ValueError('You cannot send a friend request to yourself.')

    # Check for existing pending request
    existing = db.collection('friendRequests') \
        .where(filter=firestore.FieldFilter('fromUserId', '==', from_uid)) \
        .where(filter=firestore.FieldFilter('toUserId', '==', target['uid'])) \
        .where(filter=firestore.FieldFilter('status', '==', 'pending')).limit(1).stream()
    for _ in existing:
        raise ValueError('Friend request already sent.')

    # Check if already friends
    friends = db.collection('friends').where(filter=firestore.FieldFilter('users', 'array_contains', from_uid)).stream()
    for f in friends:
        data = f.to_dict()
        if target['uid'] in data.get('users', []):
            raise ValueError('You are already friends.')

    sender = get_user_profile(from_uid)
    ref = db.collection('friendRequests').document()
    request_data = {
        'fromUserId': from_uid,
        'fromName': sender.get('displayName', '') if sender else '',
        'fromRegisterId': sender.get('registerId', '') if sender else '',
        'toUserId': target['uid'],
        'toName': target.get('displayName', ''),
        'toRegisterId': to_register_id,
        'status': 'pending',
        'createdAt': datetime.now(timezone.utc),
        'updatedAt': datetime.now(timezone.utc),
    }
    ref.set(request_data)

    create_notification(target['uid'], 'friend_request', 'New Friend Request',
        f"{sender.get('displayName', 'Someone') if sender else 'Someone'} sent you a friend request.",
        {'requestId': ref.id, 'fromUserId': from_uid})

    return {'id': ref.id, **request_data}


def get_received_friend_requests(uid: str) -> list:
    """Get pending friend requests received by a user."""
    db = get_db()
    docs = db.collection('friendRequests') \
        .where(filter=firestore.FieldFilter('toUserId', '==', uid)) \
        .where(filter=firestore.FieldFilter('status', '==', 'pending')).stream()
    res = [{'id': d.id, **d.to_dict()} for d in docs]
    res.sort(key=lambda x: x.get('createdAt') or datetime.now(timezone.utc), reverse=True)
    return res


def get_sent_friend_requests(uid: str) -> list:
    """Get friend requests sent by a user."""
    db = get_db()
    docs = db.collection('friendRequests') \
        .where(filter=firestore.FieldFilter('fromUserId', '==', uid)) \
        .where(filter=firestore.FieldFilter('status', '==', 'pending')).stream()
    res = [{'id': d.id, **d.to_dict()} for d in docs]
    res.sort(key=lambda x: x.get('createdAt') or datetime.now(timezone.utc), reverse=True)
    return res


def accept_friend_request(request_id: str, uid: str) -> dict:
    """Accept a friend request."""
    db = get_db()
    req_ref = db.collection('friendRequests').document(request_id)
    req_doc = req_ref.get()
    if not req_doc.exists:
        raise ValueError('Friend request not found.')
    req = req_doc.to_dict()
    if req['toUserId'] != uid:
        raise ValueError('Not authorized to accept this request.')
    if req['status'] != 'pending':
        raise ValueError('Request already processed.')

    req_ref.update({'status': 'accepted', 'updatedAt': datetime.now(timezone.utc)})

    friend_ref = db.collection('friends').document()
    friend_ref.set({
        'users': [req['fromUserId'], req['toUserId']],
        'user1': req['fromUserId'],
        'user2': req['toUserId'],
        'createdAt': datetime.now(timezone.utc),
    })

    db.collection('users').document(req['fromUserId']).update({'friendCount': firestore.Increment(1)})
    db.collection('users').document(req['toUserId']).update({'friendCount': firestore.Increment(1)})

    accepter = get_user_profile(uid)
    create_notification(req['fromUserId'], 'friend_accepted', 'Friend Request Accepted',
        f"{accepter.get('displayName', 'Someone') if accepter else 'Someone'} accepted your friend request.",
        {'friendshipId': friend_ref.id, 'userId': uid})

    return {'friendshipId': friend_ref.id}


def reject_friend_request(request_id: str, uid: str) -> None:
    """Reject a friend request."""
    db = get_db()
    req_ref = db.collection('friendRequests').document(request_id)
    req_doc = req_ref.get()
    if not req_doc.exists:
        raise ValueError('Friend request not found.')
    req = req_doc.to_dict()
    if req['toUserId'] != uid:
        raise ValueError('Not authorized to reject this request.')
    req_ref.update({'status': 'rejected', 'updatedAt': datetime.now(timezone.utc)})


def get_friends_list(uid: str) -> list:
    """Get all friends for a user."""
    db = get_db()
    docs = db.collection('friends').where(filter=firestore.FieldFilter('users', 'array_contains', uid)).stream()
    friends = []
    for d in docs:
        data = d.to_dict()
        friend_uid = data['user2'] if data['user1'] == uid else data['user1']
        friend_profile = get_user_profile(friend_uid)
        if friend_profile:
            friends.append({
                'friendshipId': d.id,
                'uid': friend_uid,
                'displayName': friend_profile.get('displayName', ''),
                'registerId': friend_profile.get('registerId', ''),
                'photoURL': friend_profile.get('photoURL', ''),
            })
    return friends


def remove_friend(friendship_id: str, uid: str) -> None:
    """Remove a friendship."""
    db = get_db()
    ref = db.collection('friends').document(friendship_id)
    doc = ref.get()
    if not doc.exists:
        raise ValueError('Friendship not found.')
    data = doc.to_dict()
    if uid not in data.get('users', []):
        raise ValueError('Not authorized.')
    ref.delete()
    db.collection('users').document(data['user1']).update({'friendCount': firestore.Increment(-1)})
    db.collection('users').document(data['user2']).update({'friendCount': firestore.Increment(-1)})


# ── Clans ─────────────────────────────────────────────────────────────

def create_clan(leader_uid: str, name: str, description: str, max_members: int = 50, join_type: str = 'public') -> dict:
    """Create a new clan."""
    db = get_db()
    name_lower = name.strip().lower()

    existing = db.collection('clans').where(filter=firestore.FieldFilter('nameLower', '==', name_lower)).limit(1).stream()
    for _ in existing:
        raise ValueError('A clan with this name already exists.')

    leader = get_or_create_register_id(leader_uid)
    ref = db.collection('clans').document()
    clan_data = {
        'name': name.strip(),
        'nameLower': name_lower,
        'description': description.strip(),
        'leaderId': leader_uid,
        'leaderName': leader.get('displayName', '') if leader else '',
        'joinType': join_type,
        'maxMembers': max(2, min(max_members, 100)),
        'memberCount': 1,
        'createdAt': datetime.now(timezone.utc),
        'updatedAt': datetime.now(timezone.utc),
    }
    ref.set(clan_data)

    ref.collection('members').document(leader_uid).set({
        'userId': leader_uid,
        'displayName': leader.get('displayName', '') if leader else '',
        'registerId': leader.get('registerId', '') if leader else '',
        'role': 'leader',
        'joinedAt': datetime.now(timezone.utc),
    })

    db.collection('users').document(leader_uid).update({
        'clanCount': firestore.Increment(1),
        'clans': firestore.ArrayUnion([ref.id])
    })
    return {'id': ref.id, **clan_data}


def search_clans(query: str, limit: int = 20) -> list:
    """Search clans by name (prefix match on lowercase)."""
    db = get_db()
    q = query.strip().lower()
    if not q:
        docs = db.collection('clans').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(limit).stream()
    else:
        docs = db.collection('clans').where(filter=firestore.FieldFilter('nameLower', '>=', q)).where(filter=firestore.FieldFilter('nameLower', '<=', q + '\uf8ff')).limit(limit).stream()
    return [{'id': d.id, **d.to_dict()} for d in docs]


def get_user_clans(uid: str) -> list:
    """Get all clans a user is a member of."""
    db = get_db()
    clans = []
    
    # Ensure user document is created/fetched so we have the profile & clans array
    user_profile = get_or_create_register_id(uid)
    clan_ids = user_profile.get('clans', [])
    
    # Heal/Fallback: Query clans where the user is the leader (standard query, no group index required)
    try:
        leader_clans = db.collection('clans').where(filter=firestore.FieldFilter('leaderId', '==', uid)).stream()
        updated_clans = list(clan_ids)
        needs_update = False
        for lc in leader_clans:
            if lc.id not in updated_clans:
                updated_clans.append(lc.id)
                needs_update = True
        if needs_update:
            db.collection('users').document(uid).update({'clans': updated_clans})
            clan_ids = updated_clans
    except Exception as e:
        print(f"[Warning] Failed to heal user leader clans: {e}")
        
    if clan_ids:
        for cid in clan_ids:
            role_doc = db.collection('clans').document(cid).collection('members').document(uid).get()
            role = role_doc.to_dict().get('role', 'member') if role_doc.exists else 'member'
            clan_doc = db.collection('clans').document(cid).get()
            if clan_doc.exists:
                clans.append({'id': clan_doc.id, **clan_doc.to_dict(), 'myRole': role})
        return clans
    
    # Ultimate Fallback: collection group query (catches index error safely)
    try:
        memberships = db.collection_group('members').where(filter=firestore.FieldFilter('userId', '==', uid)).stream()
        for m in memberships:
            clan_ref = m.reference.parent.parent
            clan_doc = clan_ref.get()
            if clan_doc.exists:
                clans.append({'id': clan_doc.id, **clan_doc.to_dict(), 'myRole': m.to_dict().get('role', 'member')})
        if clans:
            db.collection('users').document(uid).update({'clans': [c['id'] for c in clans]})
    except Exception as e:
        print(f"[Warning] Collection group query for user clans failed: {e}")
        
    return clans


def get_clan(clan_id: str) -> Optional[dict]:
    """Get clan details."""
    db = get_db()
    doc = db.collection('clans').document(clan_id).get()
    if doc.exists:
        return {'id': doc.id, **doc.to_dict()}
    return None


def update_clan(clan_id: str, uid: str, data: dict) -> dict:
    """Update clan details (leader only)."""
    db = get_db()
    clan = get_clan(clan_id)
    if not clan:
        raise ValueError('Clan not found.')
    if clan['leaderId'] != uid:
        raise ValueError('Only the clan leader can edit clan details.')

    allowed = {'description', 'maxMembers', 'joinType'}
    filtered = {k: v for k, v in data.items() if k in allowed}
    if 'name' in data:
        new_name = data['name'].strip()
        new_lower = new_name.lower()
        if new_lower != clan['nameLower']:
            existing = db.collection('clans').where(filter=firestore.FieldFilter('nameLower', '==', new_lower)).limit(1).stream()
            for _ in existing:
                raise ValueError('A clan with this name already exists.')
            filtered['name'] = new_name
            filtered['nameLower'] = new_lower
    filtered['updatedAt'] = datetime.now(timezone.utc)
    db.collection('clans').document(clan_id).update(filtered)
    return get_clan(clan_id)


def delete_clan(clan_id: str, uid: str) -> None:
    """Delete a clan (leader only)."""
    db = get_db()
    clan = get_clan(clan_id)
    if not clan:
        raise ValueError('Clan not found.')
    if clan['leaderId'] != uid:
        raise ValueError('Only the clan leader can delete the clan.')

    members = db.collection('clans').document(clan_id).collection('members').stream()
    for m in members:
        db.collection('users').document(m.id).update({
            'clanCount': firestore.Increment(-1),
            'clans': firestore.ArrayRemove([clan_id])
        })
        m.reference.delete()

    requests = db.collection('clans').document(clan_id).collection('joinRequests').stream()
    for r in requests:
        r.reference.delete()

    messages = db.collection('clans').document(clan_id).collection('messages').stream()
    for msg in messages:
        msg.reference.delete()

    db.collection('clans').document(clan_id).delete()


def join_clan(clan_id: str, uid: str) -> dict:
    """Join a public clan or request to join an invite-only clan."""
    db = get_db()
    clan = get_clan(clan_id)
    if not clan:
        raise ValueError('Clan not found.')

    member_doc = db.collection('clans').document(clan_id).collection('members').document(uid).get()
    if member_doc.exists:
        raise ValueError('You are already a member of this clan.')

    if clan['memberCount'] >= clan['maxMembers']:
        raise ValueError('Clan is full.')

    user = get_or_create_register_id(uid)

    if clan['joinType'] == 'public':
        db.collection('clans').document(clan_id).collection('members').document(uid).set({
            'userId': uid,
            'displayName': user.get('displayName', '') if user else '',
            'registerId': user.get('registerId', '') if user else '',
            'role': 'member',
            'joinedAt': datetime.now(timezone.utc),
        })
        db.collection('clans').document(clan_id).update({'memberCount': firestore.Increment(1)})
        db.collection('users').document(uid).update({
            'clanCount': firestore.Increment(1),
            'clans': firestore.ArrayUnion([clan_id])
        })
        return {'status': 'joined'}
    else:
        existing = db.collection('clans').document(clan_id).collection('joinRequests') \
            .where(filter=firestore.FieldFilter('userId', '==', uid)).where(filter=firestore.FieldFilter('status', '==', 'pending')).limit(1).stream()
        for _ in existing:
            raise ValueError('Join request already pending.')

        ref = db.collection('clans').document(clan_id).collection('joinRequests').document()
        ref.set({
            'userId': uid,
            'displayName': user.get('displayName', '') if user else '',
            'registerId': user.get('registerId', '') if user else '',
            'status': 'pending',
            'createdAt': datetime.now(timezone.utc),
            'reviewedBy': None,
            'reviewedAt': None,
        })

        create_notification(clan['leaderId'], 'clan_join_request', 'New Join Request',
            f"{user.get('displayName', 'Someone') if user else 'Someone'} wants to join {clan['name']}.",
            {'clanId': clan_id, 'requestId': ref.id})

        return {'status': 'requested', 'requestId': ref.id}


def get_clan_members(clan_id: str) -> list:
    """Get all members of a clan."""
    db = get_db()
    docs = db.collection('clans').document(clan_id).collection('members').order_by('joinedAt').stream()
    return [{'uid': d.id, **d.to_dict()} for d in docs]


def remove_clan_member(clan_id: str, remover_uid: str, target_uid: str) -> None:
    """Remove a member from a clan (leader/admin only)."""
    db = get_db()
    remover_doc = db.collection('clans').document(clan_id).collection('members').document(remover_uid).get()
    if not remover_doc.exists:
        raise ValueError('You are not a member of this clan.')
    remover_role = remover_doc.to_dict().get('role', 'member')
    if remover_role not in ('leader', 'admin'):
        raise ValueError('Only leaders and admins can remove members.')

    target_doc = db.collection('clans').document(clan_id).collection('members').document(target_uid).get()
    if not target_doc.exists:
        raise ValueError('Target user is not a member.')
    target_role = target_doc.to_dict().get('role', 'member')
    if target_role == 'leader':
        raise ValueError('Cannot remove the clan leader.')
    if target_role == 'admin' and remover_role != 'leader':
        raise ValueError('Only the leader can remove admins.')

    target_doc.reference.delete()
    db.collection('clans').document(clan_id).update({'memberCount': firestore.Increment(-1)})
    db.collection('users').document(target_uid).update({
        'clanCount': firestore.Increment(-1),
        'clans': firestore.ArrayRemove([clan_id])
    })


def update_member_role(clan_id: str, leader_uid: str, target_uid: str, new_role: str) -> dict:
    """Promote/demote a member (leader only for admin promotion)."""
    db = get_db()
    clan = get_clan(clan_id)
    if not clan:
        raise ValueError('Clan not found.')
    if clan['leaderId'] != leader_uid:
        raise ValueError('Only the clan leader can change roles.')
    if target_uid == leader_uid:
        raise ValueError('Cannot change your own role.')
    if new_role not in ('admin', 'member'):
        raise ValueError('Invalid role. Must be admin or member.')

    member_ref = db.collection('clans').document(clan_id).collection('members').document(target_uid)
    member_doc = member_ref.get()
    if not member_doc.exists:
        raise ValueError('User is not a member of this clan.')

    member_ref.update({'role': new_role})
    return {'uid': target_uid, 'role': new_role}


def leave_clan(clan_id: str, uid: str) -> None:
    """Leave a clan (non-leaders only)."""
    db = get_db()
    clan = get_clan(clan_id)
    if not clan:
        raise ValueError('Clan not found.')
    if clan['leaderId'] == uid:
        raise ValueError('The leader cannot leave. Transfer ownership first or delete the clan.')

    member_ref = db.collection('clans').document(clan_id).collection('members').document(uid)
    if not member_ref.get().exists:
        raise ValueError('You are not a member of this clan.')

    member_ref.delete()
    db.collection('clans').document(clan_id).update({'memberCount': firestore.Increment(-1)})
    db.collection('users').document(uid).update({
        'clanCount': firestore.Increment(-1),
        'clans': firestore.ArrayRemove([clan_id])
    })


def transfer_clan_ownership(clan_id: str, leader_uid: str, new_leader_uid: str) -> dict:
    """Transfer clan ownership to another member."""
    db = get_db()
    clan = get_clan(clan_id)
    if not clan:
        raise ValueError('Clan not found.')
    if clan['leaderId'] != leader_uid:
        raise ValueError('Only the clan leader can transfer ownership.')

    new_leader_doc = db.collection('clans').document(clan_id).collection('members').document(new_leader_uid).get()
    if not new_leader_doc.exists:
        raise ValueError('Target user is not a member of this clan.')

    new_leader = get_user_profile(new_leader_uid)

    db.collection('clans').document(clan_id).update({
        'leaderId': new_leader_uid,
        'leaderName': new_leader.get('displayName', '') if new_leader else '',
        'updatedAt': datetime.now(timezone.utc),
    })

    db.collection('clans').document(clan_id).collection('members').document(leader_uid).update({'role': 'member'})
    db.collection('clans').document(clan_id).collection('members').document(new_leader_uid).update({'role': 'leader'})

    return get_clan(clan_id)


def get_clan_join_requests(clan_id: str, uid: str) -> list:
    """Get pending join requests (leader/admin only)."""
    db = get_db()
    member_doc = db.collection('clans').document(clan_id).collection('members').document(uid).get()
    if not member_doc.exists:
        raise ValueError('You are not a member of this clan.')
    role = member_doc.to_dict().get('role', 'member')
    if role not in ('leader', 'admin'):
        raise ValueError('Only leaders and admins can view join requests.')

    docs = db.collection('clans').document(clan_id).collection('joinRequests') \
        .where(filter=firestore.FieldFilter('status', '==', 'pending')).stream()
    res = [{'id': d.id, **d.to_dict()} for d in docs]
    res.sort(key=lambda x: x.get('createdAt') or datetime.now(timezone.utc))
    return res


def accept_clan_join_request(clan_id: str, request_id: str, reviewer_uid: str) -> dict:
    """Accept a clan join request."""
    db = get_db()
    reviewer_doc = db.collection('clans').document(clan_id).collection('members').document(reviewer_uid).get()
    if not reviewer_doc.exists or reviewer_doc.to_dict().get('role') not in ('leader', 'admin'):
        raise ValueError('Not authorized to accept requests.')

    req_ref = db.collection('clans').document(clan_id).collection('joinRequests').document(request_id)
    req_doc = req_ref.get()
    if not req_doc.exists:
        raise ValueError('Join request not found.')
    req = req_doc.to_dict()
    if req['status'] != 'pending':
        raise ValueError('Request already processed.')

    clan = get_clan(clan_id)
    if clan['memberCount'] >= clan['maxMembers']:
        raise ValueError('Clan is full.')

    req_ref.update({'status': 'accepted', 'reviewedBy': reviewer_uid, 'reviewedAt': datetime.now(timezone.utc)})

    db.collection('clans').document(clan_id).collection('members').document(req['userId']).set({
        'userId': req['userId'],
        'displayName': req.get('displayName', ''),
        'registerId': req.get('registerId', ''),
        'role': 'member',
        'joinedAt': datetime.now(timezone.utc),
    })
    db.collection('clans').document(clan_id).update({'memberCount': firestore.Increment(1)})
    db.collection('users').document(req['userId']).update({
        'clanCount': firestore.Increment(1),
        'clans': firestore.ArrayUnion([clan_id])
    })

    create_notification(req['userId'], 'clan_request_accepted', 'Join Request Accepted',
        f"Your request to join {clan['name']} has been accepted!",
        {'clanId': clan_id})

    return {'status': 'accepted'}


def reject_clan_join_request(clan_id: str, request_id: str, reviewer_uid: str) -> None:
    """Reject a clan join request."""
    db = get_db()
    reviewer_doc = db.collection('clans').document(clan_id).collection('members').document(reviewer_uid).get()
    if not reviewer_doc.exists or reviewer_doc.to_dict().get('role') not in ('leader', 'admin'):
        raise ValueError('Not authorized to reject requests.')

    req_ref = db.collection('clans').document(clan_id).collection('joinRequests').document(request_id)
    req_doc = req_ref.get()
    if not req_doc.exists:
        raise ValueError('Join request not found.')
    req_ref.update({'status': 'rejected', 'reviewedBy': reviewer_uid, 'reviewedAt': datetime.now(timezone.utc)})


# ── Notifications ─────────────────────────────────────────────────────

def create_notification(user_id: str, notif_type: str, title: str, body: str, data: dict = None) -> str:
    """Create a notification for a user."""
    db = get_db()
    ref = db.collection('notifications').document()
    ref.set({
        'userId': user_id,
        'type': notif_type,
        'title': title,
        'body': body,
        'data': data or {},
        'read': False,
        'createdAt': datetime.now(timezone.utc),
    })
    return ref.id


def get_notifications(user_id: str, limit: int = 50) -> list:
    """Get notifications for a user."""
    db = get_db()
    docs = db.collection('notifications') \
        .where(filter=firestore.FieldFilter('userId', '==', user_id)).stream()
    res = [{'id': d.id, **d.to_dict()} for d in docs]
    res.sort(key=lambda x: x.get('createdAt') or datetime.now(timezone.utc), reverse=True)
    return res[:limit]


def mark_notification_read(notification_id: str) -> None:
    db = get_db()
    db.collection('notifications').document(notification_id).update({'read': True})


def mark_all_notifications_read(user_id: str) -> None:
    db = get_db()
    docs = db.collection('notifications') \
        .where(filter=firestore.FieldFilter('userId', '==', user_id)) \
        .where(filter=firestore.FieldFilter('read', '==', False)).stream()
    for d in docs:
        d.reference.update({'read': True})


def get_clan_messages(clan_id: str, limit: int = 50) -> list:
    """Get recent messages for a clan."""
    db = get_db()
    docs = db.collection('clans').document(clan_id).collection('messages') \
        .order_by('createdAt', direction=firestore.Query.DESCENDING) \
        .limit(limit).stream()
    res = [{'id': d.id, **d.to_dict()} for d in docs]
    res.reverse()
    for msg in res:
        if 'createdAt' in msg:
            if hasattr(msg['createdAt'], 'isoformat'):
                msg['createdAt'] = msg['createdAt'].isoformat()
            else:
                msg['createdAt'] = str(msg['createdAt'])
    return res


def send_clan_message(clan_id: str, sender_uid: str, msg_data: dict) -> dict:
    """Send a message to a clan."""
    db = get_db()
    sender = get_user_profile(sender_uid)
    sender_name = sender.get('displayName', '') if sender else 'Student'
    
    ref = db.collection('clans').document(clan_id).collection('messages').document()
    message = {
        'senderId': sender_uid,
        'senderName': sender_name,
        'type': msg_data.get('type', 'text'),
        'content': msg_data.get('content', ''),
        'fileUrl': msg_data.get('fileUrl'),
        'fileName': msg_data.get('fileName'),
        'fileType': msg_data.get('fileType'),
        'fileSize': msg_data.get('fileSize'),
        'duration': msg_data.get('duration'),
        'studyPlan': msg_data.get('studyPlan'),
        'createdAt': datetime.now(timezone.utc),
    }
    ref.set(message)
    return {'id': ref.id, **message, 'createdAt': message['createdAt'].isoformat()}



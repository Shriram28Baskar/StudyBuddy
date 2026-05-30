from fastapi import APIRouter, HTTPException
from models.community import PostRequest, CommentRequest
from services import firebase

router = APIRouter()


@router.post("/post")
async def create_post(req: PostRequest):
    """Create a new community post."""
    try:
        post_id = firebase.create_post({
            "userId": req.user_id,
            "title":  req.title,
            "body":   req.body,
            "tag":    req.tag,
        })
        return {"post_id": post_id, "message": "Post created successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create post: {str(e)}")


@router.get("/posts")
async def get_posts(limit: int = 30):
    """Fetch recent community posts."""
    try:
        posts = firebase.get_posts(limit=limit)
        return {"posts": posts, "count": len(posts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch posts: {str(e)}")


@router.post("/post/{post_id}/like")
async def like_post(post_id: str):
    """Increment like count on a post."""
    try:
        firebase.like_post(post_id)
        return {"message": "Post liked."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to like post: {str(e)}")


@router.post("/post/{post_id}/comment")
async def add_comment(post_id: str, req: CommentRequest):
    """Add a comment to a post."""
    try:
        comment_id = firebase.add_comment(post_id, {
            "userId": req.user_id,
            "text":   req.text,
        })
        return {"comment_id": comment_id, "message": "Comment added."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add comment: {str(e)}")


@router.get("/post/{post_id}/comments")
async def get_comments(post_id: str):
    """Get all comments for a post."""
    try:
        db   = firebase.get_db()
        docs = (
            db.collection("posts").document(post_id)
            .collection("comments")
            .order_by("timestamp")
            .stream()
        )
        comments = [{"id": d.id, **d.to_dict()} for d in docs]
        return {"comments": comments, "count": len(comments)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch comments: {str(e)}")
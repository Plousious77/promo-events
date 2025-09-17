from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import JWTError, jwt
import os
import logging
import uuid
from pathlib import Path
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

app = FastAPI(title="Glory of Elshaddai Christian Center Connect")
api_router = APIRouter(prefix="/api")

# User Role Enum
class UserRole:
    SUPER_ADMIN = "super_admin"
    GROUP_ADMIN = "group_admin"
    TEAM_LEADER = "team_leader"
    MEMBER = "member"

# Pydantic Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None
    role: str = UserRole.MEMBER

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    role: str = UserRole.MEMBER
    profile_picture: Optional[str] = None
    points: int = 0
    coins: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    profile_picture: Optional[str] = None
    points: int
    coins: int
    created_at: datetime
    is_active: bool

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    group_type: str  # Ministry, Age Group, Interest Group, etc.

class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    group_type: str
    admin_id: str
    members: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: List[str] = []  # List of user IDs
    group_id: Optional[str] = None
    points_reward: int = Field(ge=1, le=100)
    coins_reward: int = Field(ge=0)
    deadline: Optional[datetime] = None
    priority: str = "medium"  # low, medium, high

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    assigned_to: List[str] = []
    group_id: Optional[str] = None
    created_by: str
    points_reward: int
    coins_reward: int
    deadline: Optional[datetime] = None
    priority: str = "medium"
    status: str = "pending"  # pending, in_progress, completed, approved
    completed_by: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskStatusUpdate(BaseModel):
    status: str  # in_progress, completed

class MessageCreate(BaseModel):
    content: str
    group_id: Optional[str] = None
    recipient_id: Optional[str] = None  # For private messages

class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    sender_id: str
    group_id: Optional[str] = None
    recipient_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_edited: bool = False

# Helper Functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = await db.users.find_one({"email": email})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user)

def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB storage"""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
    return data

def parse_from_mongo(item):
    """Parse datetime strings back from MongoDB"""
    if isinstance(item, dict):
        for key, value in item.items():
            if key in ['created_at', 'completed_at', 'deadline'] and isinstance(value, str):
                try:
                    item[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except:
                    pass
    return item

# Authentication Routes
@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_dict = user_data.dict()
    user_dict["password"] = get_password_hash(user_data.password)
    user_obj = User(**{k: v for k, v in user_dict.items() if k != "password"})
    
    # Store in database
    user_dict_for_db = prepare_for_mongo(user_obj.dict())
    user_dict_for_db["password"] = user_dict["password"]  # Add hashed password
    
    await db.users.insert_one(user_dict_for_db)
    
    # Create token
    access_token = create_access_token(data={"sub": user_obj.email})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(**user_obj.dict())
    )

@api_router.post("/auth/login", response_model=Token)
async def login(user_credentials: UserLogin):
    user = await db.users.find_one({"email": user_credentials.email})
    if not user or not verify_password(user_credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is deactivated")
    
    access_token = create_access_token(data={"sub": user["email"]})
    
    user_obj = User(**parse_from_mongo(user))
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(**user_obj.dict())
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return UserResponse(**current_user.dict())

# User Routes
@api_router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to view users")
    
    users = await db.users.find({"is_active": True}).to_list(1000)
    return [UserResponse(**parse_from_mongo(user)) for user in users]

@api_router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, current_user: User = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(**parse_from_mongo(user))

# Group Routes
@api_router.post("/groups", response_model=Group)
async def create_group(group_data: GroupCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to create groups")
    
    group_dict = group_data.dict()
    group_dict["admin_id"] = current_user.id
    group_obj = Group(**group_dict)
    
    group_dict_for_db = prepare_for_mongo(group_obj.dict())
    await db.groups.insert_one(group_dict_for_db)
    
    return group_obj

@api_router.get("/groups", response_model=List[Group])
async def get_groups(current_user: User = Depends(get_current_user)):
    if current_user.role in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
        groups = await db.groups.find({"is_active": True}).to_list(1000)
    else:
        groups = await db.groups.find({
            "is_active": True,
            "$or": [
                {"members": current_user.id},
                {"admin_id": current_user.id}
            ]
        }).to_list(1000)
    
    return [Group(**parse_from_mongo(group)) for group in groups]

@api_router.put("/groups/{group_id}/members")
async def add_group_member(group_id: str, user_id: str, current_user: User = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN] and group["admin_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify group members")
    
    await db.groups.update_one(
        {"id": group_id},
        {"$addToSet": {"members": user_id}}
    )
    
    return {"message": "Member added successfully"}

# Task Routes
@api_router.post("/tasks", response_model=Task)
async def create_task(task_data: TaskCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN, UserRole.TEAM_LEADER]:
        raise HTTPException(status_code=403, detail="Not authorized to create tasks")
    
    task_dict = task_data.dict()
    task_dict["created_by"] = current_user.id
    task_obj = Task(**task_dict)
    
    task_dict_for_db = prepare_for_mongo(task_obj.dict())
    await db.tasks.insert_one(task_dict_for_db)
    
    return task_obj

@api_router.get("/tasks", response_model=List[Task])
async def get_tasks(current_user: User = Depends(get_current_user)):
    if current_user.role in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
        tasks = await db.tasks.find().to_list(1000)
    else:
        tasks = await db.tasks.find({
            "$or": [
                {"assigned_to": current_user.id},
                {"created_by": current_user.id}
            ]
        }).to_list(1000)
    
    return [Task(**parse_from_mongo(task)) for task in tasks]

@api_router.put("/tasks/{task_id}/status")
async def update_task_status(task_id: str, status_update: TaskStatusUpdate, current_user: User = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if user is assigned to task or is admin/leader
    if (current_user.id not in task.get("assigned_to", []) and 
        current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN, UserRole.TEAM_LEADER]):
        raise HTTPException(status_code=403, detail="Not authorized to update this task")
    
    update_data = {"status": status_update.status}
    
    # If marking as completed, add completion info
    if status_update.status == "completed":
        update_data["completed_by"] = current_user.id
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    
    return {"message": "Task status updated successfully"}

@api_router.put("/tasks/{task_id}/approve")
async def approve_task(task_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN, UserRole.TEAM_LEADER]:
        raise HTTPException(status_code=403, detail="Not authorized to approve tasks")
    
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["status"] != "completed":
        raise HTTPException(status_code=400, detail="Task must be completed before approval")
    
    # Update task status to approved
    await db.tasks.update_one({"id": task_id}, {"$set": {"status": "approved"}})
    
    # Award points and coins to the user who completed the task
    if task.get("completed_by"):
        await db.users.update_one(
            {"id": task["completed_by"]},
            {
                "$inc": {
                    "points": task["points_reward"],
                    "coins": task["coins_reward"]
                }
            }
        )
    
    return {"message": "Task approved and rewards distributed"}

# Chat Routes
@api_router.post("/messages", response_model=Message)
async def send_message(message_data: MessageCreate, current_user: User = Depends(get_current_user)):
    message_dict = message_data.dict()
    message_dict["sender_id"] = current_user.id
    message_obj = Message(**message_dict)
    
    message_dict_for_db = prepare_for_mongo(message_obj.dict())
    await db.messages.insert_one(message_dict_for_db)
    
    return message_obj

@api_router.get("/messages/group/{group_id}", response_model=List[Message])
async def get_group_messages(group_id: str, current_user: User = Depends(get_current_user)):
    # Check if user is member of the group
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if (current_user.id not in group.get("members", []) and 
        group.get("admin_id") != current_user.id and
        current_user.role not in [UserRole.SUPER_ADMIN]):
        raise HTTPException(status_code=403, detail="Not authorized to view group messages")
    
    messages = await db.messages.find({"group_id": group_id}).sort("created_at", 1).to_list(1000)
    return [Message(**parse_from_mongo(message)) for message in messages]

@api_router.get("/messages/private/{user_id}", response_model=List[Message])
async def get_private_messages(user_id: str, current_user: User = Depends(get_current_user)):
    messages = await db.messages.find({
        "$or": [
            {"sender_id": current_user.id, "recipient_id": user_id},
            {"sender_id": user_id, "recipient_id": current_user.id}
        ]
    }).sort("created_at", 1).to_list(1000)
    
    return [Message(**parse_from_mongo(message)) for message in messages]

# Dashboard/Stats Routes
@api_router.get("/stats/user")
async def get_user_stats(current_user: User = Depends(get_current_user)):
    # Get user's task completion stats
    total_tasks = await db.tasks.count_documents({"assigned_to": current_user.id})
    completed_tasks = await db.tasks.count_documents({
        "assigned_to": current_user.id,
        "status": {"$in": ["completed", "approved"]}
    })
    
    # Get recent tasks
    recent_tasks = await db.tasks.find({"assigned_to": current_user.id}).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "points": current_user.points,
        "coins": current_user.coins,
        "recent_tasks": [Task(**parse_from_mongo(task)) for task in recent_tasks]
    }

@api_router.get("/leaderboard")
async def get_leaderboard(current_user: User = Depends(get_current_user)):
    users = await db.users.find({"is_active": True}).sort("points", -1).limit(10).to_list(10)
    return [
        {
            "id": user["id"],
            "full_name": user["full_name"],
            "points": user["points"],
            "coins": user["coins"]
        }
        for user in users
    ]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
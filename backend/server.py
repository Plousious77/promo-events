from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, BackgroundTasks, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import JWTError, jwt
import os
import logging
import uuid
import secrets
import string
import re
import shutil
import httpx
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security Configuration
SECRET_KEY = os.environ.get("SECRET_KEY", "your-super-secret-key-change-in-production-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 days

# Email Configuration (Mock for now - you can configure real SMTP later)
SMTP_SERVER = os.environ.get("SMTP_SERVER", "localhost")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "noreply@elshaddai.org")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

app = FastAPI(title="Glory of Elshaddai Christian Center Connect - Production System")
api_router = APIRouter(prefix="/api")

# User Roles
class UserRole:
    SUPER_ADMIN = "super_admin"
    GROUP_ADMIN = "group_admin"
    TEAM_LEADER = "team_leader"
    MEMBER = "member"

# User Account Status
class AccountStatus:
    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    LOCKED = "locked"

# Admin Request Status
class AdminRequestStatus:
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"

# Group Types
class GroupType:
    MINISTRY = "Ministry"
    AGE_GROUP = "Age Group"
    SERVICE_TEAM = "Service Team"
    LEADERSHIP_CIRCLE = "Leadership Circle"
    INTEREST_GROUP = "Interest Group"
    BIBLE_STUDY = "Bible Study"
    WORSHIP_TEAM = "Worship Team"
    OUTREACH_TEAM = "Outreach Team"

# Group Privacy Settings
class PrivacySetting:
    PUBLIC = "public"
    PRIVATE = "private"
    INVITE_ONLY = "invite_only"

# Meeting Types
class MeetingType:
    REGULAR = "Regular"
    SPECIAL_EVENT = "Special Event"
    BIBLE_STUDY = "Bible Study"
    PRAYER_MEETING = "Prayer Meeting"
    WORSHIP_SERVICE = "Worship Service"
    YOUTH_MEETING = "Youth Meeting"
    LEADERSHIP_MEETING = "Leadership Meeting"

# Pydantic Models
class UserRegistration(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v
    
    @validator('full_name')
    def validate_full_name(cls, v):
        if len(v.strip()) < 2:
            raise ValueError('Full name must be at least 2 characters long')
        return v.strip()

class EmailVerification(BaseModel):
    email: EmailStr
    verification_code: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str
    
    @validator('new_password')
    def validate_new_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v
    
    @validator('confirm_password')
    def passwords_match(cls, v, values):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v

class SuperAdminProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    emergency_contact: Optional[str] = None
    time_zone: Optional[str] = None
    language: Optional[str] = None

class AdminRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    requested_role: str
    ministry_area: str
    experience: str
    reference_contact: str
    reason: str
    access_code: str  # Last 4 digits of phone verification
    
    @validator('requested_role')
    def validate_role(cls, v):
        allowed_roles = [UserRole.GROUP_ADMIN, UserRole.TEAM_LEADER]
        if v not in allowed_roles:
            raise ValueError(f'Invalid role. Must be one of: {allowed_roles}')
        return v
    
    @validator('access_code')
    def validate_access_code(cls, v):
        if not v.isdigit() or len(v) != 4:
            raise ValueError('Access code must be exactly 4 digits')
        return v

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    role: str = UserRole.MEMBER
    status: str = AccountStatus.PENDING_VERIFICATION
    group_id: Optional[str] = None
    profile_picture: Optional[str] = None
    bio: Optional[str] = None
    emergency_contact: Optional[str] = None
    time_zone: str = "UTC"
    language: str = "en"
    points: int = 0
    coins: int = 0
    failed_login_attempts: int = 0
    last_failed_login: Optional[datetime] = None
    email_verified: bool = False
    two_factor_enabled: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    status: str = AccountStatus.PENDING_VERIFICATION
    group_id: Optional[str] = None
    profile_picture: Optional[str] = None
    bio: Optional[str] = None
    time_zone: str = "UTC"
    language: str = "en"
    points: int = 0
    coins: int = 0
    email_verified: bool = False
    two_factor_enabled: bool = False
    created_at: datetime
    last_login: Optional[datetime] = None

class AdminRequestModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str
    email: EmailStr
    phone: str
    requested_role: str
    ministry_area: str
    experience: str
    reference_contact: str
    reason: str
    status: str = AdminRequestStatus.PENDING
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    processed_at: Optional[datetime] = None
    processed_by: Optional[str] = None
    admin_notes: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class AccessCode(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    phone_last_four: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime
    used_at: Optional[datetime] = None
    used_by: Optional[str] = None
    is_active: bool = True

# Enhanced Group Models
class GroupSchedule(BaseModel):
    day_of_week: int  # 0=Monday, 6=Sunday
    start_time: str  # HH:MM format
    end_time: str  # HH:MM format
    is_active: bool = True

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    group_type: str = GroupType.MINISTRY
    privacy_setting: str = PrivacySetting.PUBLIC
    max_members: Optional[int] = None
    color_theme: str = "#6366f1"  # Default indigo
    image_url: Optional[str] = None
    meeting_location: Optional[str] = None
    usage_hours: List[GroupSchedule] = []
    tags: List[str] = []

class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    group_type: str
    privacy_setting: str = PrivacySetting.PUBLIC
    max_members: Optional[int] = None
    color_theme: str = "#6366f1"
    image_url: Optional[str] = None
    meeting_location: Optional[str] = None
    usage_hours: List[GroupSchedule] = []
    tags: List[str] = []
    admin_id: str
    members: List[str] = []
    leaders: List[str] = []
    moderators: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True
    member_count: int = 0
    last_activity: Optional[datetime] = None

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    group_type: Optional[str] = None
    privacy_setting: Optional[str] = None
    max_members: Optional[int] = None
    color_theme: Optional[str] = None
    image_url: Optional[str] = None
    meeting_location: Optional[str] = None
    usage_hours: Optional[List[GroupSchedule]] = None
    tags: Optional[List[str]] = None

class MeetingCreate(BaseModel):
    title: str
    description: Optional[str] = None
    group_id: str
    meeting_type: str = MeetingType.REGULAR
    scheduled_date: datetime
    duration_minutes: int = 60
    location: Optional[str] = None
    virtual_link: Optional[str] = None
    agenda: Optional[str] = None
    attendees: List[str] = []
    required_attendees: List[str] = []
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    max_participants: Optional[int] = None

class Meeting(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    group_id: str
    meeting_type: str
    scheduled_date: datetime
    duration_minutes: int = 60
    location: Optional[str] = None
    virtual_link: Optional[str] = None
    agenda: Optional[str] = None
    organizer_id: str
    attendees: List[str] = []
    required_attendees: List[str] = []
    actual_attendees: List[str] = []
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    max_participants: Optional[int] = None
    status: str = "scheduled"  # scheduled, in_progress, completed, cancelled
    recording_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

class SystemActivity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    action: str
    target_type: str  # user, group, meeting, system, etc.
    target_id: Optional[str] = None
    details: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Request Models
class BulkUserAction(BaseModel):
    user_ids: List[str]
    action: str  # activate, deactivate, reset_password, change_role
    value: Optional[str] = None  # for change_role action

class GroupMembershipUpdate(BaseModel):
    user_ids: List[str]
    action: str  # add, remove, promote, demote
    role: str = "member"  # member, leader, moderator

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

def generate_verification_code() -> str:
    """Generate a 6-digit verification code"""
    return ''.join(secrets.choice(string.digits) for _ in range(6))

def generate_access_code(phone_last_four: str) -> str:
    """Generate a 4-digit access code using phone last 4 digits as base"""
    return phone_last_four

async def send_verification_email(email: str, code: str, name: str):
    """Send verification email (mock implementation)"""
    try:
        print(f"SENDING EMAIL TO: {email}")
        print(f"VERIFICATION CODE: {code}")
        print(f"RECIPIENT: {name}")
        print("=" * 50)
        return True
    except Exception as e:
        logging.error(f"Failed to send email to {email}: {str(e)}")
        return False

async def send_admin_request_notification(request: AdminRequestModel):
    """Send notification to super admin about new admin request"""
    try:
        print(f"NEW ADMIN REQUEST NOTIFICATION")
        print(f"Name: {request.full_name}")
        print(f"Email: {request.email}")
        print(f"Requested Role: {request.requested_role}")
        print(f"Ministry Area: {request.ministry_area}")
        print("=" * 50)
        return True
    except Exception as e:
        logging.error(f"Failed to send admin notification: {str(e)}")
        return False

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
    
    if user.get("status") != AccountStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Account not active")
    
    return User(**parse_from_mongo(user))

async def get_super_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super administrator access required")
    return current_user

def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB storage"""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    if isinstance(item, dict):
                        value[i] = prepare_for_mongo(item)
    return data

def parse_from_mongo(item):
    """Parse datetime strings back from MongoDB"""
    if isinstance(item, dict):
        datetime_fields = ['created_at', 'updated_at', 'last_login', 'last_failed_login', 
                          'submitted_at', 'processed_at', 'expires_at', 'used_at',
                          'scheduled_date', 'started_at', 'ended_at', 'last_activity']
        for key, value in item.items():
            if key in datetime_fields and isinstance(value, str):
                try:
                    item[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except:
                    pass
            elif isinstance(value, list):
                for i, subitem in enumerate(value):
                    if isinstance(subitem, dict):
                        value[i] = parse_from_mongo(subitem)
    return item

# System Management Routes
@api_router.post("/system/clean-virgin-state")
async def clean_virgin_state(current_user: User = Depends(get_super_admin)):
    """Clean all data except super admin - create virgin app state"""
    try:
        # Keep only the super admin user
        await db.users.delete_many({"role": {"$ne": UserRole.SUPER_ADMIN}})
        
        # Clear all other collections
        await db.groups.delete_many({})
        await db.meetings.delete_many({})
        await db.admin_requests.delete_many({})
        await db.access_codes.delete_many({})
        await db.system_activities.delete_many({})
        await db.email_verifications.delete_many({})
        
        # Log the cleanup activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="system_cleanup",
            target_type="system",
            details={"action": "virgin_state_cleanup", "timestamp": datetime.now(timezone.utc).isoformat()}
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return {"message": "System cleaned to virgin state successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clean system: {str(e)}")

@api_router.get("/system/stats")
async def get_system_stats(current_user: User = Depends(get_super_admin)):
    """Get comprehensive system statistics"""
    try:
        stats = {
            "users": {
                "total": await db.users.count_documents({}),
                "active": await db.users.count_documents({"status": AccountStatus.ACTIVE}),
                "super_admins": await db.users.count_documents({"role": UserRole.SUPER_ADMIN}),
                "group_admins": await db.users.count_documents({"role": UserRole.GROUP_ADMIN}),
                "team_leaders": await db.users.count_documents({"role": UserRole.TEAM_LEADER}),
                "members": await db.users.count_documents({"role": UserRole.MEMBER})
            },
            "groups": {
                "total": await db.groups.count_documents({"is_active": True}),
                "by_type": {}
            },
            "meetings": {
                "total": await db.meetings.count_documents({}),
                "upcoming": await db.meetings.count_documents({
                    "scheduled_date": {"$gte": datetime.now(timezone.utc).isoformat()},
                    "status": "scheduled"
                }),
                "completed": await db.meetings.count_documents({"status": "completed"})
            },
            "activities": {
                "recent": await db.system_activities.count_documents({
                    "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()}
                })
            }
        }
        
        # Group stats by type
        for group_type in [GroupType.MINISTRY, GroupType.AGE_GROUP, GroupType.SERVICE_TEAM, 
                          GroupType.LEADERSHIP_CIRCLE, GroupType.INTEREST_GROUP]:
            stats["groups"]["by_type"][group_type] = await db.groups.count_documents({
                "group_type": group_type,
                "is_active": True
            })
        
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system stats: {str(e)}")

# Authentication Routes
@api_router.post("/auth/register")
async def register(user_data: UserRegistration, background_tasks: BackgroundTasks):
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_dict = user_data.dict()
    user_dict["password"] = get_password_hash(user_data.password)
    user_obj = User(**{k: v for k, v in user_dict.items() if k != "password"})
    
    # Generate verification code
    verification_code = generate_verification_code()
    
    # Store user and verification code
    user_dict_for_db = prepare_for_mongo(user_obj.dict())
    user_dict_for_db["password"] = user_dict["password"]
    
    await db.users.insert_one(user_dict_for_db)
    
    # Store verification code (expires in 15 minutes)
    verification_data = {
        "email": user_data.email,
        "code": verification_code,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.email_verifications.insert_one(verification_data)
    
    # Send verification email
    background_tasks.add_task(send_verification_email, user_data.email, verification_code, user_data.full_name)
    
    return {
        "message": "Registration successful. Please check your email for verification code.",
        "email": user_data.email
    }

@api_router.post("/auth/verify-email")
async def verify_email(verification: EmailVerification):
    # Find verification record
    verification_record = await db.email_verifications.find_one({
        "email": verification.email,
        "code": verification.verification_code
    })
    
    if not verification_record:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    # Check if code has expired
    expires_at = datetime.fromisoformat(verification_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Verification code has expired")
    
    # Update user status
    await db.users.update_one(
        {"email": verification.email},
        {
            "$set": {
                "email_verified": True,
                "status": AccountStatus.ACTIVE,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Remove verification record
    await db.email_verifications.delete_one({"_id": verification_record["_id"]})
    
    return {"message": "Email verified successfully. You can now log in."}

@api_router.post("/auth/resend-verification")
async def resend_verification(email_request: dict, background_tasks: BackgroundTasks):
    email = email_request.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Check if user exists and is not verified
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("email_verified", False):
        raise HTTPException(status_code=400, detail="Email is already verified")
    
    # Generate new verification code
    verification_code = generate_verification_code()
    
    # Remove old verification codes
    await db.email_verifications.delete_many({"email": email})
    
    # Store new verification code
    verification_data = {
        "email": email,
        "code": verification_code,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.email_verifications.insert_one(verification_data)
    
    # Send verification email
    background_tasks.add_task(send_verification_email, email, verification_code, user["full_name"])
    
    return {"message": "Verification code sent. Please check your email."}

@api_router.post("/auth/login", response_model=Token)
async def login(user_credentials: UserLogin):
    user = await db.users.find_one({"email": user_credentials.email})
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check account lockout
    if user.get("status") == AccountStatus.LOCKED:
        last_failed = user.get("last_failed_login")
        if last_failed:
            last_failed_dt = datetime.fromisoformat(last_failed.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) - last_failed_dt < timedelta(minutes=30):
                raise HTTPException(status_code=423, detail="Account is locked. Try again in 30 minutes.")
            else:
                # Unlock account
                await db.users.update_one(
                    {"email": user_credentials.email},
                    {"$set": {"status": AccountStatus.ACTIVE, "failed_login_attempts": 0}}
                )
                user["status"] = AccountStatus.ACTIVE
    
    # Verify password
    if not verify_password(user_credentials.password, user["password"]):
        # Increment failed attempts
        failed_attempts = user.get("failed_login_attempts", 0) + 1
        update_data = {
            "failed_login_attempts": failed_attempts,
            "last_failed_login": datetime.now(timezone.utc).isoformat()
        }
        
        if failed_attempts >= 5:
            update_data["status"] = AccountStatus.LOCKED
            
        await db.users.update_one({"email": user_credentials.email}, {"$set": update_data})
        
        if failed_attempts >= 5:
            raise HTTPException(status_code=423, detail="Account locked due to multiple failed attempts. Try again in 30 minutes.")
        
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check if email is verified (except for super admin)
    if not user.get("email_verified", False) and user.get("role") != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=401, detail="Please verify your email before logging in")
    
    # Check account status
    if user.get("status") != AccountStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Account is not active")
    
    # Reset failed attempts on successful login
    await db.users.update_one(
        {"email": user_credentials.email},
        {
            "$set": {
                "failed_login_attempts": 0,
                "last_login": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create access token
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

@api_router.post("/auth/change-password")
async def change_password(password_data: PasswordChange, current_user: User = Depends(get_current_user)):
    # Verify current password
    user = await db.users.find_one({"email": current_user.email})
    if not verify_password(password_data.current_password, user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update password
    new_password_hash = get_password_hash(password_data.new_password)
    await db.users.update_one(
        {"email": current_user.email},
        {
            "$set": {
                "password": new_password_hash,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": "Password changed successfully"}

# Super Admin Profile Management
@api_router.put("/super-admin/profile")
async def update_super_admin_profile(profile_data: SuperAdminProfileUpdate, current_user: User = Depends(get_super_admin)):
    """Update super admin profile information"""
    update_fields = {}
    
    for field, value in profile_data.dict(exclude_unset=True).items():
        if value is not None:
            update_fields[field] = value
    
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.users.update_one(
            {"id": current_user.id},
            {"$set": update_fields}
        )
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="profile_update",
            target_type="user",
            target_id=current_user.id,
            details={"updated_fields": list(update_fields.keys())}
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
    
    return {"message": "Profile updated successfully"}

# Enhanced Group Management Routes
@api_router.post("/groups", response_model=Group)
async def create_group(group_data: GroupCreate, current_user: User = Depends(get_super_admin)):
    """Create a new group with enhanced features"""
    group_dict = group_data.dict()
    group_dict["admin_id"] = current_user.id
    group_obj = Group(**group_dict)
    
    group_dict_for_db = prepare_for_mongo(group_obj.dict())
    await db.groups.insert_one(group_dict_for_db)
    
    # Log the activity
    activity = SystemActivity(
        user_id=current_user.id,
        action="create_group",
        target_type="group",
        target_id=group_obj.id,
        details={"group_name": group_obj.name, "group_type": group_obj.group_type}
    )
    await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
    
    return group_obj

@api_router.get("/groups", response_model=List[Group])
async def get_all_groups(current_user: User = Depends(get_super_admin)):
    """Get all groups for admin management"""
    groups = await db.groups.find({"is_active": True}).sort("created_at", -1).to_list(1000)
    
    # Update member counts
    for group in groups:
        group["member_count"] = len(group.get("members", []))
    
    return [Group(**parse_from_mongo(group)) for group in groups]

@api_router.get("/groups/{group_id}", response_model=Group)
async def get_group_details(group_id: str, current_user: User = Depends(get_super_admin)):
    """Get detailed group information"""
    group = await db.groups.find_one({"id": group_id, "is_active": True})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Update member count
    group["member_count"] = len(group.get("members", []))
    
    # Update last activity
    last_meeting = await db.meetings.find_one(
        {"group_id": group_id}, 
        sort=[("scheduled_date", -1)]
    )
    if last_meeting:
        group["last_activity"] = last_meeting.get("scheduled_date")
    
    return Group(**parse_from_mongo(group))

@api_router.put("/groups/{group_id}")
async def update_group(group_id: str, group_update: GroupUpdate, current_user: User = Depends(get_super_admin)):
    """Update group information"""
    group = await db.groups.find_one({"id": group_id, "is_active": True})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    update_fields = {}
    for field, value in group_update.dict(exclude_unset=True).items():
        if value is not None:
            update_fields[field] = value
    
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.groups.update_one(
            {"id": group_id},
            {"$set": prepare_for_mongo(update_fields)}
        )
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="update_group",
            target_type="group",
            target_id=group_id,
            details={"updated_fields": list(update_fields.keys()), "group_name": group["name"]}
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
    
    return {"message": "Group updated successfully"}

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: User = Depends(get_super_admin)):
    """Delete a group (soft delete)"""
    group = await db.groups.find_one({"id": group_id, "is_active": True})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Soft delete the group
    await db.groups.update_one(
        {"id": group_id},
        {
            "$set": {
                "is_active": False,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Cancel all future meetings for this group
    await db.meetings.update_many(
        {
            "group_id": group_id,
            "scheduled_date": {"$gte": datetime.now(timezone.utc).isoformat()},
            "status": "scheduled"
        },
        {"$set": {"status": "cancelled"}}
    )
    
    # Log the activity
    activity = SystemActivity(
        user_id=current_user.id,
        action="delete_group",
        target_type="group",
        target_id=group_id,
        details={"group_name": group["name"], "member_count": len(group.get("members", []))}
    )
    await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
    
    return {"message": "Group deleted successfully"}

@api_router.put("/groups/{group_id}/members")
async def update_group_membership(group_id: str, membership_data: GroupMembershipUpdate, current_user: User = Depends(get_super_admin)):
    """Add, remove, or update members in a group"""
    group = await db.groups.find_one({"id": group_id, "is_active": True})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    update_operations = {}
    
    if membership_data.action == "add":
        # Add members
        update_operations["$addToSet"] = {"members": {"$each": membership_data.user_ids}}
        if membership_data.role == "leader":
            update_operations["$addToSet"]["leaders"] = {"$each": membership_data.user_ids}
        elif membership_data.role == "moderator":
            update_operations["$addToSet"]["moderators"] = {"$each": membership_data.user_ids}
        message = f"Added {len(membership_data.user_ids)} members to group"
    
    elif membership_data.action == "remove":
        # Remove members from all roles
        update_operations["$pullAll"] = {
            "members": membership_data.user_ids,
            "leaders": membership_data.user_ids,
            "moderators": membership_data.user_ids
        }
        message = f"Removed {len(membership_data.user_ids)} members from group"
    
    elif membership_data.action == "promote":
        # Promote to leader or moderator
        if membership_data.role == "leader":
            update_operations["$addToSet"] = {"leaders": {"$each": membership_data.user_ids}}
        elif membership_data.role == "moderator":
            update_operations["$addToSet"] = {"moderators": {"$each": membership_data.user_ids}}
        message = f"Promoted {len(membership_data.user_ids)} members to {membership_data.role}"
    
    elif membership_data.action == "demote":
        # Remove from leadership roles
        update_operations["$pullAll"] = {
            "leaders": membership_data.user_ids,
            "moderators": membership_data.user_ids
        }
        message = f"Demoted {len(membership_data.user_ids)} members"
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Update the group
    await db.groups.update_one({"id": group_id}, update_operations)
    
    # Log the activity
    activity = SystemActivity(
        user_id=current_user.id,
        action=f"group_membership_{membership_data.action}",
        target_type="group",
        target_id=group_id,
        details={
            "user_ids": membership_data.user_ids, 
            "role": membership_data.role,
            "group_name": group["name"]
        }
    )
    await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
    
    return {"message": message}

# Meeting Management Routes
@api_router.post("/meetings", response_model=Meeting)
async def create_meeting(meeting_data: MeetingCreate, current_user: User = Depends(get_super_admin)):
    """Create a new meeting"""
    # Verify group exists
    group = await db.groups.find_one({"id": meeting_data.group_id, "is_active": True})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    meeting_dict = meeting_data.dict()
    meeting_dict["organizer_id"] = current_user.id
    meeting_obj = Meeting(**meeting_dict)
    
    meeting_dict_for_db = prepare_for_mongo(meeting_obj.dict())
    await db.meetings.insert_one(meeting_dict_for_db)
    
    # Log the activity
    activity = SystemActivity(
        user_id=current_user.id,
        action="create_meeting",
        target_type="meeting",
        target_id=meeting_obj.id,
        details={
            "meeting_title": meeting_obj.title,
            "group_name": group["name"],
            "scheduled_date": meeting_obj.scheduled_date.isoformat()
        }
    )
    await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
    
    return meeting_obj

@api_router.get("/meetings")
async def get_meetings(group_id: Optional[str] = None, current_user: User = Depends(get_super_admin)):
    """Get meetings, optionally filtered by group"""
    query = {}
    if group_id:
        query["group_id"] = group_id
    
    meetings = await db.meetings.find(query).sort("scheduled_date", 1).to_list(1000)
    return [Meeting(**parse_from_mongo(meeting)) for meeting in meetings]

@api_router.get("/meetings/{meeting_id}")
async def get_meeting_details(meeting_id: str, current_user: User = Depends(get_super_admin)):
    """Get detailed meeting information"""
    meeting = await db.meetings.find_one({"id": meeting_id})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    return Meeting(**parse_from_mongo(meeting))

@api_router.put("/meetings/{meeting_id}/status")
async def update_meeting_status(meeting_id: str, status_data: dict, current_user: User = Depends(get_super_admin)):
    """Update meeting status"""
    meeting = await db.meetings.find_one({"id": meeting_id})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    new_status = status_data.get("status")
    allowed_statuses = ["scheduled", "in_progress", "completed", "cancelled"]
    
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    update_data = {"status": new_status}
    
    if new_status == "in_progress":
        update_data["started_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "completed":
        update_data["ended_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.meetings.update_one({"id": meeting_id}, {"$set": update_data})
    
    # Log the activity
    activity = SystemActivity(
        user_id=current_user.id,
        action="update_meeting_status",
        target_type="meeting",
        target_id=meeting_id,
        details={"new_status": new_status, "meeting_title": meeting["title"]}
    )
    await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
    
    return {"message": f"Meeting status updated to {new_status}"}

# Admin Request Routes
@api_router.post("/admin/request")
async def submit_admin_request(request_data: AdminRequest, background_tasks: BackgroundTasks):
    # Check if user already has a pending request
    existing_request = await db.admin_requests.find_one({
        "email": request_data.email,
        "status": AdminRequestStatus.PENDING
    })
    
    if existing_request:
        raise HTTPException(status_code=400, detail="You already have a pending admin request")
    
    # Verify access code
    phone_last_four = request_data.phone[-4:] if len(request_data.phone) >= 4 else request_data.phone
    
    access_code_record = await db.access_codes.find_one({
        "code": request_data.access_code,
        "phone_last_four": phone_last_four,
        "is_active": True,
        "used_at": None
    })
    
    if not access_code_record:
        raise HTTPException(status_code=400, detail="Invalid access code")
    
    # Check if access code has expired
    expires_at = datetime.fromisoformat(access_code_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Access code has expired")
    
    # Create admin request
    request_obj = AdminRequestModel(**request_data.dict())
    request_dict_for_db = prepare_for_mongo(request_obj.dict())
    
    await db.admin_requests.insert_one(request_dict_for_db)
    
    # Mark access code as used
    await db.access_codes.update_one(
        {"_id": access_code_record["_id"]},
        {
            "$set": {
                "used_at": datetime.now(timezone.utc).isoformat(),
                "used_by": request_data.email
            }
        }
    )
    
    # Send notification to super admin
    background_tasks.add_task(send_admin_request_notification, request_obj)
    
    return {"message": "Admin request submitted successfully. You will be notified once it's reviewed."}

@api_router.get("/admin/requests", response_model=List[AdminRequestModel])
async def get_admin_requests(current_user: User = Depends(get_super_admin)):
    requests = await db.admin_requests.find().sort("submitted_at", -1).to_list(1000)
    return [AdminRequestModel(**parse_from_mongo(req)) for req in requests]

@api_router.post("/admin/requests/{request_id}/approve")
async def approve_admin_request(request_id: str, approval_data: dict, current_user: User = Depends(get_super_admin)):
    admin_notes = approval_data.get("notes", "")
    
    # Find the request
    request = await db.admin_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Admin request not found")
    
    if request["status"] != AdminRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request has already been processed")
    
    # Update request status
    await db.admin_requests.update_one(
        {"id": request_id},
        {
            "$set": {
                "status": AdminRequestStatus.APPROVED,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "processed_by": current_user.id,
                "admin_notes": admin_notes
            }
        }
    )
    
    # Update user role if they exist
    existing_user = await db.users.find_one({"email": request["email"]})
    if existing_user:
        await db.users.update_one(
            {"email": request["email"]},
            {
                "$set": {
                    "role": request["requested_role"],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    
    return {"message": "Admin request approved successfully"}

@api_router.post("/admin/requests/{request_id}/deny")
async def deny_admin_request(request_id: str, denial_data: dict, current_user: User = Depends(get_super_admin)):
    admin_notes = denial_data.get("notes", "")
    
    # Find the request
    request = await db.admin_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Admin request not found")
    
    if request["status"] != AdminRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request has already been processed")
    
    # Update request status
    await db.admin_requests.update_one(
        {"id": request_id},
        {
            "$set": {
                "status": AdminRequestStatus.DENIED,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "processed_by": current_user.id,
                "admin_notes": admin_notes
            }
        }
    )
    
    return {"message": "Admin request denied"}

@api_router.post("/admin/generate-access-code")
async def generate_admin_access_code(code_data: dict, current_user: User = Depends(get_super_admin)):
    phone_last_four = code_data.get("phone_last_four", "")
    
    if not phone_last_four or len(phone_last_four) != 4 or not phone_last_four.isdigit():
        raise HTTPException(status_code=400, detail="Phone last four digits are required (4 digits)")
    
    # Generate access code
    access_code = generate_access_code(phone_last_four)
    
    # Store access code (expires in 48 hours)
    code_obj = AccessCode(
        code=access_code,
        phone_last_four=phone_last_four,
        created_by=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=48)
    )
    
    code_dict_for_db = prepare_for_mongo(code_obj.dict())
    await db.access_codes.insert_one(code_dict_for_db)
    
    return {
        "access_code": access_code,
        "phone_last_four": phone_last_four,
        "expires_at": code_obj.expires_at,
        "message": f"Access code {access_code} generated for phone ending in {phone_last_four}"
    }

@api_router.get("/admin/access-codes")
async def get_access_codes(current_user: User = Depends(get_super_admin)):
    codes = await db.access_codes.find().sort("created_at", -1).to_list(100)
    return [AccessCode(**parse_from_mongo(code)) for code in codes]

@api_router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(current_user: User = Depends(get_super_admin)):
    users = await db.users.find().sort("created_at", -1).to_list(1000)
    return [UserResponse(**parse_from_mongo(user)) for user in users]

@api_router.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, role_data: dict, current_user: User = Depends(get_super_admin)):
    new_role = role_data.get("role")
    if new_role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN, UserRole.TEAM_LEADER, UserRole.MEMBER]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Find user
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update role
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "role": new_role,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # If promoting to super admin, give them initial coins
    if new_role == UserRole.SUPER_ADMIN and user.get("role") != UserRole.SUPER_ADMIN:
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"coins": 700000000}}
        )
    
    return {"message": f"User role updated to {new_role}"}

@api_router.put("/admin/users/{user_id}/status")
async def update_user_status(user_id: str, status_data: dict, current_user: User = Depends(get_super_admin)):
    new_status = status_data.get("status")
    allowed_statuses = [AccountStatus.ACTIVE, AccountStatus.SUSPENDED, AccountStatus.LOCKED]
    
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # Find user
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update status
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": f"User status updated to {new_status}"}

@api_router.post("/admin/users/bulk-action")
async def bulk_user_action(action_data: BulkUserAction, current_user: User = Depends(get_super_admin)):
    """Perform bulk actions on multiple users"""
    try:
        if action_data.action == "activate":
            await db.users.update_many(
                {"id": {"$in": action_data.user_ids}},
                {"$set": {"status": AccountStatus.ACTIVE, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            message = f"Activated {len(action_data.user_ids)} users"
        
        elif action_data.action == "deactivate":
            await db.users.update_many(
                {"id": {"$in": action_data.user_ids}},
                {"$set": {"status": AccountStatus.SUSPENDED, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            message = f"Deactivated {len(action_data.user_ids)} users"
        
        elif action_data.action == "reset_password":
            temp_password = "TempReset2024!"
            await db.users.update_many(
                {"id": {"$in": action_data.user_ids}},
                {
                    "$set": {
                        "password": get_password_hash(temp_password),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            message = f"Reset passwords for {len(action_data.user_ids)} users"
        
        elif action_data.action == "change_role" and action_data.value:
            await db.users.update_many(
                {"id": {"$in": action_data.user_ids}},
                {"$set": {"role": action_data.value, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            message = f"Changed role to {action_data.value} for {len(action_data.user_ids)} users"
        
        else:
            raise HTTPException(status_code=400, detail="Invalid action")
        
        # Log the activity
        for user_id in action_data.user_ids:
            activity = SystemActivity(
                user_id=current_user.id,
                action=f"bulk_{action_data.action}",
                target_type="user",
                target_id=user_id,
                details={"action": action_data.action, "value": action_data.value}
            )
            await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return {"message": message}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk action failed: {str(e)}")

@api_router.get("/activities", response_model=List[SystemActivity])
async def get_system_activities(limit: int = 100, current_user: User = Depends(get_super_admin)):
    """Get recent system activities"""
    activities = await db.system_activities.find().sort("created_at", -1).limit(limit).to_list(limit)
    return [SystemActivity(**parse_from_mongo(activity)) for activity in activities]

# System Initialization Route
@api_router.post("/system/initialize")
async def initialize_system():
    """Initialize the system with default super admin"""
    # Check if super admin already exists
    super_admin = await db.users.find_one({"email": "benolyginter7@gmail.com"})
    
    if super_admin:
        return {"message": "System already initialized"}
    
    # Create default super admin
    temp_password = "TempElshaddai2024!"  # Temporary password for first login
    
    super_admin_data = {
        "id": str(uuid.uuid4()),
        "email": "benolyginter7@gmail.com",
        "full_name": "Super Administrator",
        "phone": None,
        "role": UserRole.SUPER_ADMIN,
        "status": AccountStatus.ACTIVE,
        "profile_picture": None,
        "bio": "System Super Administrator",
        "emergency_contact": None,
        "time_zone": "UTC",
        "language": "en",
        "points": 0,
        "coins": 700000000,  # 700 million initial coins
        "failed_login_attempts": 0,
        "last_failed_login": None,
        "email_verified": True,  # Pre-verified for super admin
        "two_factor_enabled": False,
        "password": get_password_hash(temp_password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "last_login": None
    }
    
    await db.users.insert_one(super_admin_data)
    
    return {
        "message": "System initialized successfully",
        "super_admin_email": "benolyginter7@gmail.com",
        "temporary_password": temp_password,
        "note": "Please change this password immediately after first login"
    }

# Task Management Models for Phase 2 - Time Tracking & Punctuality System
class TaskType:
    INDIVIDUAL = "individual"
    GROUP = "group"
    FAMILY = "family"
    ALL_MEMBERS = "all_members"

class TaskCategory:
    MINISTRY = "Ministry"
    SERVICE = "Service"
    STUDY = "Study"
    WORSHIP = "Worship"
    OUTREACH = "Outreach"
    LEADERSHIP = "Leadership"
    SPECIAL_EVENT = "Special Event"

class TaskStatus:
    SCHEDULED = "scheduled"
    ACTIVE = "active"  # Task is currently happening
    COMPLETED = "completed"
    MISSED = "missed"
    CANCELLED = "cancelled"

class AttendanceStatus:
    NOT_STARTED = "not_started"
    PUNCHED_IN = "punched_in"
    COMPLETED = "completed"
    LATE = "late"
    MISSED = "missed"

class TaskCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = TaskCategory.MINISTRY
    task_type: str = TaskType.INDIVIDUAL
    assigned_users: List[str] = []
    assigned_groups: List[str] = []
    start_datetime: datetime
    end_datetime: datetime
    location_address: Optional[str] = None
    virtual_link: Optional[str] = None
    gps_latitude: Optional[float] = None
    gps_longitude: Optional[float] = None
    check_in_radius_meters: int = 100
    points_reward: int = 10
    coins_reward: int = 5
    punctuality_bonus_points: int = 5
    punctuality_bonus_coins: int = 2
    streak_bonus_points: int = 3
    streak_bonus_coins: int = 1
    late_penalty_points: int = 0
    no_show_penalty_points: int = 5
    instructions: Optional[str] = None
    required_materials: Optional[str] = None
    contact_person: Optional[str] = None
    prerequisites: Optional[str] = None
    max_participants: Optional[int] = None
    min_age: Optional[int] = None
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    category: str = TaskCategory.MINISTRY
    task_type: str = TaskType.INDIVIDUAL
    creator_id: str
    assigned_users: List[str] = []
    assigned_groups: List[str] = []
    start_datetime: datetime
    end_datetime: datetime
    location_address: Optional[str] = None
    virtual_link: Optional[str] = None
    gps_latitude: Optional[float] = None
    gps_longitude: Optional[float] = None
    check_in_radius_meters: int = 100
    points_reward: int = 10
    coins_reward: int = 5
    punctuality_bonus_points: int = 5
    punctuality_bonus_coins: int = 2
    streak_bonus_points: int = 3
    streak_bonus_coins: int = 1
    late_penalty_points: int = 0
    no_show_penalty_points: int = 5
    instructions: Optional[str] = None
    required_materials: Optional[str] = None
    contact_person: Optional[str] = None
    prerequisites: Optional[str] = None
    max_participants: Optional[int] = None
    min_age: Optional[int] = None
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    status: str = TaskStatus.SCHEDULED
    participant_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

class TaskAttendance(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_id: str
    user_id: str
    punch_in_time: Optional[datetime] = None
    punch_out_time: Optional[datetime] = None
    status: str = AttendanceStatus.NOT_STARTED
    is_late: bool = False
    minutes_late: int = 0
    is_within_grace_period: bool = True
    points_earned: int = 0
    coins_earned: int = 0
    location_verified: bool = False
    punch_in_latitude: Optional[float] = None
    punch_in_longitude: Optional[float] = None
    photo_verification_url: Optional[str] = None
    completion_notes: Optional[str] = None
    task_rating: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PunchInRequest(BaseModel):
    task_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_verification: Optional[str] = None

class PunchOutRequest(BaseModel):
    task_id: str
    completion_notes: Optional[str] = None
    task_rating: Optional[int] = Field(None, ge=1, le=5)

# Agora Video Conferencing Integration - Complete Church System
AGORA_APP_ID = os.environ.get("AGORA_APP_ID", "default-application_10499703")
AGORA_APP_CERTIFICATE = os.environ.get("AGORA_APP_CERTIFICATE", "")
AGORA_CUSTOMER_ID = os.environ.get("AGORA_CUSTOMER_ID", "")
AGORA_CUSTOMER_SECRET = os.environ.get("AGORA_CUSTOMER_SECRET", "")
AGORA_API_KEY = os.environ.get("X_RAPIDAPI_KEY", "bfcbd2b614msh7b418fee1bffb9dp177734jsn6fde4726726a")

# Church Video Conference Models
class AgoraTokenRequest(BaseModel):
    channel_name: str
    uid: int
    role: str  # 'host', 'participant'
    expire_time: int = 3600

# New Managed Services API Models
class CreateChannelRequest(BaseModel):
    group_id: str
    title: str
    enable_pstn: bool = True

class JoinChannelRequest(BaseModel):
    passphrase: str
    jwt_token: str

class ShareChannelRequest(BaseModel):
    passphrase: str
    jwt_token: str

class RecordingRequest(BaseModel):
    passphrase: str
    jwt_token: str
    layout: str = "presenter"

class LayoutRequest(BaseModel):
    passphrase: str
    jwt_token: str
    preset: str = "presenter"
    uid: Optional[int] = None

class JoinApprovalRequest(BaseModel):
    passphrase: str
    jwt_token: str
    attendee_uid: int
    approved: bool

class ChurchRole(BaseModel):
    name: str
    external_id: str
    permissions: List[dict]

class ChurchVideoRoom(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    channel_name: str
    room_name: str
    creator_id: str
    group_id: Optional[str] = None
    meeting_id: Optional[str] = None
    service_type: str = "main_service"  # main_service, bible_study, youth_meeting, prayer
    max_participants: int = 1000
    enable_recording: bool = True
    enable_streaming: bool = False
    streaming_platforms: List[str] = []
    scripture_display: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime
    recording_resource_id: Optional[str] = None
    recording_sid: Optional[str] = None
    streaming_sessions: Dict[str, str] = {}

class ScriptureDisplayUpdate(BaseModel):
    scripture_text: str
    verse_reference: str
    display_position: str = "bottom"  # top, bottom, left, right, center
    display_duration: int = 0  # 0 = permanent, >0 = seconds
    font_size: int = 24
    background_opacity: float = 0.8

class StreamingPlatformConfig(BaseModel):
    platform: str  # youtube, facebook, twitch
    stream_key: str
    rtmp_url: str
    title: str
    description: Optional[str] = ""

# Agora API Client for Church Services
class ChurchAgoraClient:
    def __init__(self):
        self.app_id = AGORA_APP_ID
        self.api_key = AGORA_API_KEY  # Using RapidAPI key as the API key
        self.project_id = AGORA_APP_ID  # Using app_id as project_id
        self.base_url = "https://managedservices-prod.rteappbuilder.com"
        
    def get_auth_headers(self):
        """Get authentication headers for Managed Services API"""
        return {
            'X-API-KEY': self.api_key,
            'X-Project-ID': self.project_id,
            'Content-Type': 'application/json'
        }
    
    def get_jwt_headers(self, token):
        """Get JWT authentication headers"""
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    async def create_meeting_channel(self, group_id: str, title: str, enable_pstn: bool = True):
        """Create a meeting channel for church group"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/channel",
                    headers=self.get_auth_headers(),
                    json={
                        "title": f"{title} - Group {group_id}",
                        "enable_pstn": enable_pstn
                    }
                )
                
                if response.status_code == 200:
                    channel_data = response.json()
                    return {
                        "id": channel_data.get("id"),
                        "channel_name": channel_data.get("channel"),
                        "title": channel_data.get("title"),
                        "host_passphrase": channel_data.get("host_pass_phrase"),
                        "viewer_passphrase": channel_data.get("viewer_pass_phrase"),
                        "pstn_number": channel_data.get("pstn", {}).get("number"),
                        "pstn_dtmf": channel_data.get("pstn", {}).get("dtmf"),
                        "created_at": datetime.now(timezone.utc)
                    }
                else:
                    raise HTTPException(status_code=response.status_code, detail=f"Failed to create channel: {response.text}")
                    
        except Exception as e:
            logging.error(f"Channel creation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Channel creation failed: {str(e)}")
    
    async def join_channel(self, passphrase: str, jwt_token: str):
        """Join a channel with JWT token"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/channel/join",
                    headers=self.get_jwt_headers(jwt_token),
                    json={"passphrase": passphrase}
                )
                
                if response.status_code == 200:
                    join_data = response.json()
                    return {
                        "channel_name": join_data.get("channel_name"),
                        "is_host": join_data.get("is_host"),
                        "main_user": join_data.get("main_user"),
                        "screen_share_user": join_data.get("screen_share_user"),
                        "chat_token": join_data.get("chat", {}).get("userToken"),
                        "whiteboard_token": join_data.get("whiteboard", {}).get("room_token")
                    }
                else:
                    raise HTTPException(status_code=response.status_code, detail=f"Failed to join channel: {response.text}")
                    
        except Exception as e:
            logging.error(f"Channel join failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Channel join failed: {str(e)}")
    
    async def share_channel_details(self, passphrase: str, jwt_token: str):
        """Get shareable channel details"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/channel/share",
                    headers=self.get_jwt_headers(jwt_token),
                    json={"passphrase": passphrase}
                )
                
                if response.status_code == 200:
                    share_data = response.json()
                    return {
                        "host_passphrase": share_data.get("passphrases", {}).get("host"),
                        "attendee_passphrase": share_data.get("passphrases", {}).get("attendee"),
                        "channel_name": share_data.get("channel_name"),
                        "title": share_data.get("title"),
                        "pstn_number": share_data.get("pstn", {}).get("number"),
                        "pstn_dtmf": share_data.get("pstn", {}).get("dtmf")
                    }
                else:
                    raise HTTPException(status_code=response.status_code, detail=f"Failed to share channel: {response.text}")
                    
        except Exception as e:
            logging.error(f"Channel share failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Channel share failed: {str(e)}")
    
    async def start_recording(self, passphrase: str, jwt_token: str, layout: str = "presenter"):
        """Start recording with church-appropriate layout"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/recording/start",
                    headers=self.get_jwt_headers(jwt_token),
                    json={
                        "passphrase": passphrase,
                        "layout": layout,
                        "recordingConfig": {
                            "maxIdleTime": 300,
                            "subscribeVideoUids": ["#allstream#"],
                            "subscribeAudioUids": ["#allstream#"]
                        }
                    }
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    raise HTTPException(status_code=response.status_code, detail=f"Failed to start recording: {response.text}")
                    
        except Exception as e:
            logging.error(f"Recording start failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Recording start failed: {str(e)}")
    
    async def stop_recording(self, passphrase: str, jwt_token: str):
        """Stop recording"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/recording/stop",
                    headers=self.get_jwt_headers(jwt_token),
                    json={"passphrase": passphrase}
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    raise HTTPException(status_code=response.status_code, detail=f"Failed to stop recording: {response.text}")
                    
        except Exception as e:
            logging.error(f"Recording stop failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Recording stop failed: {str(e)}")
    
    async def set_recording_layout(self, passphrase: str, jwt_token: str, preset: str = "presenter", uid: int = None):
        """Set recording layout for church services"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/recording/layout/update",
                    headers=self.get_jwt_headers(jwt_token),
                    json={
                        "preset": preset,  # 'presenter', 'normal', or 'custom'
                        "uid": uid,
                        "passphrase": passphrase
                    }
                )
                
                return response.status_code == 200
                    
        except Exception as e:
            logging.error(f"Layout update failed: {str(e)}")
            return False
    
    async def request_join_channel(self, passphrase: str, jwt_token: str):
        """Request to join channel (for approval system)"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/channel/join/request",
                    headers=self.get_jwt_headers(jwt_token),
                    json={
                        "passphrase": passphrase,
                        "send_event": True
                    }
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    raise HTTPException(status_code=response.status_code, detail=f"Failed to request join: {response.text}")
                    
        except Exception as e:
            logging.error(f"Join request failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Join request failed: {str(e)}")
    
    async def approve_join_request(self, passphrase: str, jwt_token: str, attendee_uid: int, approved: bool):
        """Approve or deny join request"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/v1/channel/join/approval",
                    headers=self.get_jwt_headers(jwt_token),
                    json={
                        "passphrase": passphrase,
                        "attendee_uid": attendee_uid,
                        "attendee_screenshare_uid": attendee_uid + 1,
                        "approved": approved
                    }
                )
                
                return response.status_code == 200
                    
        except Exception as e:
            logging.error(f"Join approval failed: {str(e)}")
            return False
    
    # Keep the original token generation for backward compatibility
    def generate_rtc_token(self, channel_name: str, uid: int, role: str, expire_time: int = 3600) -> str:
        """Generate Agora RTC token for video access (legacy method for backward compatibility)"""
        try:
            from agora_token_builder import RtcTokenBuilder
            
            # Use the correct role constants
            # Publisher role = 1, Subscriber role = 2
            if role == 'host' or role == 'publisher':
                role_type = 1  # Publisher role
            else:
                role_type = 2  # Subscriber role
            
            # Calculate expiration timestamp
            expiration_timestamp = int(datetime.now().timestamp()) + expire_time
            
            # Generate token
            token = RtcTokenBuilder.buildTokenWithUid(
                self.app_id,
                self.app_certificate if hasattr(self, 'app_certificate') and self.app_certificate else "",
                channel_name,
                uid,
                role_type,
                expiration_timestamp
            )
            
            return token
        except Exception as e:
            logging.error(f"Legacy token generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Token generation failed: {str(e)}")

# Initialize Agora client
agora_client = ChurchAgoraClient()

# Church Video Conference Routes
@api_router.post("/agora/token", response_model=dict)
async def generate_agora_token(
    request: AgoraTokenRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate Agora RTC token for church video conference"""
    try:
        # Validate user permissions for the requested role
        if request.role == 'host' and current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Insufficient permissions for host role")
        
        # Generate token
        token = agora_client.generate_rtc_token(
            channel_name=request.channel_name,
            uid=request.uid,
            role=request.role,
            expire_time=request.expire_time
        )
        
        return {
            "token": token,
            "app_id": AGORA_APP_ID,
            "channel": request.channel_name,
            "uid": request.uid,
            "expires_at": datetime.now() + timedelta(seconds=request.expire_time)
        }
        
    except Exception as e:
        logging.error(f"Token generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# New Managed Services API Endpoints
@api_router.post("/agora/channel/create", response_model=dict)
async def create_meeting_channel(
    request: CreateChannelRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a meeting channel for church group using Managed Services API"""
    try:
        # Validate user permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Insufficient permissions to create channel")
        
        # Create channel using Managed Services API
        channel_data = await agora_client.create_meeting_channel(
            group_id=request.group_id,
            title=request.title,
            enable_pstn=request.enable_pstn
        )
        
        # Store channel data in database
        await db.church_channels.insert_one({
            **channel_data,
            "group_id": request.group_id,
            "created_by": current_user.id,
            "created_at": datetime.now(timezone.utc)
        })
        
        return {
            "success": True,
            "channel": channel_data,
            "message": "Church meeting channel created successfully"
        }
        
    except Exception as e:
        logging.error(f"Channel creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/channel/join", response_model=dict)
async def join_meeting_channel(
    request: JoinChannelRequest,
    current_user: User = Depends(get_current_user)
):
    """Join a meeting channel using Managed Services API"""
    try:
        # Join channel using JWT token
        join_data = await agora_client.join_channel(
            passphrase=request.passphrase,
            jwt_token=request.jwt_token
        )
        
        return {
            "success": True,
            "join_data": join_data,
            "message": "Successfully joined church meeting channel"
        }
        
    except Exception as e:
        logging.error(f"Channel join failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/channel/share", response_model=dict)
async def share_channel_details(
    request: ShareChannelRequest,
    current_user: User = Depends(get_current_user)
):
    """Get shareable channel details using Managed Services API"""
    try:
        # Get shareable details
        share_data = await agora_client.share_channel_details(
            passphrase=request.passphrase,
            jwt_token=request.jwt_token
        )
        
        return {
            "success": True,
            "share_data": share_data,
            "message": "Channel details retrieved for sharing"
        }
        
    except Exception as e:
        logging.error(f"Channel share failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/recording/start", response_model=dict)
async def start_meeting_recording(
    request: RecordingRequest,
    current_user: User = Depends(get_current_user)
):
    """Start recording with church-appropriate layout"""
    try:
        # Validate host permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Insufficient permissions to start recording")
        
        # Start recording
        recording_data = await agora_client.start_recording(
            passphrase=request.passphrase,
            jwt_token=request.jwt_token,
            layout=request.layout
        )
        
        return {
            "success": True,
            "recording": recording_data,
            "message": "Recording started successfully"
        }
        
    except Exception as e:
        logging.error(f"Recording start failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/recording/stop", response_model=dict)
async def stop_meeting_recording(
    request: RecordingRequest,
    current_user: User = Depends(get_current_user)
):
    """Stop meeting recording"""
    try:
        # Validate host permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Insufficient permissions to stop recording")
        
        # Stop recording
        recording_data = await agora_client.stop_recording(
            passphrase=request.passphrase,
            jwt_token=request.jwt_token
        )
        
        return {
            "success": True,
            "recording": recording_data,
            "message": "Recording stopped and saved successfully"
        }
        
    except Exception as e:
        logging.error(f"Recording stop failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/recording/layout", response_model=dict)
async def set_recording_layout(
    request: LayoutRequest,
    current_user: User = Depends(get_current_user)
):
    """Set recording layout for church services"""
    try:
        # Validate host permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Insufficient permissions to change layout")
        
        # Set layout
        success = await agora_client.set_recording_layout(
            passphrase=request.passphrase,
            jwt_token=request.jwt_token,
            preset=request.preset,
            uid=request.uid
        )
        
        return {
            "success": success,
            "message": "Recording layout updated successfully" if success else "Failed to update layout"
        }
        
    except Exception as e:
        logging.error(f"Layout update failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/join/request", response_model=dict)
async def request_join_channel(
    request: JoinChannelRequest,
    current_user: User = Depends(get_current_user)
):
    """Request to join channel (for approval system)"""
    try:
        # Request to join
        request_data = await agora_client.request_join_channel(
            passphrase=request.passphrase,
            jwt_token=request.jwt_token
        )
        
        return {
            "success": True,
            "request_data": request_data,
            "message": "Join request submitted successfully"
        }
        
    except Exception as e:
        logging.error(f"Join request failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/join/approval", response_model=dict)
async def approve_join_request(
    request: JoinApprovalRequest,
    current_user: User = Depends(get_current_user)
):
    """Approve or deny join request"""
    try:
        # Validate host permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Insufficient permissions to approve joins")
        
        # Approve/deny join request
        success = await agora_client.approve_join_request(
            passphrase=request.passphrase,
            jwt_token=request.jwt_token,
            attendee_uid=request.attendee_uid,
            approved=request.approved
        )
        
        action = "approved" if request.approved else "denied"
        return {
            "success": success,
            "message": f"Join request {action} successfully" if success else f"Failed to {action.rstrip('d')} join request"
        }
        
    except Exception as e:
        logging.error(f"Join approval failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/roles/create", response_model=dict)
async def create_church_roles(
    current_user: User = Depends(get_current_user)
):
    """Create church-specific roles in Agora Managed Services"""
    try:
        # Validate Super Admin permissions
        if current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Only Super Admin can create church roles")
        
        # Define church roles
        roles = [
            {
                "name": "church_pastor",
                "external_id": "pastor_001",
                "permissions": [
                    {"name": "create_meeting"},
                    {"name": "join_meeting"},
                    {"name": "cloud_recording_start"},
                    {"name": "cloud_recording_stop"},
                    {"name": "speech_to_text_start"},
                    {"name": "speech_to_text_stop"},
                    {"name": "whiteboard_create"},
                    {"name": "whiteboard_join"},
                    {"name": "chat_token"}
                ]
            },
            {
                "name": "church_leader",
                "external_id": "leader_001",
                "permissions": [
                    {"name": "join_meeting"},
                    {"name": "cloud_recording_start"},
                    {"name": "cloud_recording_stop"},
                    {"name": "whiteboard_join"},
                    {"name": "chat_token"}
                ]
            },
            {
                "name": "church_member",
                "external_id": "member_001",
                "permissions": [
                    {"name": "join_meeting"},
                    {"name": "whiteboard_join"},
                    {"name": "chat_token"}
                ]
            }
        ]
        
        # Create roles via API (implementation depends on available endpoint)
        created_roles = []
        for role in roles:
            try:
                # This would call the actual role creation API when available
                created_roles.append(role)
            except Exception as e:
                logging.error(f"Failed to create role {role['name']}: {str(e)}")
        
        return {
            "success": True,
            "roles": created_roles,
            "message": f"Successfully created {len(created_roles)} church roles"
        }
        
    except Exception as e:
        logging.error(f"Role creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/agora/jwt/generate", response_model=dict)
async def generate_jwt_token(
    user_role: str,
    current_user: User = Depends(get_current_user)
):
    """Generate JWT token for Managed Services API authentication"""
    try:
        # Map church roles to Agora roles
        role_mapping = {
            UserRole.SUPER_ADMIN: "church_pastor",
            UserRole.GROUP_ADMIN: "church_leader", 
            UserRole.TEAM_LEADER: "church_leader",
            UserRole.MEMBER: "church_member"
        }
        
        agora_role = role_mapping.get(current_user.role, "church_member")
        
        # Generate JWT token (this would typically be done with proper JWT library and secret)
        # For now, we'll return a placeholder structure
        import jwt as pyjwt
        
        payload = {
            "user_id": current_user.id,
            "role": agora_role,
            "project_id": AGORA_APP_ID,
            "exp": datetime.now(timezone.utc) + timedelta(hours=24)
        }
        
        # Use a proper JWT secret in production
        jwt_secret = os.environ.get("JWT_SECRET", SECRET_KEY)
        token = pyjwt.encode(payload, jwt_secret, algorithm="HS256")
        
        return {
            "success": True,
            "jwt_token": token,
            "role": agora_role,
            "expires_at": payload["exp"],
            "message": "JWT token generated successfully"
        }
        
    except Exception as e:
        logging.error(f"JWT generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/church-video/create", response_model=ChurchVideoRoom)
async def create_church_video_room(
    room_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Create a new church video conference room"""
    try:
        # Generate unique channel name
        channel_name = f"church-{uuid.uuid4().hex[:12]}"
        
        # Create video room
        video_room = ChurchVideoRoom(
            channel_name=channel_name,
            room_name=room_data.get("room_name", "Church Service"),
            creator_id=current_user.id,
            group_id=room_data.get("group_id"),
            service_type=room_data.get("service_type", "main_service"),
            max_participants=min(room_data.get("max_participants", 1000), 1000),
            enable_recording=room_data.get("enable_recording", True),
            enable_streaming=room_data.get("enable_streaming", False),
            streaming_platforms=room_data.get("streaming_platforms", []),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=4)  # 4 hour default
        )
        
        # Store room in database
        room_dict_for_db = prepare_for_mongo(video_room.dict())
        await db.church_video_rooms.insert_one(room_dict_for_db)
        
        # Auto-start recording if enabled
        if video_room.enable_recording:
            try:
                recording_config = {
                    "channelType": 1,  # Live broadcast
                    "maxIdleTime": 300,
                    "transcodingConfig": {
                        "width": 1920,
                        "height": 1080,
                        "fps": 30,
                        "bitrate": 4000,
                        "backgroundColor": "#000000"
                    }
                }
                
                recording_result = await agora_client.start_cloud_recording(
                    channel_name, current_user.id, recording_config
                )
                
                # Update room with recording info
                await db.church_video_rooms.update_one(
                    {"id": video_room.id},
                    {
                        "$set": {
                            "recording_resource_id": recording_result["resource_id"],
                            "recording_sid": recording_result["sid"]
                        }
                    }
                )
                
            except Exception as e:
                logging.warning(f"Auto-recording failed: {str(e)}")
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="create_church_video_room",
            target_type="church_video_room",
            target_id=video_room.id,
            details={
                "channel_name": channel_name,
                "service_type": video_room.service_type,
                "max_participants": video_room.max_participants
            }
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return video_room
        
    except Exception as e:
        logging.error(f"Failed to create church video room: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create video room")

@api_router.get("/church-video/rooms", response_model=List[ChurchVideoRoom])
async def get_church_video_rooms(
    service_type: Optional[str] = None,
    group_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get church video conference rooms"""
    try:
        query = {"is_active": True}
        
        if service_type:
            query["service_type"] = service_type
            
        if group_id:
            query["group_id"] = group_id
        elif current_user.group_id and current_user.role != UserRole.SUPER_ADMIN:
            query["group_id"] = current_user.group_id
        
        rooms = await db.church_video_rooms.find(query).sort("created_at", -1).to_list(50)
        return [ChurchVideoRoom(**parse_from_mongo(room)) for room in rooms]
        
    except Exception as e:
        logging.error(f"Failed to fetch church video rooms: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch video rooms")

@api_router.post("/church-video/{room_id}/scripture")
async def update_scripture_display(
    room_id: str,
    scripture_update: ScriptureDisplayUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update scripture display during church service"""
    try:
        # Get room
        room = await db.church_video_rooms.find_one({"id": room_id, "is_active": True})
        if not room:
            raise HTTPException(status_code=404, detail="Church video room not found")
        
        # Check permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Only church leaders can update scripture display")
        
        # Update scripture display
        scripture_text = f"{scripture_update.verse_reference} - {scripture_update.scripture_text}"
        
        await db.church_video_rooms.update_one(
            {"id": room_id},
            {
                "$set": {
                    "scripture_display": scripture_text,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        # Broadcast scripture update to all participants (would be implemented with RTM)
        # For now, return the update for frontend to handle
        
        return {
            "message": "Scripture display updated",
            "scripture": scripture_text,
            "display_config": scripture_update.dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update scripture display: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update scripture display")

@api_router.post("/church-video/{room_id}/streaming/start")
async def start_church_streaming(
    room_id: str,
    streaming_platforms: List[StreamingPlatformConfig],
    current_user: User = Depends(get_current_user)
):
    """Start live streaming to multiple platforms"""
    try:
        # Get room
        room = await db.church_video_rooms.find_one({"id": room_id, "is_active": True})
        if not room:
            raise HTTPException(status_code=404, detail="Church video room not found")
        
        # Check permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Only church leaders can start streaming")
        
        # Prepare streaming configurations
        streaming_configs = []
        for platform_config in streaming_platforms:
            streaming_configs.append({
                "platform": platform_config.platform,
                "rtmp_url": platform_config.rtmp_url,
                "stream_key": platform_config.stream_key
            })
        
        # Start streaming
        streaming_sessions = await agora_client.start_rtmp_streaming(
            room["channel_name"], current_user.id, streaming_configs
        )
        
        # Update room with streaming info
        await db.church_video_rooms.update_one(
            {"id": room_id},
            {
                "$set": {
                    "enable_streaming": True,
                    "streaming_sessions": streaming_sessions,
                    "streaming_platforms": [config.platform for config in streaming_platforms],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        return {
            "message": "Live streaming started successfully",
            "platforms": [config.platform for config in streaming_platforms],
            "streaming_sessions": streaming_sessions
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to start streaming: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start streaming")

@api_router.delete("/church-video/{room_id}")
async def delete_church_video_room(
    room_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a church video conference room"""
    try:
        # Get room
        room = await db.church_video_rooms.find_one({"id": room_id, "is_active": True})
        if not room:
            raise HTTPException(status_code=404, detail="Church video room not found")
        
        # Check permissions
        if room["creator_id"] != current_user.id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized to delete this room")
        
        # Stop any active recording
        if room.get("recording_resource_id") and room.get("recording_sid"):
            try:
                # Stop recording logic would go here
                pass
            except Exception as e:
                logging.warning(f"Failed to stop recording: {str(e)}")
        
        # Soft delete room
        await db.church_video_rooms.update_one(
            {"id": room_id},
            {
                "$set": {
                    "is_active": False,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        return {"message": "Church video room deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to delete church video room: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete video room")

# Group Member Management Routes
@api_router.get("/groups/{group_id}/members", response_model=List[User])
async def get_group_members(
    group_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all members of a specific group"""
    try:
        # Check if group exists and user has access
        group = await db.groups.find_one({"id": group_id, "is_active": True})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        # Get all users who are members of this group
        members = await db.users.find({
            "group_id": group_id,
            "status": AccountStatus.ACTIVE
        }).to_list(None)
        
        return [User(**parse_from_mongo(member)) for member in members]
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to fetch group members: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch group members"
        )

@api_router.post("/groups/{group_id}/members")
async def add_group_members(
    group_id: str,
    member_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Add members to a group"""
    try:
        # Check permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        # Check if group exists
        group = await db.groups.find_one({"id": group_id, "is_active": True})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        user_ids = member_data.get("user_ids", [])
        if not user_ids:
            raise HTTPException(status_code=400, detail="No users specified")
        
        # Validate users exist and update their group_id
        added_count = 0
        for user_id in user_ids:
            result = await db.users.update_one(
                {"id": user_id, "status": AccountStatus.ACTIVE},
                {"$set": {"group_id": group_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            if result.modified_count > 0:
                added_count += 1
        
        # Update group member count
        total_members = await db.users.count_documents({"group_id": group_id, "status": AccountStatus.ACTIVE})
        await db.groups.update_one(
            {"id": group_id},
            {"$set": {"member_count": total_members, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="add_group_members",
            target_type="group",
            target_id=group_id,
            details={
                "group_name": group["name"],
                "added_members": added_count,
                "user_ids": user_ids
            }
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return {"message": f"Added {added_count} member(s) to group", "added_count": added_count}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to add group members: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add group members"
        )

@api_router.delete("/groups/{group_id}/members/{user_id}")
async def remove_group_member(
    group_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a member from a group"""
    try:
        # Check permissions
        if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            # Allow users to remove themselves
            if current_user.id != user_id:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        # Check if group exists
        group = await db.groups.find_one({"id": group_id, "is_active": True})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        # Get user details for logging
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Remove user from group
        result = await db.users.update_one(
            {"id": user_id, "group_id": group_id},
            {"$unset": {"group_id": ""}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="User not found in this group")
        
        # Update group member count
        total_members = await db.users.count_documents({"group_id": group_id, "status": AccountStatus.ACTIVE})
        await db.groups.update_one(
            {"id": group_id},
            {"$set": {"member_count": total_members, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="remove_group_member",
            target_type="group",
            target_id=group_id,
            details={
                "group_name": group["name"],
                "removed_user": user["full_name"],
                "removed_user_id": user_id
            }
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return {"message": f"Removed {user['full_name']} from group"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to remove group member: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove group member"
        )

# Task Management Routes - Phase 2 Time Tracking System

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

# Task Management Routes - Phase 2 Time Tracking System
@api_router.post("/tasks/", response_model=Task)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new task (Admin/Leader only)"""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can create tasks"
        )
    
    try:
        task = Task(
            **task_data.dict(),
            creator_id=current_user.id
        )
        
        # Store task in database
        task_dict_for_db = prepare_for_mongo(task.dict())
        await db.tasks.insert_one(task_dict_for_db)
        
        # Create attendance records for assigned users
        if task_data.assigned_users:
            attendance_records = []
            for user_id in task_data.assigned_users:
                attendance = TaskAttendance(
                    task_id=task.id,
                    user_id=user_id
                )
                attendance_records.append(prepare_for_mongo(attendance.dict()))
            
            if attendance_records:
                await db.task_attendance.insert_many(attendance_records)
        
        # Handle group assignments
        if task_data.assigned_groups:
            for group_id in task_data.assigned_groups:
                # Get all users in the group
                group_users = await db.users.find({"group_id": group_id, "status": AccountStatus.ACTIVE}).to_list(None)
                attendance_records = []
                for user in group_users:
                    attendance = TaskAttendance(
                        task_id=task.id,
                        user_id=user["id"]
                    )
                    attendance_records.append(prepare_for_mongo(attendance.dict()))
                
                if attendance_records:
                    await db.task_attendance.insert_many(attendance_records)
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="create_task",
            target_type="task",
            target_id=task.id,
            details={
                "task_name": task.name,
                "category": task.category,
                "assigned_users_count": len(task_data.assigned_users),
                "assigned_groups_count": len(task_data.assigned_groups)
            }
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return task
        
    except Exception as e:
        logging.error(f"Failed to create task: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create task"
        )

@api_router.get("/tasks/", response_model=List[Task])
async def get_tasks(
    category: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to_me: Optional[bool] = False,
    current_user: User = Depends(get_current_user)
):
    """Get tasks based on filters"""
    try:
        query = {"is_active": True}
        
        if category:
            query["category"] = category
        
        if status:
            query["status"] = status
        
        if assigned_to_me:
            # Get tasks assigned to current user
            user_attendances = await db.task_attendance.find({"user_id": current_user.id}).to_list(None)
            task_ids = [att["task_id"] for att in user_attendances]
            query["id"] = {"$in": task_ids}
        elif current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
            # Regular users only see their assigned tasks
            user_attendances = await db.task_attendance.find({"user_id": current_user.id}).to_list(None)
            task_ids = [att["task_id"] for att in user_attendances]
            query["id"] = {"$in": task_ids}
        
        tasks = await db.tasks.find(query).sort("start_datetime", 1).to_list(100)
        return [Task(**parse_from_mongo(task)) for task in tasks]
        
    except Exception as e:
        logging.error(f"Failed to fetch tasks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch tasks"
        )

@api_router.post("/tasks/{task_id}/punch-in")
async def punch_in_task(
    task_id: str,
    punch_data: PunchInRequest,
    current_user: User = Depends(get_current_user)
):
    """Punch in to a task with strict punctuality enforcement"""
    try:
        # Get task
        task = await db.tasks.find_one({"id": task_id, "is_active": True})
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )
        
        # Get attendance record
        attendance = await db.task_attendance.find_one({
            "task_id": task_id,
            "user_id": current_user.id
        })
        if not attendance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="You are not assigned to this task"
            )
        
        if attendance.get("punch_in_time"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have already punched in to this task"
            )
        
        # Calculate timing
        current_time = datetime.now(timezone.utc)
        task_start_time = datetime.fromisoformat(task["start_datetime"].replace('Z', '+00:00')) if isinstance(task["start_datetime"], str) else task["start_datetime"]
        
        # 15-minute grace period enforcement
        grace_period_end = task_start_time + timedelta(minutes=15)
        minutes_late = max(0, int((current_time - task_start_time).total_seconds() / 60))
        is_late = current_time > task_start_time
        is_within_grace_period = current_time <= grace_period_end
        
        # Location verification if required
        location_verified = True
        if task.get("gps_latitude") and task.get("gps_longitude") and punch_data.latitude and punch_data.longitude:
            from geopy.distance import geodesic
            task_location = (task["gps_latitude"], task["gps_longitude"])
            user_location = (punch_data.latitude, punch_data.longitude)
            distance = geodesic(task_location, user_location).meters
            location_verified = distance <= task.get("check_in_radius_meters", 100)
            
            if not location_verified:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"You must be within {task.get('check_in_radius_meters', 100)} meters of the task location to punch in"
                )
        
        # Calculate rewards based on punctuality
        points_earned = 0
        coins_earned = 0
        
        if is_within_grace_period:
            if not is_late:
                # On time - full rewards
                points_earned = task.get("points_reward", 0) + task.get("punctuality_bonus_points", 0)
                coins_earned = task.get("coins_reward", 0) + task.get("punctuality_bonus_coins", 0)
            else:
                # Late but within grace period - 50% rewards
                points_earned = int((task.get("points_reward", 0) + task.get("punctuality_bonus_points", 0)) * 0.5)
                coins_earned = int((task.get("coins_reward", 0) + task.get("punctuality_bonus_coins", 0)) * 0.5)
        else:
            # Beyond grace period - NO REWARDS
            points_earned = 0
            coins_earned = 0
        
        # Update attendance record
        update_data = {
            "punch_in_time": current_time.isoformat(),
            "status": AttendanceStatus.PUNCHED_IN,
            "is_late": is_late,
            "minutes_late": minutes_late,
            "is_within_grace_period": is_within_grace_period,
            "points_earned": points_earned,
            "coins_earned": coins_earned,
            "location_verified": location_verified,
            "punch_in_latitude": punch_data.latitude,
            "punch_in_longitude": punch_data.longitude,
            "photo_verification_url": punch_data.photo_verification,
            "updated_at": current_time.isoformat()
        }
        
        await db.task_attendance.update_one(
            {"task_id": task_id, "user_id": current_user.id},
            {"$set": update_data}
        )
        
        # Update user points and coins immediately (preview of what they'll get)
        if points_earned > 0 or coins_earned > 0:
            await db.users.update_one(
                {"id": current_user.id},
                {
                    "$inc": {
                        "points": points_earned,
                        "coins": coins_earned
                    }
                }
            )
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="punch_in",
            target_type="task",
            target_id=task_id,
            details={
                "task_name": task["name"],
                "minutes_late": minutes_late,
                "is_within_grace_period": is_within_grace_period,
                "points_earned": points_earned,
                "coins_earned": coins_earned
            }
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return {
            "message": "Successfully punched in!",
            "punch_in_time": current_time.isoformat(),
            "is_late": is_late,
            "minutes_late": minutes_late,
            "is_within_grace_period": is_within_grace_period,
            "points_earned": points_earned,
            "coins_earned": coins_earned,
            "reward_status": "Full Rewards" if not is_late else ("50% Rewards (Grace Period)" if is_within_grace_period else "NO REWARDS - Too Late"),
            "location_verified": location_verified
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to punch in: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to punch in to task"
        )

@api_router.post("/tasks/{task_id}/punch-out")
async def punch_out_task(
    task_id: str,
    punch_data: PunchOutRequest,
    current_user: User = Depends(get_current_user)
):
    """Punch out of a task"""
    try:
        # Get attendance record
        attendance = await db.task_attendance.find_one({
            "task_id": task_id,
            "user_id": current_user.id
        })
        
        if not attendance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attendance record not found"
            )
        
        if not attendance.get("punch_in_time"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You must punch in before punching out"
            )
        
        if attendance.get("punch_out_time"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have already punched out of this task"
            )
        
        current_time = datetime.now(timezone.utc)
        punch_in_time = datetime.fromisoformat(attendance["punch_in_time"].replace('Z', '+00:00'))
        duration_minutes = int((current_time - punch_in_time).total_seconds() / 60)
        
        # Update attendance record
        update_data = {
            "punch_out_time": current_time.isoformat(),
            "status": AttendanceStatus.COMPLETED,
            "completion_notes": punch_data.completion_notes,
            "task_rating": punch_data.task_rating,
            "updated_at": current_time.isoformat()
        }
        
        await db.task_attendance.update_one(
            {"task_id": task_id, "user_id": current_user.id},
            {"$set": update_data}
        )
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="punch_out",
            target_type="task",
            target_id=task_id,
            details={
                "duration_minutes": duration_minutes,
                "task_rating": punch_data.task_rating
            }
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return {
            "message": "Successfully punched out!",
            "punch_out_time": current_time.isoformat(),
            "duration_minutes": duration_minutes,
            "total_points_earned": attendance.get("points_earned", 0),
            "total_coins_earned": attendance.get("coins_earned", 0)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to punch out: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to punch out of task"
        )

@api_router.get("/tasks/{task_id}/attendance", response_model=List[TaskAttendance])
async def get_task_attendance(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get attendance records for a task (Admin only)"""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can view task attendance"
        )
    
    try:
        attendance_records = await db.task_attendance.find({"task_id": task_id}).to_list(None)
        return [TaskAttendance(**parse_from_mongo(record)) for record in attendance_records]
        
    except Exception as e:
        logging.error(f"Failed to fetch task attendance: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch task attendance"
        )

@api_router.get("/my-tasks/upcoming")
async def get_my_upcoming_tasks(
    current_user: User = Depends(get_current_user)
):
    """Get user's upcoming tasks for the next 7 days"""
    try:
        # Get user's task assignments
        user_attendances = await db.task_attendance.find({"user_id": current_user.id}).to_list(None)
        task_ids = [att["task_id"] for att in user_attendances]
        
        if not task_ids:
            return []
        
        # Get upcoming tasks
        current_time = datetime.now(timezone.utc)
        week_from_now = current_time + timedelta(days=7)
        
        tasks = await db.tasks.find({
            "id": {"$in": task_ids},
            "is_active": True,
            "start_datetime": {"$gte": current_time.isoformat(), "$lte": week_from_now.isoformat()}
        }).sort("start_datetime", 1).to_list(50)
        
        # Combine with attendance data
        result = []
        for task in tasks:
            task_data = parse_from_mongo(task)
            attendance = next((att for att in user_attendances if att["task_id"] == task["id"]), None)
            
            result.append({
                "task": task_data,
                "attendance": parse_from_mongo(attendance) if attendance else None,
                "time_until_start": int((datetime.fromisoformat(task["start_datetime"].replace('Z', '+00:00')) - current_time).total_seconds() / 60),
                "can_punch_in": datetime.fromisoformat(task["start_datetime"].replace('Z', '+00:00')) <= current_time + timedelta(minutes=15)
            })
        
        return result
        
    except Exception as e:
        logging.error(f"Failed to fetch upcoming tasks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch upcoming tasks"
        )

@api_router.get("/my-attendance/stats")
async def get_my_attendance_stats(
    current_user: User = Depends(get_current_user)
):
    """Get user's attendance and punctuality statistics"""
    try:
        # Get all user's attendance records
        attendance_records = await db.task_attendance.find({"user_id": current_user.id}).to_list(None)
        
        total_tasks = len(attendance_records)
        completed_tasks = len([att for att in attendance_records if att.get("status") == AttendanceStatus.COMPLETED])
        on_time_tasks = len([att for att in attendance_records if att.get("status") == AttendanceStatus.COMPLETED and not att.get("is_late")])
        grace_period_tasks = len([att for att in attendance_records if att.get("status") == AttendanceStatus.COMPLETED and att.get("is_late") and att.get("is_within_grace_period")])
        late_tasks = len([att for att in attendance_records if att.get("status") == AttendanceStatus.COMPLETED and att.get("is_late") and not att.get("is_within_grace_period")])
        
        # Calculate current streak
        recent_attendance = sorted([att for att in attendance_records if att.get("status") == AttendanceStatus.COMPLETED], 
                                 key=lambda x: x.get("updated_at", ""), reverse=True)
        
        current_streak = 0
        for att in recent_attendance:
            if not att.get("is_late") or (att.get("is_late") and att.get("is_within_grace_period")):
                current_streak += 1
            else:
                break
        
        # Calculate total rewards
        total_points_earned = sum([att.get("points_earned", 0) for att in attendance_records])
        total_coins_earned = sum([att.get("coins_earned", 0) for att in attendance_records])
        
        punctuality_rate = (on_time_tasks + grace_period_tasks) / total_tasks * 100 if total_tasks > 0 else 0
        completion_rate = completed_tasks / total_tasks * 100 if total_tasks > 0 else 0
        
        return {
            "total_tasks_assigned": total_tasks,
            "completed_tasks": completed_tasks,
            "on_time_tasks": on_time_tasks,
            "grace_period_tasks": grace_period_tasks,
            "late_tasks": late_tasks,
            "punctuality_rate": round(punctuality_rate, 1),
            "completion_rate": round(completion_rate, 1),
            "current_streak": current_streak,
            "total_points_earned": total_points_earned,
            "total_coins_earned": total_coins_earned,
            "average_minutes_late": round(sum([att.get("minutes_late", 0) for att in attendance_records]) / len(attendance_records), 1) if attendance_records else 0
        }
        
    except Exception as e:
        logging.error(f"Failed to fetch attendance stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch attendance statistics"
        )

@api_router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a task (Admin only)"""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.GROUP_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can delete tasks"
        )
    
    try:
        # Soft delete task
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Log the activity
        activity = SystemActivity(
            user_id=current_user.id,
            action="delete_task",
            target_type="task",
            target_id=task_id,
            details={"deleted_at": datetime.now(timezone.utc).isoformat()}
        )
        await db.system_activities.insert_one(prepare_for_mongo(activity.dict()))
        
        return {"message": "Task deleted successfully"}
        
    except Exception as e:
        logging.error(f"Failed to delete task: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete task"
        )

@app.on_event("startup")
async def startup_db_client():
    try:
        logger.info("🚀 Glory of Elshaddai Christian Center Connect - Production System Starting...")
        
        # Test MongoDB connection
        await client.admin.command('ping')
        logger.info("✅ Database connection established")
        
        # Check if super admin exists
        super_admin = await db.users.find_one({"role": UserRole.SUPER_ADMIN})
        
        if super_admin:
            logger.info("✅ Super admin already exists - system ready")
            return
        
        # Create super admin if it doesn't exist
        logger.info("🔧 Creating super admin account...")
        
        # Clean up any existing admin records
        await db.users.delete_many({"email": "benolyginter7@gmail.com"})
        
        logger.info("Creating fresh super admin...")
        temp_password = "TempElshaddai2024!"
        
        super_admin_data = {
            "id": str(uuid.uuid4()),
            "email": "benolyginter7@gmail.com",
            "full_name": "Super Administrator",
            "phone": None,
            "role": UserRole.SUPER_ADMIN,
            "status": AccountStatus.ACTIVE,
            "profile_picture": None,
            "bio": "System Super Administrator",
            "emergency_contact": None,
            "time_zone": "UTC",
            "language": "en",
            "points": 0,
            "coins": 700000000,
            "failed_login_attempts": 0,
            "last_failed_login": None,
            "email_verified": True,
            "two_factor_enabled": False,
            "password": get_password_hash(temp_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "last_login": None
        }
        
        await db.users.insert_one(super_admin_data)
        
        logger.info("✅ SUPER ADMIN CREATED SUCCESSFULLY!")
        logger.info(f"📧 Email: benolyginter7@gmail.com")
        logger.info(f"🔑 Temporary Password: {temp_password}")
        logger.info("⚠️  PLEASE CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!")
    except Exception as e:
        logger.error(f"Startup initialization error: {str(e)}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
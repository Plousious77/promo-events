from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, BackgroundTasks
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
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

app = FastAPI(title="Glory of Elshaddai Christian Center Connect - Authentication System")
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
    profile_picture: Optional[str] = None
    points: int = 0
    coins: int = 0
    failed_login_attempts: int = 0
    last_failed_login: Optional[datetime] = None
    email_verified: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    status: str
    profile_picture: Optional[str] = None
    points: int
    coins: int
    email_verified: bool
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
    # For now, return the last 4 digits. In production, you might want more complex logic
    return phone_last_four

async def send_verification_email(email: str, code: str, name: str):
    """Send verification email (mock implementation)"""
    try:
        # Mock email sending - in production, replace with real SMTP
        print(f"SENDING EMAIL TO: {email}")
        print(f"VERIFICATION CODE: {code}")
        print(f"RECIPIENT: {name}")
        print("=" * 50)
        
        # You can implement real email sending here later
        # For now, we'll just log it so you can see the codes during testing
        
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
    return data

def parse_from_mongo(item):
    """Parse datetime strings back from MongoDB"""
    if isinstance(item, dict):
        datetime_fields = ['created_at', 'updated_at', 'last_login', 'last_failed_login', 
                          'submitted_at', 'processed_at', 'expires_at', 'used_at']
        for key, value in item.items():
            if key in datetime_fields and isinstance(value, str):
                try:
                    item[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except:
                    pass
    return item

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
    
    # Check if email is verified
    if not user.get("email_verified", False):
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

# Super Admin Routes
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
    
    # Create or update user with admin role
    existing_user = await db.users.find_one({"email": request["email"]})
    
    if existing_user:
        # Update existing user to admin role
        await db.users.update_one(
            {"email": request["email"]},
            {
                "$set": {
                    "role": request["requested_role"],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    else:
        # Create new admin user (they'll need to complete registration)
        # This is handled when they register with the same email
        pass
    
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
        "points": 0,
        "coins": 700000000,  # 700 million initial coins
        "failed_login_attempts": 0,
        "last_failed_login": None,
        "email_verified": True,  # Pre-verified for super admin
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

@app.on_event("startup") 
async def startup_event():
    """Initialize system on startup if needed"""
    try:
        # Check if system needs initialization
        super_admin = await db.users.find_one({"email": "benolyginter7@gmail.com"})
        if not super_admin:
            logger.info("Initializing system with default super admin...")
            temp_password = "TempElshaddai2024!"
            
            super_admin_data = {
                "id": str(uuid.uuid4()),
                "email": "benolyginter7@gmail.com",
                "full_name": "Super Administrator",
                "phone": None,
                "role": UserRole.SUPER_ADMIN,
                "status": AccountStatus.ACTIVE,
                "profile_picture": None,
                "points": 0,
                "coins": 700000000,
                "failed_login_attempts": 0,
                "last_failed_login": None,
                "email_verified": True,
                "password": get_password_hash(temp_password),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "last_login": None
            }
            
            await db.users.insert_one(super_admin_data)
            
            logger.info("System initialized with super admin: benolyginter7@gmail.com")
            logger.info(f"Temporary password: {temp_password}")
    except Exception as e:
        logger.error(f"Startup initialization error: {str(e)}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
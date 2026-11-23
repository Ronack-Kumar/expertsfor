from pydantic import BaseModel, ConfigDict, EmailStr, Field
import uuid
from datetime import datetime

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: str | None = None

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(BaseModel):
    # format, deliverability and strength are checked in the register route
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=2000)

class ResendVerificationRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)

class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool
    email_verified: bool = True
    created_at: datetime

class WorkspaceBase(BaseModel):
    name: str

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceResponse(WorkspaceBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime

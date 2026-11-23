from pydantic import BaseModel, ConfigDict, Field
import uuid
from datetime import datetime
from typing import List, Literal, Optional

class MessageBase(BaseModel):
    role: str
    content: str

class MessageCreate(BaseModel):
    # clients may only add their own or agent turns; never system prompts
    role: Literal["user", "agent"]
    content: str = Field(min_length=1, max_length=12000)


class MessageResponse(MessageBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime

class ConversationBase(BaseModel):
    title: str

class ConversationCreate(ConversationBase):
    agent_id: Optional[uuid.UUID] = None

class ConversationResponse(ConversationBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    workspace_id: uuid.UUID
    agent_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []

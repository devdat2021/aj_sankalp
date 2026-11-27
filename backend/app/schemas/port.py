from pydantic import BaseModel, Field
from typing import Literal
class Review(BaseModel):
    status: Literal['confirmed','rejected','resolved']
class Decision(BaseModel):
    status: Literal['approved','rejected']
    option_id: str | None = None
    reason: str = Field(min_length=3,max_length=500)
class Alert(BaseModel):
    message: str = Field(min_length=3,max_length=500)
    severity: Literal['info','warning','critical'] = 'warning'
class Scenario(BaseModel):
    duration_hours: float = Field(gt=0,le=168)
    severity: Literal['low','medium','high'] = 'medium'
class Incident(BaseModel):
    shipment_id: str
    category: Literal['flood','storm','breakdown','refrigeration','distress']
    severity: Literal['low','medium','high']
    description: str = Field(min_length=5,max_length=1000)
    lat: float = Field(ge=-90,le=90)
    lng: float = Field(ge=-180,le=180)

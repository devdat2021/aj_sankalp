from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
class Review(BaseModel):
    status: Literal['confirmed','rejected','resolved']
class Decision(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
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
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    shipment_id: str
    category: Literal['flood','storm','roadblock','obstruction','breakdown','refrigeration','distress','adverse_seas','vessel_issue']
    severity: Literal['low','medium','high']
    description: str = Field(min_length=5,max_length=1000)
    lat: float = Field(ge=-90,le=90)
    lng: float = Field(ge=-180,le=180)

from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, AwareDatetime, field_validator, model_validator

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

    @field_validator('*', mode='after')
    @classmethod
    def utc_dates(cls, value):
        if isinstance(value, datetime):
            return value.astimezone(timezone.utc)
        return value

class Consignment(Input):
    cargo: str = Field(min_length=1, max_length=200)
    quantity: float = Field(gt=0)
    port_id: str = 'NMP'
    origin: str = Field(min_length=1)
    destination: str = Field(min_length=1)
    vessel_id: str | None = None
    requires_cold: bool = False
    temperature: float = 20
    max_temperature: float = 25
    eta_hours: float = Field(default=0, ge=0)

class Option(Input):
    id: str
    name: str
    delay_hours: float = Field(ge=0)
    cost: float = Field(default=0, ge=0)
    risk: float = Field(default=0, ge=0, le=100)
    simulated: Literal[True] = True
    # Optional road geometry lets approved driver proposals survive refreshes.
    points: list[tuple[float, float]] | None = Field(default=None, min_length=2, max_length=20000)
    distance: float | None = Field(default=None, ge=0)
    duration: float | None = Field(default=None, ge=0)
    source: str | None = Field(default=None, max_length=200)
    conflicts: list[str] | None = None
    safe: bool | None = None

    @field_validator('points')
    @classmethod
    def coordinates(cls, points):
        if points and any(not (-90 <= lat <= 90 and -180 <= lng <= 180) for lat, lng in points):
            raise ValueError('Invalid route coordinates')
        return points

class Assignment(Input):
    truck_id: str
    route: Option

class RouteRequest(Input):
    shipment_id: str
    reason: str = Field(min_length=3, max_length=1000)
    options: list[Option] = Field(min_length=1, max_length=10)

class PortRequest(Input):
    shipment_id: str
    kind: Literal['handling', 'truck_access']
    requested_at: AwareDatetime

class DockRequest(Input):
    vessel_id: str
    port_id: str = 'NMP'
    eta: AwareDatetime

class Approval(Input):
    status: Literal['approved', 'rejected', 'slot_suggested']
    reason: str = Field(min_length=3, max_length=500)
    slot: AwareDatetime | None = None
    suggested_start: AwareDatetime | None = None
    suggested_end: AwareDatetime | None = None

    @model_validator(mode='after')
    def validate_slot_window(self):
        if self.status == 'slot_suggested':
            if not self.suggested_start or not self.suggested_end:
                raise ValueError('suggested_start and suggested_end are required when suggesting an alternative slot')
            if self.suggested_end <= self.suggested_start:
                raise ValueError('suggested_end must be after suggested_start')
        return self

class DockApproval(Approval):
    berth: str | None = None

class Capacity(Input):
    status: Literal['open', 'restricted', 'closed']
    berths: int = Field(ge=0)
    occupied_berths: int = Field(ge=0)
    cold_capacity: float = Field(ge=0)
    cold_occupied: float = Field(ge=0)
    yard_capacity: float | None = Field(default=None, ge=0)
    yard_occupied: float | None = Field(default=None, ge=0)
    handling_capacity: float | None = Field(default=None, ge=0)
    handling_occupied: float | None = Field(default=None, ge=0)

class Position(Input):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    observed_at: AwareDatetime

class Milestone(Input):
    event: Literal['departed', 'arrived', 'docked', 'unloaded', 'ready_for_pickup', 'picked_up', 'delivered']
    eta_hours: float | None = Field(default=None, ge=0)

class Warning(Input):
    message: str = Field(min_length=3, max_length=1000)
    severity: Literal['info', 'warning', 'critical'] = 'warning'
    shipment_ids: list[str] = Field(default_factory=list)

class EtaUpdate(Input):
    eta_hours: float = Field(ge=0)

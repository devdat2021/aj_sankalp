from typing import Literal
from pydantic import Field, AwareDatetime, model_validator
from app.schemas.workflow import Input


class Coordinates(Input):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ShipmentInputs(Input):
    weight_kg: float | None = Field(default=None, gt=0)
    pickup: Coordinates | None = None
    delivery: Coordinates | None = None
    cargo_ready_at: AwareDatetime | None = None
    pickup_window_start: AwareDatetime | None = None
    pickup_window_end: AwareDatetime | None = None
    delivery_deadline: AwareDatetime | None = None
    pickup_service_seconds: int | None = Field(default=None, ge=0)
    delivery_service_seconds: int | None = Field(default=None, ge=0)
    planned_pickup_at: AwareDatetime | None = None
    planned_delivery_at: AwareDatetime | None = None


class VehicleInputs(Input):
    available: bool
    capacity_kg: float = Field(gt=0)
    refrigerated: bool
    available_from: AwareDatetime
    available_until: AwareDatetime
    cost_per_hour: float = Field(gt=0)
    cost_per_km: float = Field(ge=0)
    cost_currency: str = Field(pattern=r'^[A-Z]{3}$')
    start: Coordinates

    @model_validator(mode='after')
    def window(self):
        if self.available_until <= self.available_from:
            raise ValueError('Availability end must follow start')
        return self


class AnalysisRequest(Input):
    shipment_id: str = Field(min_length=1, max_length=100)
    retry: bool = False


class RecoveryDecision(Input):
    status: Literal['approved', 'rejected']
    reason: str = Field(min_length=3, max_length=500)


class AnalystAction(Input):
    candidate_id: str
    evidence_ids: list[str] = Field(min_length=1)
    reasoning: str = Field(max_length=1200)


class AnalystReview(Input):
    operational_summary: str = Field(max_length=2000)
    root_cause_analysis: str = Field(max_length=2000)
    severity: Literal['low', 'medium', 'high', 'critical']
    affected_entity_ids: list[str]
    cascading_consequences: list[str]
    recommendations: list[AnalystAction]
    evidence_ids: list[str]
    assumptions_and_uncertainties: list[str]

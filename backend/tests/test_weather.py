import httpx
import pytest
from fastapi import HTTPException
from app.services import weather

def test_forecast_cache_and_stale_fallback(monkeypatch):
    weather._cache.clear()
    calls=[]
    def fetch(url,**kwargs):
        calls.append(url)
        return httpx.Response(200,json={'hourly':{'time':['2026-12-01T00:00'],'wave_height':[1.2]}},request=httpx.Request('GET',url))
    monkeypatch.setattr(weather.httpx,'get',fetch)
    result=weather.forecast(12,74,'marine')
    assert result['source']=='Open-Meteo' and not result['stale']
    assert weather.forecast(12,74,'marine')==result and len(calls)==1
    weather._cache[(12,74,'marine')]=(0,result)
    def fail(*args,**kwargs): raise httpx.ConnectError('offline')
    monkeypatch.setattr(weather.httpx,'get',fail)
    assert weather.forecast(12,74,'marine')['stale']
    with pytest.raises(HTTPException) as exc: weather.forecast(12,74,'land')
    assert exc.value.status_code==503

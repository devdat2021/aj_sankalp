from time import monotonic
from threading import Lock
import httpx
from fastapi import HTTPException
from app.services.port_service import now

_cache={}
_lock=Lock()

def forecast(lat, lng, mode):
    key=(lat,lng,mode)
    with _lock:
        entry=_cache.get(key)
        if entry and monotonic()-entry[0]<600: return entry[1]
    marine=mode=='marine'
    url='https://marine-api.open-meteo.com/v1/marine' if marine else 'https://api.open-meteo.com/v1/forecast'
    params=dict(latitude=lat,longitude=lng,hourly='wave_height,wave_period' if marine else 'temperature_2m,precipitation,wind_speed_10m',forecast_days=2,timezone='UTC')
    try:
        response=httpx.get(url,params=params,timeout=8)
        response.raise_for_status(); data=response.json()
        if 'hourly' not in data: raise ValueError('Forecast missing')
    except (httpx.HTTPError,ValueError):
        if entry: return dict(entry[1],stale=True)
        raise HTTPException(503,'Weather unavailable; operational reporting remains available')
    result=dict(source='Open-Meteo',fetched_at=now(),stale=False,mode=mode,forecast=data)
    with _lock: _cache[key]=(monotonic(),result)
    return result

import json, os, threading
from pathlib import Path
from contextlib import contextmanager
from app.core.config import settings
from app.database.collections import seed, migrate
from fastapi import HTTPException
lock=threading.RLock()
path=Path(__file__).resolve().parents[2]/'data'/'state.json'
def collection():
    from pymongo import MongoClient
    return MongoClient(settings.mongodb_uri,serverSelectionTimeoutMS=3000)[settings.mongodb_db].port_state
@contextmanager
def transaction():
    # One versioned aggregate keeps decision, shipment, alert and audit atomic.
    with lock:
        if settings.mongodb_uri:
            c=collection(); row=c.find_one({'_id':'NMP'})
            if row is None:
                c.update_one({'_id':'NMP'},{'$setOnInsert':{'version':0,'state':seed(settings.demo_mode)}},upsert=True);row=c.find_one({'_id':'NMP'})
            state=row['state'];before=json.dumps(state,sort_keys=True)
            migrate(state, settings.demo_mode)
            yield state
            if json.dumps(state,sort_keys=True)!=before:
                r=c.update_one({'_id':'NMP','version':row['version']},{'$set':{'state':state},'$inc':{'version':1}})
                if not r.modified_count: raise HTTPException(409,'State changed; refresh and retry')
        else:
            if not settings.demo_mode: raise HTTPException(503,'MongoDB is required outside demo mode')
            state=json.loads(path.read_text()) if path.exists() else seed()
            migrate(state, settings.demo_mode)
            yield state
            path.parent.mkdir(parents=True,exist_ok=True)
            tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(state));os.replace(tmp,path)

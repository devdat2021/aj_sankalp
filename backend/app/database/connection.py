import copy
import json
import os
import threading
from contextlib import contextmanager
from pathlib import Path
from fastapi import HTTPException
from app.core.config import settings
from app.database.collections import seed, migrate

lock = threading.RLock()
path = Path(__file__).resolve().parents[2] / 'data' / 'state.json'

LIST_COLLECTIONS = (
    'users', 'companies', 'vessels', 'vehicles', 'shipments',
    'incidents', 'requests', 'port_requests', 'docking_requests',
    'alerts', 'audit', 'events',
)

_client = None
_client_uri = None


def get_mongo_client():
    global _client, _client_uri
    if _client is None or _client_uri != settings.mongodb_uri:
        from pymongo import MongoClient
        _client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
        _client_uri = settings.mongodb_uri
    return _client


def get_mongo_db():
    return get_mongo_client()[settings.mongodb_db]


def collection():
    """Compatibility helper returning the ports collection."""
    return get_mongo_db().ports


def _strip_id(doc: dict) -> dict:
    d = dict(doc)
    d.pop('_id', None)
    return d


def _sync_list_collection(coll, items: list[dict]):
    coll.delete_many({})
    if items:
        docs = []
        for idx, item in enumerate(items):
            doc = dict(item)
            doc['_id'] = item.get('id') or f'item-{idx}'
            docs.append(doc)
        coll.insert_many(docs)


def _load_mongo_state(db) -> tuple[dict, int]:
    meta = db['meta'].find_one({'_id': 'NMP'})
    if meta is None:
        legacy = db['port_state'].find_one({'_id': 'NMP'})
        state = legacy['state'] if legacy and 'state' in legacy else seed(settings.demo_mode)
        migrate(state, settings.demo_mode)
        db['ports'].replace_one({'_id': state['port']['id']}, {**state['port'], '_id': state['port']['id']}, upsert=True)
        for name in LIST_COLLECTIONS:
            _sync_list_collection(db[name], state.get(name, []))
        db['meta'].update_one(
            {'_id': 'NMP'},
            {'$setOnInsert': {'version': 0, 'schema_version': state.get('schema_version', 2)}},
            upsert=True,
        )
        meta = db['meta'].find_one({'_id': 'NMP'})

    port_doc = db['ports'].find_one({'_id': 'NMP'})
    state = {
        'port': _strip_id(port_doc) if port_doc else seed(settings.demo_mode)['port'],
        'schema_version': meta.get('schema_version', 2),
    }
    for name in LIST_COLLECTIONS:
        state[name] = [_strip_id(d) for d in db[name].find({})]
    return state, meta.get('version', 0)


@contextmanager
def transaction():
    # Optimistic concurrency across separate MongoDB collections.
    with lock:
        if settings.mongodb_uri:
            db = get_mongo_db()
            state, version = _load_mongo_state(db)
            migrate(state, settings.demo_mode)
            before = {k: json.dumps(state.get(k), sort_keys=True) for k in ('port', *LIST_COLLECTIONS, 'schema_version')}
            yield state
            changed = [k for k in before if json.dumps(state.get(k), sort_keys=True) != before[k]]
            if changed:
                res = db['meta'].update_one(
                    {'_id': 'NMP', 'version': version},
                    {'$set': {'schema_version': state.get('schema_version', 2)}, '$inc': {'version': 1}},
                )
                if not res.modified_count:
                    raise HTTPException(409, 'State changed; refresh and retry')
                for k in changed:
                    if k == 'port':
                        db['ports'].replace_one({'_id': state['port']['id']}, {**state['port'], '_id': state['port']['id']}, upsert=True)
                    elif k in LIST_COLLECTIONS:
                        _sync_list_collection(db[k], state.get(k, []))
        else:
            if not settings.demo_mode:
                raise HTTPException(503, 'MongoDB is required outside demo mode')
            state = json.loads(path.read_text()) if path.exists() else seed()
            migrate(state, settings.demo_mode)
            yield state
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix('.tmp')
            tmp.write_text(json.dumps(state))
            os.replace(tmp, path)

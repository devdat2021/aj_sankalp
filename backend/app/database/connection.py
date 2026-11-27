import copy
import json
import os
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from fastapi import HTTPException
from app.core.config import settings
from app.services.work_access import prune
from app.database.collections import seed, migrate

lock = threading.RLock()
path = Path(__file__).resolve().parents[2] / 'data' / 'state.json'

LIST_COLLECTIONS = (
    'users', 'companies', 'vessels', 'vehicles', 'shipments',
    'incidents', 'requests', 'port_requests', 'docking_requests',
    'work_access', 'alerts', 'audit', 'events', 'intelligence_jobs', 'recommendations',
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


def _sync_list_collection(coll, items: list[dict], session=None):
    coll.delete_many({}, session=session)
    if items:
        docs = []
        for idx, item in enumerate(items):
            doc = dict(item)
            doc['_id'] = item.get('id') or f'item-{idx}'
            docs.append(doc)
        coll.insert_many(docs, session=session)


def _load_mongo_state(db, session=None) -> tuple[dict, int]:
    meta = db['meta'].find_one({'_id': 'NMP'}, session=session)
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

    port_doc = db['ports'].find_one({'_id': 'NMP'}, session=session)
    state = {
        'port': _strip_id(port_doc) if port_doc else seed(settings.demo_mode)['port'],
        'schema_version': meta.get('schema_version', 2),
    }
    for name in LIST_COLLECTIONS:
        state[name] = [_strip_id(d) for d in db[name].find({}, session=session)]
    return state, meta.get('version', 0)


@contextmanager
def transaction():
    # Actual MongoDB transaction: approvals, operational writes and notifications commit together.
    with lock:
        if settings.mongodb_uri:
            db = get_mongo_db()
            if db['meta'].find_one({'_id': 'NMP'}) is None:
                _load_mongo_state(db)  # Existing bootstrap, before opening the transaction.
            from pymongo.errors import OperationFailure
            try:
                with get_mongo_client().start_session() as session, session.start_transaction():
                    state, version = _load_mongo_state(db, session)
                    migrate(state, settings.demo_mode)
                    before = {k: json.dumps(state.get(k), sort_keys=True) for k in ('port', *LIST_COLLECTIONS, 'schema_version')}
                    yield state
                    prune(state)
                    changed = [k for k in before if json.dumps(state.get(k), sort_keys=True) != before[k]]
                    if changed:
                        res = db['meta'].update_one(
                            {'_id': 'NMP', 'version': version},
                            {'$set': {'schema_version': state.get('schema_version', 2)}, '$inc': {'version': 1}}, session=session)
                        if not res.modified_count:
                            raise HTTPException(409, 'State changed; refresh and retry')
                        for k in changed:
                            if k == 'port':
                                db['ports'].replace_one({'_id': state['port']['id']}, {**state['port'], '_id': state['port']['id']}, upsert=True, session=session)
                            elif k in LIST_COLLECTIONS:
                                _sync_list_collection(db[k], state.get(k, []), session)
            except OperationFailure as exc:
                if exc.has_error_label('TransientTransactionError') or exc.code == 112:
                    raise HTTPException(409, 'Concurrent operational change; refresh and retry') from None
                raise HTTPException(503, 'MongoDB transaction failed; a replica set or Atlas is required') from None
        else:
            if not settings.demo_mode:
                raise HTTPException(503, 'MongoDB is required outside demo mode')
            previous = path.read_text() if path.exists() else None
            state = json.loads(previous) if previous is not None else seed()
            migrate(state, settings.demo_mode)
            yield state
            prune(state)
            serialized = json.dumps(state)
            if serialized == previous:
                return
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix('.tmp')
            tmp.write_text(serialized)
            # Windows readers and file indexers can briefly hold the destination open.
            for attempt in range(6):
                try:
                    os.replace(tmp, path)
                    break
                except PermissionError:
                    if os.name != 'nt' or attempt == 5:
                        raise
                    time.sleep(0.01 * 2 ** attempt)

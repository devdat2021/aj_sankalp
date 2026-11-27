"""Trusted access mappings; Supabase owns identities, MongoDB owns authorization."""
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.security import administrator
from app.database.connection import transaction

router = APIRouter(prefix='/api/admin', dependencies=[Depends(administrator)])


class AccessMapping(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)
    email: str | None = Field(None, max_length=254)
    role: Literal['admin', 'port', 'logistics', 'driver', 'captain']
    active: bool = True
    company_id: str | None = None
    port_id: str | None = None
    asset_id: str | None = None


def _supabase_admin_headers():
    headers = {'apikey': settings.supabase_secret_key}
    # Legacy service_role keys are JWTs; new secret keys belong only in apikey.
    if not settings.supabase_secret_key.startswith('sb_secret_'):
        headers['Authorization'] = 'Bearer ' + settings.supabase_secret_key
    return headers


def verify_auth_account(subject):
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise HTTPException(503, 'Configure SUPABASE_URL and SUPABASE_SECRET_KEY to add users')
    try:
        response = httpx.get(settings.supabase_url.rstrip('/') + '/auth/v1/admin/users/' + subject,
                             headers=_supabase_admin_headers(), timeout=10)
    except httpx.RequestError:
        raise HTTPException(503, 'Supabase account lookup unavailable') from None
    if response.status_code == 404:
        raise HTTPException(422, 'Create this user in Supabase Authentication first')
    if response.status_code != 200:
        raise HTTPException(503, 'Supabase account lookup failed; check server credentials')
    payload = response.json()
    if payload.get('id') != subject:
        raise HTTPException(422, 'Supabase account ID mismatch')
    return payload


def list_supabase_users():
    if not settings.supabase_url or not settings.supabase_secret_key:
        return []
    try:
        response = httpx.get(
            settings.supabase_url.rstrip('/') + '/auth/v1/admin/users',
            params={'per_page': 200},
            headers=_supabase_admin_headers(),
            timeout=10,
        )
        if response.status_code == 200:
            return response.json().get('users', [])
    except httpx.RequestError:
        pass
    return []


@router.get('/users')
def users():
    auth_users = list_supabase_users()
    auth_by_id = {u.get('id'): u for u in auth_users if u.get('id')}
    with transaction() as state:
        mapped_by_auth = {u['auth_user_id']: u for u in state['users']}
        directory = []
        for au in auth_users:
            uid = au.get('id')
            if not uid:
                continue
            existing = mapped_by_auth.get(uid)
            meta = au.get('user_metadata') or {}
            req_role = meta.get('requested_role')
            if req_role not in ('port', 'logistics', 'driver', 'captain'):
                req_role = None
            email = au.get('email') or (existing.get('email') if existing else None)
            name = (existing.get('name') if existing else None) or meta.get('display_name') or (email.split('@')[0] if email else 'Registered user')
            status = ('active' if existing.get('active') else 'disabled') if existing else 'pending'
            entry = dict(
                id=existing['id'] if existing else None,
                auth_user_id=uid,
                email=email,
                name=name,
                requested_role=req_role,
                email_confirmed=bool(au.get('email_confirmed_at')),
                created_at=au.get('created_at'),
                role=existing.get('role') if existing else None,
                active=bool(existing.get('active')) if existing else False,
                status=status,
            )
            if existing:
                for k in ('port_id', 'company_id', 'asset_id'):
                    if existing.get(k):
                        entry[k] = existing[k]
            directory.append(entry)
        for u in state['users']:
            if u['auth_user_id'] not in auth_by_id:
                directory.append(dict(u, status='active' if u.get('active') else 'disabled'))
        return dict(users=directory, companies=state['companies'],
                    ports=[{'id': state['port']['id'], 'name': state['port']['name']}],
                    vehicles=[{k: v.get(k) for k in ('id', 'name', 'company_id')} for v in state['vehicles']],
                    vessels=[{k: v.get(k) for k in ('id', 'name')} for v in state['vessels']])


@router.put('/users/{subject}')
def save_user(subject: UUID, body: AccessMapping, actor=Depends(administrator)):
    subject = str(subject)
    with transaction() as state:
        exists = any(u['auth_user_id'] == subject for u in state['users'])
    auth_account = None if exists else verify_auth_account(subject)
    with transaction() as state:
        existing = next((u for u in state['users'] if u['auth_user_id'] == subject), None)
        if existing and existing['id'] == actor['id'] and (body.role != 'admin' or not body.active):
            raise HTTPException(409, 'You cannot remove your own administrator access')
        if (existing and existing['role'] == 'admin' and existing['active']
                and (body.role != 'admin' or not body.active)
                and not any(u['role'] == 'admin' and u['active'] and u['id'] != existing['id'] for u in state['users'])):
            raise HTTPException(409, 'Keep at least one active administrator')
        scope = {}
        if body.role == 'port':
            if body.port_id != state['port']['id']:
                raise HTTPException(422, 'Select a valid port')
            scope['port_id'] = body.port_id
        if body.role in ('logistics', 'driver'):
            if not any(c['id'] == body.company_id for c in state['companies']):
                raise HTTPException(422, 'Select a valid company')
            scope['company_id'] = body.company_id
        if body.role in ('driver', 'captain'):
            assets = state['vehicles' if body.role == 'driver' else 'vessels']
            asset = next((a for a in assets if a['id'] == body.asset_id), None)
            if not asset or (body.role == 'driver' and asset.get('company_id') != body.company_id):
                raise HTTPException(422, 'Select an asset belonging to the assigned scope')
            if body.active and any(u['active'] and u.get('asset_id') == body.asset_id
                                   and u['auth_user_id'] != subject for u in state['users']):
                raise HTTPException(409, 'This asset already has an active operator')
            scope['asset_id'] = body.asset_id
        user_email = body.email or (auth_account.get('email') if isinstance(auth_account, dict) else None) or (existing.get('email') if existing else None)
        saved = dict(id=existing['id'] if existing else str(uuid4()), auth_user_id=subject,
                     name=body.name, role=body.role, active=body.active,
                     **({'email': user_email} if user_email else {}), **scope)
        if existing:
            existing.clear()
            existing.update(saved)
        else:
            state['users'].append(saved)
        for collection, key, role in [('vehicles', 'driver_id', 'driver'), ('vessels', 'captain_id', 'captain')]:
            for asset in state[collection]:
                if asset.get(key) == saved['id']:
                    asset[key] = None
                if body.active and body.role == role and asset['id'] == body.asset_id:
                    asset[key] = saved['id']
        state['audit'].append(dict(id=str(uuid4()), actor_id=actor['id'], action='user_access_updated',
                                   user_id=saved['id'], role=body.role, active=body.active,
                                   created_at=datetime.now(timezone.utc).isoformat()))
        return saved


@router.patch('/users/{user_id}/disable')
def disable_user(user_id: str, actor=Depends(administrator)):
    with transaction() as state:
        user = next((u for u in state['users'] if u['id'] == user_id), None)
        if not user:
            raise HTTPException(404, 'Account mapping not found')
        if user['id'] == actor['id']:
            raise HTTPException(409, 'You cannot remove your own administrator access')
        if (user['role'] == 'admin' and user['active'] and
                not any(u['role'] == 'admin' and u['active'] and u['id'] != user_id for u in state['users'])):
            raise HTTPException(409, 'Keep at least one active administrator')
        user['active'] = False
        for collection, key in [('vehicles', 'driver_id'), ('vessels', 'captain_id')]:
            for asset in state[collection]:
                if asset.get(key) == user_id:
                    asset[key] = None
        state['audit'].append(dict(id=str(uuid4()), actor_id=actor['id'], action='user_access_disabled',
                                   user_id=user_id, created_at=datetime.now(timezone.utc).isoformat()))
        return user

@router.get('/users/{user_id}/assignments')
def driver_assignments(user_id: str):
    from app.services.work_access import assignment_driver
    with transaction() as state:
        items = []
        for row in state['shipments']:
            driver = assignment_driver(state, row)
            if not driver or driver['id'] != user_id:
                continue
            item = {k: v for k, v in row.items() if k != 'route'}
            if isinstance(row.get('route'), dict):
                item['route'] = {rk: rv for rk, rv in row['route'].items() if rk != 'points'}
            item['driver'] = driver.get('name') or driver['id']
            items.append(item)
        return items


@router.post('/users/{user_id}/assignments/{shipment_id}/share')
def share_assignment(user_id: str, shipment_id: str, request: Request, response: Response):
    from app.services.work_access import assignment_driver, issue, protect
    protect(request, 120)
    with transaction() as state:
        row = next((s for s in state['shipments'] if s['id'] == shipment_id), None)
        driver = assignment_driver(state, row)
        if not driver or driver['id'] != user_id:
            raise HTTPException(404, 'Active assignment not found')
        response.headers['Cache-Control'] = 'no-store'
        return dict(work_token=issue(state, row))

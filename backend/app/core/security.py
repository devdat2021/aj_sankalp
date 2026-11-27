from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from app.database.connection import transaction
from functools import lru_cache
from uuid import UUID
import httpx
import jwt
bearer=HTTPBearer(auto_error=False)

@lru_cache(maxsize=4)
def jwks_client(issuer):
    return jwt.PyJWKClient(issuer+'/.well-known/jwks.json', timeout=10)

def verified_subject(token):
    try:
        algorithm = jwt.get_unverified_header(token).get('alg')
    except jwt.PyJWTError:
        raise HTTPException(401, 'Invalid or expired token') from None
    if not settings.supabase_url:
        raise HTTPException(503, 'Supabase authentication is not configured')
    issuer = settings.supabase_url.rstrip('/') + '/auth/v1'
    try:
        if algorithm == 'HS256':
            # Legacy projects: verify with Auth rather than holding the JWT signing secret.
            if not settings.supabase_publishable_key:
                raise HTTPException(503, 'Supabase publishable key is required for legacy tokens')
            response = httpx.get(issuer + '/user', headers={
                'apikey': settings.supabase_publishable_key, 'Authorization': 'Bearer ' + token,
            }, timeout=10)
            if response.status_code != 200:
                raise HTTPException(401, 'Invalid or expired token')
            subject = response.json()['id']
        else:
            key = jwks_client(issuer).get_signing_key_from_jwt(token).key
            subject = jwt.decode(token, key, algorithms=['RS256', 'ES256'],
                audience=settings.supabase_jwt_audience, issuer=issuer,
                options={'require': ['exp', 'sub', 'iss', 'aud']})['sub']
        return str(UUID(subject))
    except HTTPException:
        raise
    except (httpx.RequestError, jwt.PyJWKClientConnectionError):
        raise HTTPException(503, 'Authentication service unavailable') from None
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        raise HTTPException(401, 'Invalid or expired token') from None
def current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials: raise HTTPException(401,'Sign in required')
    token=credentials.credentials
    demos = {'local-port-demo':'authority-demo', 'local-logistics-demo':'logistics-demo', 'local-driver-demo':'driver-demo', 'local-captain-demo':'captain-demo'}
    if settings.demo_mode and token in demos: subject=demos[token]
    else:
        subject = verified_subject(token)
    with transaction() as state:
        user=next((u for u in state['users'] if u['auth_user_id']==subject and u['active']),None)
        if user and user['role'] == 'admin':
            user = dict(user, is_admin=True)
            user['workspaces'] = {
                'port': [dict(id=state['port']['id'], name=state['port']['name'], port_id=state['port']['id'])],
                'logistics': [dict(id=c['id'], name=c['name'], company_id=c['id']) for c in state['companies']],
                'driver': [dict(id=v['id'], name=v['name'], asset_id=v['id'], company_id=v.get('company_id')) for v in state['vehicles']],
                'captain': [dict(id=v['id'], name=v['name'], asset_id=v['id']) for v in state['vessels']],
            }
            role = request.headers.get('X-Workspace-Role')
            if role:
                choices = user['workspaces'].get(role, [])
                scope = request.headers.get('X-Workspace-Scope')
                selected = next((c for c in choices if c['id'] == scope), None) if scope else next(iter(choices), None)
                if not selected: raise HTTPException(403, 'Workspace is unavailable')
                user.update({k: v for k, v in selected.items() if k not in ('id', 'name')})
                user['role'] = role
        elif request.headers.get('X-Workspace-Role'):
            raise HTTPException(403, 'Administrator access required to switch workspaces')
    if not user: raise HTTPException(403,'Active user mapping required')
    scopes = {'port': ('port_id',), 'logistics': ('company_id',),
              'driver': ('company_id', 'asset_id'), 'captain': ('asset_id',), 'admin': ()}
    required = scopes.get(user.get('role'))
    if required is None or any(not isinstance(user.get(key), str) or not user[key].strip() for key in required):
        raise HTTPException(403, 'Complete role and scope mapping required')
    return user

def administrator(user=Depends(current_user)):
    if user['role'] != 'admin' and not user.get('is_admin'): raise HTTPException(403, 'Administrator access required')
    return user

def authority(user=Depends(current_user)):
    if user['role'] != 'port': raise HTTPException(403,'Port operations access required')
    return user

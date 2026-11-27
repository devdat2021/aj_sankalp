from uuid import UUID

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.main import app
from app.core import security
from app.api import admin
from app.database import connection

ADMIN = '00000000-0000-4000-8000-000000000001'
USER = '00000000-0000-4000-8000-000000000002'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(connection, 'path', tmp_path / 'state.json')
    monkeypatch.setattr(connection.settings, 'mongodb_uri', '')
    monkeypatch.setattr(connection.settings, 'demo_mode', True)
    with connection.transaction() as state:
        state['users'].append(dict(id=ADMIN, auth_user_id=ADMIN, name='Admin', role='admin', active=True))
    monkeypatch.setattr(security, 'verified_subject', lambda token: str(UUID(token)))
    monkeypatch.setattr(admin, 'verify_auth_account', lambda subject: None)
    return TestClient(app)


def headers(subject=ADMIN):
    return {'Authorization': 'Bearer ' + subject}


def test_admin_access_control(client):
    assert client.get('/api/admin/users').status_code == 401
    for role in ['port', 'logistics', 'driver', 'captain']:
        assert client.get('/api/admin/users', headers=headers(f'local-{role}-demo')).status_code == 403
        assert client.put(f'/api/admin/users/{USER}', headers=headers(f'local-{role}-demo'),
                          json={'name': 'Escalation', 'role': 'admin'}).status_code == 403
    assert client.get('/api/me', headers=headers(USER)).status_code == 403
    assert client.get('/api/me', headers=headers()).json()['role'] == 'admin'
    assert client.get('/api/admin/users', headers=headers()).status_code == 200
    assert client.get('/api/port/dashboard', headers=headers()).status_code == 403
    assert client.get('/api/crisis/dashboard/summary', headers=headers()).status_code == 403
    assert client.put(f'/api/admin/users/{ADMIN}', headers=headers(),
                      json={'name': 'Admin', 'role': 'admin', 'active': False}).status_code == 409
    assert client.patch(f'/api/admin/users/{ADMIN}/disable', headers=headers()).status_code == 409


def test_assignment_scope_and_disable(client):
    body = dict(name='Driver', role='driver', company_id='OTHER', asset_id='TRK-101')
    assert client.put(f'/api/admin/users/{USER}', headers=headers(), json=body).status_code == 422
    body['company_id'] = 'LOG-101'
    assert client.put(f'/api/admin/users/{USER}', headers=headers(), json=body).status_code == 409
    assert client.patch('/api/admin/users/driver-demo/disable', headers=headers()).status_code == 200
    saved = client.put(f'/api/admin/users/{USER}', headers=headers(), json=body)
    assert saved.status_code == 200
    assert client.get('/api/me', headers=headers(USER)).json()['asset_id'] == 'TRK-101'
    assert client.get('/api/driver/dashboard', headers=headers(USER)).status_code == 200
    assert client.get('/api/logistics/dashboard', headers=headers(USER)).status_code == 403
    with connection.transaction() as state:
        assert state['vehicles'][0]['driver_id'] == saved.json()['id']
    assert client.put(f'/api/admin/users/{USER}', headers=headers(), json={**body, 'active': False}).status_code == 200
    assert client.get('/api/me', headers=headers(USER)).status_code == 403
    with connection.transaction() as state:
        assert state['vehicles'][0]['driver_id'] is None
        assert state['audit'][-1]['action'] == 'user_access_updated'


def test_signin_does_not_reactivate_admin(client):
    client.get('/api/me', headers=headers())
    with connection.transaction() as state:
        state['users'][-1]['active'] = False
    assert client.get('/api/me', headers=headers()).status_code == 403


def test_admin_can_open_every_workspace_but_other_roles_cannot(client):
    workspaces = client.get('/api/me', headers=headers()).json()['workspaces']
    for role, choices in workspaces.items():
        for choice in choices:
            context = {'X-Workspace-Role': role, 'X-Workspace-Scope': choice['id']}
            assert client.get(f'/api/{role}/dashboard', headers=headers() | context).status_code == 200
            assert client.get(f'/api/{role}/dashboard', headers=headers('local-driver-demo') | context).status_code == 403
    invalid = headers() | {'X-Workspace-Role': 'driver', 'X-Workspace-Scope': 'MISSING'}
    assert client.get('/api/driver/dashboard', headers=invalid).status_code == 403
    with connection.transaction() as state:
        assert next(u for u in state['users'] if u['id'] == ADMIN)['role'] == 'admin'


def test_admin_operator_context_keeps_audit_identity_and_allows_asset_updates(client):
    from datetime import datetime, timezone
    context = headers() | {'X-Workspace-Role': 'driver', 'X-Workspace-Scope': 'TRK-101'}
    assert client.get('/api/me', headers=context).json()['id'] == ADMIN
    assert client.post('/api/tracking/location', headers=context, json={
        'lat': 12.9, 'lng': 74.8, 'observed_at': datetime.now(timezone.utc).isoformat(),
    }).status_code == 200
    from app.services.workflow import vessel
    with connection.transaction() as state:
        assert vessel(state, {'id': ADMIN, 'role': 'captain', 'asset_id': 'VES-101', 'is_admin': True}, 'VES-101')['id'] == 'VES-101'


def test_role_change_and_scope_cleanup(client):
    for role, scope in [('port', {'port_id': 'NMP'}), ('logistics', {'company_id': 'LOG-101'}), ('admin', {})]:
        result = client.put(f'/api/admin/users/{USER}', headers=headers(), json={'name': 'User', 'role': role, **scope})
        assert result.status_code == 200
        assert client.get('/api/me', headers=headers(USER)).json()['role'] == role
    assert 'company_id' not in result.json()
    assert 'port_id' not in result.json()


def test_signed_tokens_reject_bad_claims(monkeypatch):
    from datetime import datetime, timedelta, timezone
    key = ec.generate_private_key(ec.SECP256R1())
    class Keys:
        def get_signing_key_from_jwt(self, token):
            return type('Key', (), {'key': key.public_key()})()
    monkeypatch.setattr(security, 'jwks_client', lambda issuer: Keys())
    monkeypatch.setattr(security.settings, 'supabase_url', 'https://test.supabase.co')
    claims = dict(sub=USER, iss='https://test.supabase.co/auth/v1', aud='authenticated',
                  exp=datetime.now(timezone.utc) + timedelta(minutes=5),
                  user_metadata={'role': 'admin'})
    assert security.verified_subject(jwt.encode(claims, key, algorithm='ES256')) == USER
    for changes in [{'aud': 'wrong'}, {'iss': 'https://attacker.example'}, {'exp': 1}, {'sub': 'invalid'}]:
        with pytest.raises(security.HTTPException) as error:
            security.verified_subject(jwt.encode({**claims, **changes}, key, algorithm='ES256'))
        assert error.value.status_code == 401


def test_legacy_tokens_require_auth_verification(monkeypatch):
    monkeypatch.setattr(security.settings, 'supabase_url', 'https://test.supabase.co')
    monkeypatch.setattr(security.settings, 'supabase_publishable_key', 'public')
    token = jwt.encode({'sub': USER}, 'x' * 32, algorithm='HS256')
    monkeypatch.setattr(security.httpx, 'get', lambda *args, **kwargs: httpx.Response(401))
    with pytest.raises(security.HTTPException) as error:
        security.verified_subject(token)
    assert error.value.status_code == 401
    monkeypatch.setattr(security.httpx, 'get', lambda *args, **kwargs: httpx.Response(200, json={'id': USER}))
    assert security.verified_subject(token) == USER


def test_account_lookup_secret_stays_server_side(monkeypatch):
    monkeypatch.setattr(admin.settings, 'supabase_url', 'https://test.supabase.co')
    monkeypatch.setattr(admin.settings, 'supabase_secret_key', 'sb_secret_test')
    def get(url, **kwargs):
        assert url.endswith('/auth/v1/admin/users/' + USER)
        assert kwargs['headers'] == {'apikey': 'sb_secret_test'}
        return httpx.Response(200, json={'id': USER})
    monkeypatch.setattr(admin.httpx, 'get', get)
    admin.verify_auth_account(USER)

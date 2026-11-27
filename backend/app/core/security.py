from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from app.database.connection import transaction
bearer=HTTPBearer(auto_error=False)
def authority(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials: raise HTTPException(401,'Sign in required')
    token=credentials.credentials
    if settings.demo_mode and token=='local-port-demo': subject='authority-demo'
    else:
        try:
            import jwt
            issuer=settings.supabase_url.rstrip('/')+'/auth/v1'
            key=jwt.PyJWKClient(issuer+'/.well-known/jwks.json').get_signing_key_from_jwt(token).key
            subject=jwt.decode(token,key,algorithms=['RS256','ES256'],audience=settings.supabase_jwt_audience,issuer=issuer,options={'require':['exp','sub','iss','aud']})['sub']
        except Exception: raise HTTPException(401,'Invalid or expired token')
    with transaction() as state:
        user=next((u for u in state['users'] if u['auth_user_id']==subject and u['active']),None)
    if not user or user['role']!='port' or user['port_id']!='NMP': raise HTTPException(403,'Port authority access required')
    return user

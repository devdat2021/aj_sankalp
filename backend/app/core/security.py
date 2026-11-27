from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from app.database.connection import transaction
bearer=HTTPBearer(auto_error=False)
def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials: raise HTTPException(401,'Sign in required')
    token=credentials.credentials
    demos = {'local-port-demo':'authority-demo', 'local-logistics-demo':'logistics-demo', 'local-driver-demo':'driver-demo', 'local-captain-demo':'captain-demo'}
    if settings.demo_mode and token in demos: subject=demos[token]
    else:
        try:
            import jwt
            issuer=settings.supabase_url.rstrip('/')+'/auth/v1'
            key=jwt.PyJWKClient(issuer+'/.well-known/jwks.json').get_signing_key_from_jwt(token).key
            subject=jwt.decode(token,key,algorithms=['RS256','ES256'],audience=settings.supabase_jwt_audience,issuer=issuer,options={'require':['exp','sub','iss','aud']})['sub']
        except Exception: raise HTTPException(401,'Invalid or expired token')
    with transaction() as state:
        user=next((u for u in state['users'] if u['auth_user_id']==subject and u['active']),None)
    if not user: raise HTTPException(403,'Active user mapping required')
    return user

def authority(user=Depends(current_user)):
    if user['role'] != 'port': raise HTTPException(403,'Port operations access required')
    return user

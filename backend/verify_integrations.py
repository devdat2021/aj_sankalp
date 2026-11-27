"""Explicit minimal real probes; prints no credentials or upstream response bodies."""
from app.services.intelligence_external import optimize, gemini, IntegrationError
from app.core.config import settings
from app.services.intelligence_external import effective_gemini_model
import sys
import httpx


def main():
    if '--model' in sys.argv:
        settings.gemini_model = sys.argv[sys.argv.index('--model')+1]
        settings.gemini_retired_model_fallback = ''
    if '--gemini-diagnostic' in sys.argv:
        r = httpx.post(f'https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent',
            headers={'x-goog-api-key': settings.gemini_api_key}, json={'contents':[{'parts':[{'text':'Reply OK'}]}], 'generationConfig':{'maxOutputTokens':32}}, timeout=30)
        print('Gemini minimal generation HTTP', r.status_code)
        if r.is_error:
            message = r.json().get('error', {}).get('message', '')
            for secret in (settings.gemini_api_key, settings.google_cloud_project, settings.google_application_credentials, settings.mongodb_uri):
                if secret: message = message.replace(secret, '[redacted]')
            print(message[:600])
        return
    if '--diagnose' in sys.argv:
        r = httpx.get('https://generativelanguage.googleapis.com/v1beta/models', headers={'x-goog-api-key': settings.gemini_api_key}, timeout=20)
        print('Gemini model discovery HTTP', r.status_code)
        if r.is_success:
            print('Available generation models:', [m['name'] for m in r.json().get('models', []) if 'generateContent' in m.get('supportedGenerationMethods', [])])
        result = optimize({'solvingMode': 'VALIDATE_ONLY', 'model': {
            'shipments': [{'deliveries': [{'arrivalLocation': {'latitude': 12.927, 'longitude': 74.81}}]}],
            'vehicles': [{'startLocation': {'latitude': 12.927, 'longitude': 74.81}, 'costPerHour': 1}]}})
        print('Google validation:', result.get('validationErrors', 'OK'))
        return
    probes = {
        'Gemini': lambda: gemini({'task': 'Return status ok for this connectivity check'}, {
            'type': 'object', 'properties': {'status': {'type': 'string', 'enum': ['ok']}},
            'required': ['status'], 'additionalProperties': False}),
        'Google Route Optimization': lambda: optimize({'solvingMode': 'VALIDATE_ONLY', 'model': {
            'shipments': [{'deliveries': [{'arrivalLocation': {'latitude': 12.927, 'longitude': 74.81}}]}],
            'vehicles': [{'startLocation': {'latitude': 12.927, 'longitude': 74.81}, 'costPerHour': 1}]}}),
    }
    for name, probe in probes.items():
        try:
            result = probe()
            print(name, 'FAILED validation' if result.get('validationErrors') else 'OK (real request)')
            if name == 'Gemini': print('Effective model:', effective_gemini_model())
            for error in result.get('validationErrors', []):
                print('Validation:', error.get('displayName'), error.get('errorMessage'))
        except IntegrationError as exc:
            print(name, str(exc))


if __name__ == '__main__':
    main()

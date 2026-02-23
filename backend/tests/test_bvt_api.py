import os
import uuid

os.environ.setdefault('DATABASE_URL', 'sqlite:///./.bvt-test.sqlite3')
os.environ.setdefault('COOKIE_SECURE', 'false')
os.environ.setdefault('COOKIE_SAMESITE', 'lax')

from fastapi.testclient import TestClient
from app.main import app


def test_health_ok():
    with TestClient(app) as client:
        r = client.get('/health')
        assert r.status_code == 200
        assert r.json() == {'ok': True}


def test_identifier_availability_validation():
    with TestClient(app) as client:
        r = client.get('/auth/identifier-availability', params={'identifier': ''})
        assert r.status_code == 422


def test_register_login_logout_roundtrip_username():
    username = f'bvt_{uuid.uuid4().hex[:10]}'
    password = 'bvtpass123'
    with TestClient(app) as client:
        reg = client.post('/auth/register', json={'identifier': username, 'password': password})
        assert reg.status_code == 200
        assert reg.json().get('authenticated') is True

        me = client.get('/auth/me')
        assert me.status_code == 200
        assert me.json().get('authenticated') is True
        assert me.json().get('email') == username

        out = client.post('/auth/logout')
        assert out.status_code == 200
        assert out.json().get('authenticated') is False

        me2 = client.get('/auth/me')
        assert me2.status_code == 200
        assert me2.json().get('authenticated') is False

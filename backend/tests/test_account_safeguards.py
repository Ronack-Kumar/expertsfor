"""Sign-up safeguards, email confirmation, auth rate limits and conversation ownership."""
import pytest

from app.core.config import settings
from app.services import mailer

STRONG = "orbit-lantern-maple-73"


async def register(client, email, password=STRONG):
    return await client.post("/api/v1/auth/register", json={"email": email, "password": password})


async def login(client, email, password=STRONG):
    return await client.post("/api/v1/auth/login", data={"username": email, "password": password})


@pytest.mark.asyncio
@pytest.mark.parametrize("password", ["Qwerty@123", "Password123!", "abc", "aaaaaaaaaaaa"])
async def test_weak_passwords_rejected(api_context, password):
    r = await register(api_context["client"], "weak@expertsfor-tests.dev", password)
    assert r.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("email", ["not-an-email", "x@mailinator.com", "x@example.com", "x@yopmail.com"])
async def test_unreal_emails_rejected(api_context, email):
    r = await register(api_context["client"], email)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_email_is_case_insensitive(api_context):
    c = api_context["client"]
    assert (await register(c, "Mixed.Case@ExpertsFor-Tests.dev")).status_code == 200
    assert (await register(c, "mixed.case@expertsfor-tests.dev")).status_code == 400
    assert (await login(c, "MIXED.case@expertsfor-tests.dev")).status_code == 200


@pytest.mark.asyncio
async def test_email_confirmation_flow(api_context, monkeypatch):
    c = api_context["client"]
    sent = []

    async def fake_send(to, token):
        sent.append(token)
        return True

    monkeypatch.setattr(settings, "BREVO_API_KEY", "test-key")
    monkeypatch.setattr(settings, "MAIL_FROM_EMAIL", "sender@expertsfor-tests.dev")
    monkeypatch.setattr(mailer, "send_verification_email", fake_send)

    r = await register(c, "confirm@expertsfor-tests.dev")
    assert r.status_code == 200 and r.json()["email_verified"] is False
    assert len(sent) == 1
    assert (await login(c, "confirm@expertsfor-tests.dev")).status_code == 403
    # the confirmation token must never work as an API token
    me = await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {sent[0]}"})
    assert me.status_code == 401
    assert (await c.post("/api/v1/auth/verify-email", json={"token": "x" * 40})).status_code == 400
    assert (await c.post("/api/v1/auth/verify-email", json={"token": sent[0]})).status_code == 200
    assert (await login(c, "confirm@expertsfor-tests.dev")).status_code == 200
    # resend never reveals whether an account exists
    r = await c.post("/api/v1/auth/resend-verification", json={"email": "nobody@expertsfor-tests.dev"})
    assert r.status_code == 200 and r.json() == {"sent": True}


@pytest.mark.asyncio
async def test_login_is_rate_limited(api_context):
    c = api_context["client"]
    await register(c, "limit@expertsfor-tests.dev")
    codes = [(await login(c, "limit@expertsfor-tests.dev", "wrong-password-0")).status_code for _ in range(12)]
    assert codes[:10] == [400] * 10 and codes[-1] == 429


@pytest.mark.asyncio
async def test_cannot_write_into_another_workspaces_conversation(api_context):
    c = api_context["client"]
    tokens = {}
    for name in ("a", "b"):
        email = f"owner-{name}@expertsfor-tests.dev"
        await register(c, email)
        tokens[name] = {"Authorization": f"Bearer {(await login(c, email)).json()['access_token']}"}
    wa = (await c.post("/api/v1/workspaces/", json={"name": "A"}, headers=tokens["a"])).json()["id"]
    wb = (await c.post("/api/v1/workspaces/", json={"name": "B"}, headers=tokens["b"])).json()["id"]
    conv = (await c.post(f"/api/v1/workspaces/{wa}/conversations", json={"title": "t"}, headers=tokens["a"])).json()["id"]
    r = await c.post(
        f"/api/v1/workspaces/{wb}/conversations/{conv}/messages",
        json={"role": "user", "content": "injected"},
        headers=tokens["b"],
    )
    assert r.status_code == 404
    r = await c.post(
        f"/api/v1/workspaces/{wa}/conversations/{conv}/messages",
        json={"role": "system", "content": "x"},
        headers=tokens["a"],
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_password_reset_flow(api_context, monkeypatch):
    c = api_context["client"]
    sent = []

    async def fake_reset(to, token):
        sent.append(token)
        return True

    await register(c, "reset@expertsfor-tests.dev")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "test-key")
    monkeypatch.setattr(settings, "MAIL_FROM_EMAIL", "sender@expertsfor-tests.dev")
    monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", False)
    monkeypatch.setattr(mailer, "send_password_reset_email", fake_reset)

    # same answer for known and unknown addresses
    known = await c.post("/api/v1/auth/forgot-password", json={"email": "reset@expertsfor-tests.dev"})
    unknown = await c.post("/api/v1/auth/forgot-password", json={"email": "nobody@expertsfor-tests.dev"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(sent) == 1

    token = sent[0]
    # the reset token is not an API token
    assert (await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})).status_code == 401
    # weak password refused, link still usable afterwards
    assert (await c.post("/api/v1/auth/reset-password", json={"token": token, "password": "Qwerty@123"})).status_code == 422
    new_pw = "copper-violet-harbor-58"
    assert (await c.post("/api/v1/auth/reset-password", json={"token": token, "password": new_pw})).status_code == 200
    # single use
    assert (await c.post("/api/v1/auth/reset-password", json={"token": token, "password": "another-strong-pass-91"})).status_code == 400
    assert (await login(c, "reset@expertsfor-tests.dev", new_pw)).status_code == 200
    assert (await login(c, "reset@expertsfor-tests.dev")).status_code == 400
    # junk token
    assert (await c.post("/api/v1/auth/reset-password", json={"token": "x" * 40, "password": new_pw})).status_code == 400


@pytest.mark.asyncio
async def test_duplicate_signup_is_not_revealed_when_email_is_on(api_context, monkeypatch):
    c = api_context["client"]
    notified = []

    async def fake_exists(to):
        notified.append(to)
        return True

    async def fake_verify(to, token):
        return True

    await register(c, "taken@expertsfor-tests.dev")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "test-key")
    monkeypatch.setattr(settings, "MAIL_FROM_EMAIL", "sender@expertsfor-tests.dev")
    monkeypatch.setattr(mailer, "send_account_exists_email", fake_exists)
    monkeypatch.setattr(mailer, "send_verification_email", fake_verify)

    dup = await register(c, "taken@expertsfor-tests.dev")
    fresh = await register(c, "fresh@expertsfor-tests.dev")
    assert dup.status_code == fresh.status_code == 200
    assert dup.json()["email_verified"] is False and fresh.json()["email_verified"] is False
    assert notified == ["taken@expertsfor-tests.dev"]

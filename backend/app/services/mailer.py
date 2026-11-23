"""Transactional email through Brevo's HTTP API.

HTTP is used instead of SMTP because Render's free plan blocks outbound SMTP.
"""
import html
import logging

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)
BREVO_URL = "https://api.brevo.com/v3/smtp/email"


async def send_email(to: str, subject: str, html_body: str, text_body: str) -> bool:
    if not settings.email_enabled:
        log.warning("Email not configured; skipped '%s' to %s", subject, to)
        return False
    payload = {
        "sender": {"email": settings.MAIL_FROM_EMAIL, "name": settings.MAIL_FROM_NAME},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html_body,
        "textContent": text_body,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(BREVO_URL, json=payload, headers={"api-key": settings.BREVO_API_KEY})
        if r.status_code >= 300:
            log.error("Brevo rejected email (%s): %s", r.status_code, r.text[:300])
            return False
        return True
    except httpx.HTTPError as exc:
        log.error("Email send failed: %s", exc)
        return False


async def send_verification_email(to: str, token: str) -> bool:
    link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}"
    safe = html.escape(link, quote=True)
    html_body = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#1A1A1E">
<h2 style="margin:0 0 12px">Confirm your GRID07 account</h2>
<p style="color:#555;line-height:1.6">Thanks for signing up. Confirm this is your email address to start using GRID07.</p>
<p style="margin:28px 0"><a href="{safe}" style="background:#1A1A1E;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Confirm email</a></p>
<p style="color:#888;font-size:13px;line-height:1.6">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
</div>"""
    text_body = f"Confirm your GRID07 account:\n{link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email."
    return await send_email(to, "Confirm your GRID07 account", html_body, text_body)

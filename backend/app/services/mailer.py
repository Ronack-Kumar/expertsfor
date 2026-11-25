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
        log.warning("Brevo accepted email '%s' (message id %s)", subject, r.json().get("messageId", "?"))
        return True
    except httpx.HTTPError as exc:
        log.error("Email send failed: %s", exc)
        return False


async def send_verification_email(to: str, token: str) -> bool:
    link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}"
    safe = html.escape(link, quote=True)
    html_body = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#1A1A1E">
<h2 style="margin:0 0 12px">Confirm your ExpertsFor account</h2>
<p style="color:#555;line-height:1.6">Thanks for signing up. Confirm this is your email address to start using ExpertsFor.</p>
<p style="margin:28px 0"><a href="{safe}" style="background:#1A1A1E;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Confirm email</a></p>
<p style="color:#888;font-size:13px;line-height:1.6">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
</div>"""
    text_body = f"Confirm your ExpertsFor account:\n{link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email."
    return await send_email(to, "Confirm your ExpertsFor account", html_body, text_body)


def _button_email(title: str, intro: str, button: str, link: str, footer: str) -> str:
    safe = html.escape(link, quote=True)
    return f"""<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#1A1A1E">
<h2 style="margin:0 0 12px">{html.escape(title)}</h2>
<p style="color:#555;line-height:1.6">{html.escape(intro)}</p>
<p style="margin:28px 0"><a href="{safe}" style="background:#1A1A1E;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">{html.escape(button)}</a></p>
<p style="color:#888;font-size:13px;line-height:1.6">{html.escape(footer)}</p>
</div>"""


async def send_password_reset_email(to: str, token: str) -> bool:
    link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    body = _button_email(
        "Reset your password",
        "Someone asked to reset the password for this account. If it was you, choose a new password below.",
        "Choose a new password",
        link,
        "This link works once and expires in 30 minutes. If you didn't ask for this, ignore this email; your password stays the same.",
    )
    text = f"Reset your password:\n{link}\n\nThis link works once and expires in 30 minutes. If you didn't ask for it, ignore this email."
    return await send_email(to, "Reset your password", body, text)


async def send_account_exists_email(to: str) -> bool:
    base = settings.FRONTEND_URL.rstrip("/")
    body = _button_email(
        "You already have an account",
        "Someone tried to create a new account with this email address, but you already have one. You can sign in, or reset your password if you've forgotten it.",
        "Reset password",
        f"{base}/forgot-password",
        "If this wasn't you, you can ignore this email; nothing has changed.",
    )
    text = f"You already have an account with this email. Sign in at {base}/login or reset your password at {base}/forgot-password."
    return await send_email(to, "You already have an account", body, text)

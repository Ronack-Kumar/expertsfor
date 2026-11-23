"""Sign-up safeguards: real email addresses and strong passwords."""
import asyncio

from email_validator import EmailNotValidError, validate_email
from zxcvbn import zxcvbn

# Throwaway inbox providers commonly used to farm accounts
DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com",
    "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "throwawaymail.com",
    "yopmail.com", "yopmail.net", "getnada.com", "nada.email", "trashmail.com", "trashmail.de", "dispostable.com",
    "maildrop.cc", "mailnesia.com", "mintemail.com", "mohmal.com", "fakeinbox.com", "emailondeck.com",
    "spamgourmet.com", "mailcatch.com", "tempinbox.com", "burnermail.io", "moakt.com", "tempail.com",
    "getairmail.com", "inboxkitten.com", "mail.tm", "mailpoof.com", "33mail.com", "spambox.us",
    "emailfake.com", "fakemail.net", "tmpmail.org", "tmpmail.net", "minuteinbox.com", "mytemp.email",
    "discard.email", "mailsac.com", "harakirimail.com", "byom.de", "grr.la", "anonaddy.me",
}
# Reserved / example domains that can never receive mail
RESERVED_DOMAINS = {"example.com", "example.org", "example.net", "test.com", "localhost"}

MIN_PASSWORD_LENGTH = 10
MIN_PASSWORD_SCORE = 3  # zxcvbn 0-4


class AccountCheckError(ValueError):
    pass


def _validate_email_sync(email: str, check_dns: bool) -> str:
    try:
        info = validate_email(email, check_deliverability=check_dns, timeout=5)
    except EmailNotValidError as exc:
        raise AccountCheckError(f"Please use a real email address. {exc}") from exc
    domain = info.domain.lower()
    if domain in RESERVED_DOMAINS or domain.endswith(".test") or domain.endswith(".invalid"):
        raise AccountCheckError("Please use a real email address you can receive mail at.")
    if domain in DISPOSABLE_DOMAINS:
        raise AccountCheckError("Temporary or disposable email addresses aren't allowed.")
    return info.normalized


async def check_email(email: str, check_dns: bool = True) -> str:
    """Return the normalised address, or raise if it can't receive mail."""
    return await asyncio.to_thread(_validate_email_sync, email, check_dns)


def check_password(password: str, email: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AccountCheckError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    local = email.split("@")[0]
    result = zxcvbn(password[:100], user_inputs=[email, local, "grid07"])
    if result["score"] < MIN_PASSWORD_SCORE:
        hint = result["feedback"].get("warning") or "It is too easy to guess."
        tips = " ".join(result["feedback"].get("suggestions") or [])
        raise AccountCheckError(
            f"Choose a stronger password. {hint} {tips} Try a few unrelated words, e.g. 'river-lamp-orbit-42'.".replace("  ", " ")
        )

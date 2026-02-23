import os
import smtplib
from email.message import EmailMessage

from .logging_utils import log_event, mask_email

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() != "false"


def smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_FROM)


def send_email_verification_code(email: str, code: str) -> str:
    subject = "SpendIQ - Email verification code"
    body = (
        "Use this 6-digit verification code to complete your SpendIQ registration:\n\n"
        f"{code}\n\n"
        "This code expires in 10 minutes. If you did not request this, you can ignore this email."
    )

    if not smtp_configured():
        log_event('warning', 'email_verify.dev_fallback_code_generated', email=mask_email(email), verification_code=code)
        return "debug_console"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = email
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        if SMTP_USE_TLS:
            smtp.starttls()
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(msg)
    log_event('info', 'email_verify.smtp_sent', email=mask_email(email))
    return "smtp"

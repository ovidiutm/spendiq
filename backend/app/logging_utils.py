import json
import logging
import os
import re
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_request_id_ctx: ContextVar[Optional[str]] = ContextVar('request_id', default=None)


def set_request_id(value: Optional[str]):
    return _request_id_ctx.set(value)


def reset_request_id(token) -> None:
    _request_id_ctx.reset(token)


def get_request_id() -> Optional[str]:
    return _request_id_ctx.get()


def _safe_json(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _safe_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_safe_json(v) for v in value]
    return str(value)


class PlainTextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        rid = get_request_id()
        rid_part = f" request_id={rid}" if rid else ""
        event_name = getattr(record, 'event_name', None)
        fields = getattr(record, 'event_fields', None)
        fields_part = ''
        if isinstance(fields, dict) and fields:
            parts = [f"{k}={_safe_json(v)}" for k, v in fields.items()]
            fields_part = ' ' + ' '.join(parts)
        prefix = event_name or record.name
        return f"[{record.levelname}] {prefix}{rid_part} {record.getMessage()}{fields_part}".strip()


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            'ts': datetime.now(timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        rid = get_request_id()
        if rid:
            payload['request_id'] = rid
        event_name = getattr(record, 'event_name', None)
        if event_name:
            payload['event'] = event_name
        event_fields = getattr(record, 'event_fields', None)
        if isinstance(event_fields, dict):
            payload.update(_safe_json(event_fields))
        if record.exc_info:
            payload['exc_info'] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{8,30}\b")
SENSITIVE_KEY_PARTS = ('password', 'token', 'cookie', 'secret', 'authorization')


def mask_iban(value: str) -> str:
    raw = (value or '').replace(' ', '')
    if len(raw) < 8:
        return value
    return raw[:4] + '*' * max(4, len(raw) - 8) + raw[-4:]


def _mask_ibans_in_text(value: str) -> str:
    return IBAN_RE.sub(lambda m: mask_iban(m.group(0)), value)


def _sanitize_log_field(key: Optional[str], value: Any) -> Any:
    key_l = (key or '').lower()
    if any(part in key_l for part in SENSITIVE_KEY_PARTS):
        return '[REDACTED]'
    if isinstance(value, dict):
        return {str(k): _sanitize_log_field(str(k), v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_log_field(key, v) for v in value]
    if isinstance(value, str):
        if ('email' in key_l or key_l == 'identifier') and '@' in value:
            return mask_email(value)
        return _mask_ibans_in_text(value)
    return value



_logger: Optional[logging.Logger] = None


def configure_logging() -> logging.Logger:
    global _logger
    if _logger is not None:
        return _logger

    logger = logging.getLogger('spendiq')
    logger.setLevel(getattr(logging, os.getenv('LOG_LEVEL', 'INFO').upper(), logging.INFO))
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler()
        use_json = os.getenv('LOG_JSON', 'true').lower() not in {'0', 'false', 'off', 'no'}
        handler.setFormatter(JsonFormatter() if use_json else PlainTextFormatter())
        logger.addHandler(handler)
    _logger = logger
    return logger


def get_logger() -> logging.Logger:
    return configure_logging()


def log_event(level: str, event_name: str, **fields: Any) -> None:
    logger = get_logger()
    log_fn = getattr(logger, level.lower(), logger.info)
    safe_fields = {k: _sanitize_log_field(k, v) for k, v in fields.items()}
    log_fn(event_name, extra={'event_name': event_name, 'event_fields': safe_fields})


def mask_email(email: str) -> str:
    email = (email or '').strip()
    if '@' not in email:
        return email
    user, domain = email.split('@', 1)
    if len(user) <= 2:
        masked_user = user[:1] + '*'
    else:
        masked_user = user[:2] + '*' * max(1, len(user) - 2)
    return f'{masked_user}@{domain}'

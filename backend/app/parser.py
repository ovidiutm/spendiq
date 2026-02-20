
import re
from datetime import date
from typing import Any, List, Dict, Optional, Tuple

MONTHS_RO = {
    "ianuarie": 1, "februarie": 2, "martie": 3, "aprilie": 4, "mai": 5, "iunie": 6,
    "iulie": 7, "august": 8, "septembrie": 9, "octombrie": 10, "noiembrie": 11, "decembrie": 12
}

DATE_LINE_RE = re.compile(r"^(?P<dd>\d{2})\s+(?P<mon>[a-zăîâșț]+)\s+(?P<yyyy>\d{4})\s+(?P<rest>.+)$", re.IGNORECASE)

AMOUNT_RE = re.compile(r"(?<!\d)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)")  # 9.465,00 or 117,00
AMOUNT_TOKEN_RE = re.compile(r"^(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})$")
# Some lines contain exchange amounts with EUR/USD; for V1 we take the RON amount shown in Debit/Credit column (usually last standalone amount).

def parse_ron_amount(s: str) -> Optional[float]:
    s = s.strip()
    # normalize thousands '.' and decimal ','
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None

def parse_date_ro(dd: str, mon: str, yyyy: str) -> date:
    m = MONTHS_RO.get(mon.lower())
    if not m:
        raise ValueError(f"Unknown month: {mon}")
    return date(int(yyyy), int(m), int(dd))

def format_date_ddmmyyyy(d: date) -> str:
    return d.strftime("%d/%m/%Y")

def clean_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()

def normalize_ro(s: str) -> str:
    """
    Normalize common Romanian diacritics for robust prefix matching.
    """
    return (
        s.lower()
        .replace("ă", "a")
        .replace("â", "a")
        .replace("î", "i")
        .replace("ș", "s")
        .replace("ş", "s")
        .replace("ț", "t")
        .replace("ţ", "t")
    )

def value_after_colon(s: str) -> str:
    if ":" not in s:
        return ""
    return clean_spaces(s.split(":", 1)[1])

def normalize_statement_period(value: str) -> str:
    raw = clean_spaces(value)
    if not raw:
        return raw

    # Already dd/mm/yyyy - dd/mm/yyyy
    m_slash = re.search(
        r"(\d{1,2})/(\d{1,2})/(\d{4}).*?(\d{1,2})/(\d{1,2})/(\d{4})",
        raw,
        re.IGNORECASE,
    )
    if m_slash:
        d1 = date(int(m_slash.group(3)), int(m_slash.group(2)), int(m_slash.group(1)))
        d2 = date(int(m_slash.group(6)), int(m_slash.group(5)), int(m_slash.group(4)))
        return f"{format_date_ddmmyyyy(d1)} - {format_date_ddmmyyyy(d2)}"

    # Romanian month names: "DD luna YYYY ... DD luna YYYY"
    m_ro = re.search(
        r"(\d{1,2})\s+([a-zA-ZăâîșşțţÄƒÃ¢Ã®È™ÅŸÈ›Å£]+)\s+(\d{4}).*?(\d{1,2})\s+([a-zA-ZăâîșşțţÄƒÃ¢Ã®È™ÅŸÈ›Å£]+)\s+(\d{4})",
        raw,
        re.IGNORECASE,
    )
    if m_ro:
        mon1 = MONTHS_RO.get(normalize_ro(m_ro.group(2)))
        mon2 = MONTHS_RO.get(normalize_ro(m_ro.group(5)))
        if mon1 and mon2:
            d1 = date(int(m_ro.group(3)), mon1, int(m_ro.group(1)))
            d2 = date(int(m_ro.group(6)), mon2, int(m_ro.group(4)))
            return f"{format_date_ddmmyyyy(d1)} - {format_date_ddmmyyyy(d2)}"

    return raw

def empty_statement_details() -> Dict[str, Optional[str]]:
    return {
        "account_holder": None,
        "account_number": None,
        "account_type": None,
        "statement_period": None,
    }

def _extract_statement_details_from_lines(lines: List[str]) -> Dict[str, Optional[str]]:
    details = empty_statement_details()

    def extract_labeled_value(source: str, label: str) -> Optional[str]:
        # Capture value after "<label>:" until next known label or line end.
        pattern = re.compile(
            rf"{re.escape(label)}\s*:\s*(.+?)(?=(titular cont|numar cont|tip cont|moneda|pentru perioada|cif)\s*:|$)",
            re.IGNORECASE,
        )
        m = pattern.search(source)
        if not m:
            return None
        value = clean_spaces(m.group(1))
        return value or None

    for raw in lines:
        line = clean_spaces(str(raw))
        if not line:
            continue

        if details["account_holder"] is None:
            holder = extract_labeled_value(line, "Titular cont")
            if holder:
                details["account_holder"] = holder
        if details["account_number"] is None:
            account_number = extract_labeled_value(line, "Numar cont")
            if account_number:
                details["account_number"] = account_number
        if details["account_type"] is None:
            account_type = extract_labeled_value(line, "Tip cont")
            if account_type:
                details["account_type"] = account_type
        if details["statement_period"] is None:
            statement_period = extract_labeled_value(line, "Pentru perioada")
            if statement_period:
                details["statement_period"] = normalize_statement_period(statement_period)

    return details

def extract_statement_details_pdf(pdf: Any) -> Dict[str, Optional[str]]:
    details = empty_statement_details()

    for page in pdf.pages:
        words = page.extract_words() or []
        if not words:
            continue

        lines_words = group_words_by_line(words)
        header_lines, _, _ = split_page_sections(lines_words)
        source_lines_words = header_lines if header_lines else lines_words[:40]
        source_lines = [line_text_from_words(ln) for ln in source_lines_words]
        page_details = _extract_statement_details_from_lines(source_lines)

        for key, value in page_details.items():
            if details[key] is None and value:
                details[key] = value

        if all(details.values()):
            break

    return details

def extract_statement_details_text(text: str) -> Dict[str, Optional[str]]:
    lines = [clean_spaces(ln) for ln in text.splitlines() if clean_spaces(ln)]
    return _extract_statement_details_from_lines(lines)

def looks_like_ing_statement_pdf(pdf: Any) -> bool:
    """
    Detect ING statement layout by checking for the known table header:
    Data | Detalii tranzactie | Debit | Credit
    """
    for page in pdf.pages:
        words = page.extract_words() or []
        if not words:
            continue
        lines_words = group_words_by_line(words)
        header_lines, _, _ = split_page_sections(lines_words)
        if header_lines:
            return True
    return False

def looks_like_ing_statement_text(text: str) -> bool:
    low = normalize_ro(text or "")
    has_table_header = ("detalii tranzactie" in low and "debit" in low and "credit" in low)
    has_statement_marker = ("extras de cont" in low or "titular cont:" in low or "numar cont:" in low)
    return has_table_header or (has_statement_marker and "pentru perioada:" in low)

def infer_direction(tx_title: str, blob: str, lines: List[str], method: Optional[str] = None) -> str:
    lower_lines = [ln.lower() for ln in lines]
    has_ordonator = any(ln.startswith("ordonator:") for ln in lower_lines)
    has_beneficiar = any(ln.startswith("beneficiar:") for ln in lower_lines)

    # Method inferred from structured lines is a strong signal.
    if method == "transfer_in":
        return "credit"
    if method == "transfer_out" or method == "card_pos":
        return "debit"

    # Statement party markers are the strongest signal.
    # "Beneficiar" indicates money sent (debit). If both exist, treat as debit.
    if has_beneficiar:
        return "debit"
    if has_ordonator:
        return "credit"

    # Fallback when no structural cues are available.
    return "debit"

def group_words_by_line(words: List[Dict[str, Any]], y_tol: float = 2.0) -> List[List[Dict[str, Any]]]:
    """
    Group pdfplumber words into visual lines using Y proximity.
    """
    if not words:
        return []
    ordered = sorted(words, key=lambda w: (float(w.get("top", 0.0)), float(w.get("x0", 0.0))))
    lines: List[List[Dict[str, Any]]] = []
    line_tops: List[float] = []
    for w in ordered:
        top = float(w.get("top", 0.0))
        if not lines or abs(top - line_tops[-1]) > y_tol:
            lines.append([w])
            line_tops.append(top)
        else:
            lines[-1].append(w)
            line_tops[-1] = (line_tops[-1] + top) / 2.0
    for ln in lines:
        ln.sort(key=lambda w: float(w.get("x0", 0.0)))
    return lines

def line_text_from_words(line_words: List[Dict[str, Any]]) -> str:
    return clean_spaces(" ".join(str(w.get("text", "")) for w in line_words))

def split_page_sections(
    lines_words: List[List[Dict[str, Any]]]
) -> Tuple[List[List[Dict[str, Any]]], List[List[Dict[str, Any]]], List[List[Dict[str, Any]]]]:
    """
    Split a page into header/table/footer using the table header row and footer markers.
    We only parse rows from the table section.
    """
    if not lines_words:
        return [], [], []

    header_idx: Optional[int] = None
    for i, ln_words in enumerate(lines_words):
        txt = normalize_ro(line_text_from_words(ln_words))
        if "data" in txt and "detalii tranzactie" in txt and "debit" in txt and "credit" in txt:
            header_idx = i
            break

    if header_idx is None:
        # Fallback: unknown layout, keep old behavior (parse everything).
        return [], lines_words, []

    footer_idx = len(lines_words)
    for i in range(header_idx + 1, len(lines_words)):
        txt = normalize_ro(line_text_from_words(lines_words[i]))
        if (
            "www.ing.ro/dgs" in txt
            or "informatii despre schema" in txt
            or "ing bank n.v." in txt
            or "sucursala bucuresti" in txt
            or "in locatiile bancii" in txt
            or re.match(r"^\d{1,3}\s*/\s*\d{1,3}$", txt)
            or re.match(r"^pagina\s+\d{1,3}(\s+din\s+\d{1,3})?$", txt)
        ):
            footer_idx = i
            break

    header_lines = lines_words[:header_idx + 1]
    table_lines = lines_words[header_idx + 1:footer_idx]
    footer_lines = lines_words[footer_idx:]
    return header_lines, table_lines, footer_lines

def find_column_centers(page_words: List[Dict[str, Any]]) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """
    Locate Debit/Credit (and optional Balance) header centers on the page.
    """
    debit_word = None
    credit_word = None
    balance_word = None
    for w in sorted(page_words, key=lambda x: float(x.get("top", 0.0))):
        text = str(w.get("text", "")).strip().lower()
        if text == "debit" and debit_word is None:
            debit_word = w
        elif text == "credit" and credit_word is None:
            credit_word = w
        elif text in {"balanta", "balanța", "sold", "saldo"} and balance_word is None:
            balance_word = w
        if debit_word is not None and credit_word is not None and balance_word is not None:
            break
    if debit_word is None or credit_word is None:
        return None, None, None
    debit_x = (float(debit_word.get("x0", 0.0)) + float(debit_word.get("x1", 0.0))) / 2.0
    credit_x = (float(credit_word.get("x0", 0.0)) + float(credit_word.get("x1", 0.0))) / 2.0
    balance_x = None
    if balance_word is not None:
        balance_x = (float(balance_word.get("x0", 0.0)) + float(balance_word.get("x1", 0.0))) / 2.0
    return debit_x, credit_x, balance_x

def extract_column_amounts_from_line(
    line_words: List[Dict[str, Any]],
    debit_x: Optional[float],
    credit_x: Optional[float],
    balance_x: Optional[float] = None,
) -> Tuple[Optional[float], Optional[float]]:
    """
    Map amount tokens to Debit/Credit columns using their X position.
    """
    if debit_x is None or credit_x is None:
        return None, None
    left_col = min(debit_x, credit_x)

    debit_candidate: Tuple[float, str] | None = None
    credit_candidate: Tuple[float, str] | None = None
    column_points: List[Tuple[str, float]] = [("debit", debit_x), ("credit", credit_x)]
    if balance_x is not None:
        column_points.append(("balance", balance_x))
    max_snap_dist = max(45.0, abs(debit_x - credit_x) * 0.45)

    for w in line_words:
        text = str(w.get("text", "")).strip()
        if not AMOUNT_TOKEN_RE.fullmatch(text):
            continue
        cx = (float(w.get("x0", 0.0)) + float(w.get("x1", 0.0))) / 2.0

        # Ignore detail-section amounts (FX, exchange rate notes) far from amount columns.
        if cx < (left_col - 90.0):
            continue

        nearest_name, nearest_dist = min(
            ((name, abs(cx - col_x)) for name, col_x in column_points),
            key=lambda x: x[1],
        )
        if nearest_dist > max_snap_dist:
            continue
        if nearest_name == "balance":
            continue
        if nearest_name == "debit":
            if debit_candidate is None or nearest_dist < debit_candidate[0]:
                debit_candidate = (nearest_dist, text)
        else:
            if credit_candidate is None or nearest_dist < credit_candidate[0]:
                credit_candidate = (nearest_dist, text)

    debit_value = parse_ron_amount(debit_candidate[1]) if debit_candidate else None
    credit_value = parse_ron_amount(credit_candidate[1]) if credit_candidate else None
    return debit_value, credit_value

def extract_title_from_words(line_words: List[Dict[str, Any]]) -> str:
    """
    Build title from date line words by excluding date prefix and amount tokens.
    """
    if len(line_words) <= 3:
        return ""
    detail_words = [str(w.get("text", "")).strip() for w in line_words[3:]]
    detail_words = [w for w in detail_words if w and not AMOUNT_TOKEN_RE.fullmatch(w)]
    return clean_spaces(" ".join(detail_words))

def extract_party(tx_title: str, lines: List[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns (merchant_or_counterparty, method_details)
    """
    merchant = None
    method = None

    # Preferred card merchant fields in ING details section.
    for ln in lines:
        norm = normalize_ro(ln).strip()
        if norm.startswith("tranzactie la:") or norm.startswith("platita la:"):
            candidate = value_after_colon(ln)
            if candidate:
                merchant = candidate
                method = "card_pos"
                break

    # Prefer Terminal only if explicit merchant fields are missing.
    if merchant is None:
        for ln in lines:
            if normalize_ro(ln).strip().startswith("terminal:"):
                candidate = value_after_colon(ln)
                if candidate:
                    merchant = candidate
                    method = "card_pos"
                    break

    if merchant is None:
        for ln in lines:
            if normalize_ro(ln).strip().startswith("beneficiar:"):
                candidate = value_after_colon(ln)
                if candidate:
                    merchant = candidate
                    method = "transfer_out"
                    break

    if merchant is None:
        for ln in lines:
            if normalize_ro(ln).strip().startswith("ordonator:"):
                candidate = value_after_colon(ln)
                if candidate:
                    merchant = candidate
                    method = "transfer_in"
                    break

    if merchant is None:
        # fallback: title itself
        merchant = clean_spaces(tx_title)

    return merchant, method

def extract_amount(lines: List[str]) -> Optional[float]:
    """
    Heuristic:
      - Prefer a line that is ONLY an amount (e.g., "9.465,00")
      - Else prefer an amount at end of the first line (date line often ends with amount)
      - Else take the last amount occurrence in the transaction block
    """
    # 1) standalone amount line
    for ln in reversed(lines):
        if AMOUNT_RE.fullmatch(ln.strip()):
            return parse_ron_amount(ln)

    # 2) end-of-line amounts (common on date line)
    for ln in lines[:2]:
        m = AMOUNT_RE.search(ln)
        if m and ln.strip().endswith(m.group(1)):
            return parse_ron_amount(m.group(1))

    # 3) last occurrence anywhere
    last = None
    for ln in lines:
        for m in AMOUNT_RE.finditer(ln):
            last = m.group(1)
    return parse_ron_amount(last) if last else None

def extract_title_from_date_line(rest: str) -> str:
    # Remove trailing amount(s) if present (Debit/Credit columns)
    rest = re.sub(r"(\s+\d{1,3}(?:\.\d{3})*,\d{2}){1,2}\s*$", "", rest).strip()
    return clean_spaces(rest)

def is_noise_line(ln: str) -> bool:
    """
    Filters headers/footers and legal/signature lines that are not transaction details.
    """
    text = clean_spaces(ln)
    if not text:
        return True
    low = normalize_ro(text)

    if (
        low.startswith("titular cont:")
        or low.startswith("numar cont:")
        or low.startswith("tip cont:")
        or low.startswith("moneda:")
        or low.startswith("extras de cont")
        or low.startswith("pentru perioada:")
        or low.startswith("cif:")
    ):
        return True

    if "informatii despre schema" in low:
        return True
    if "acest document" in low:
        return True
    if "sef serviciu" in low:
        return True
    if "ing bank n.v." in low:
        return True
    if "sucursala bucuresti" in low:
        return True
    if "www.ing.ro/dgs" in low:
        return True
    if "in locatiile bancii" in low:
        return True

    if re.match(r"^\d{1,3}\s*/\s*\d{1,3}$", low):
        return True
    if re.match(r"^pagina\s+\d{1,3}(\s+din\s+\d{1,3})?$", low):
        return True
    if re.match(r"^\d{1,2}/\d{2}\s+informatii despre schema", low):
        return True

    return False

def parse_ing_statement_pdf(pdf: Any) -> List[Dict]:
    """
    Parse ING statement using PDF coordinates so Debit/Credit columns drive direction.
    """
    txs: List[Dict] = []
    current: Optional[Dict[str, Any]] = None
    current_lines: List[str] = []
    current_debit: Optional[float] = None
    current_credit: Optional[float] = None

    def flush():
        nonlocal current, current_lines, current_debit, current_credit
        if not current:
            return

        merchant, method = extract_party(current["title"], current_lines)

        amount: Optional[float] = None
        direction: Optional[str] = None
        debit_val = current_debit if current_debit not in (None, 0.0) else None
        credit_val = current_credit if current_credit not in (None, 0.0) else None

        if debit_val is not None and credit_val is None:
            direction = "debit"
            amount = -abs(debit_val)
        elif credit_val is not None and debit_val is None:
            direction = "credit"
            amount = abs(credit_val)
        elif debit_val is not None and credit_val is not None:
            if abs(credit_val) >= abs(debit_val):
                direction = "credit"
                amount = abs(credit_val)
            else:
                direction = "debit"
                amount = -abs(debit_val)
        else:
            # Last-resort fallback for malformed extraction.
            inferred = infer_direction(current["title"], " ".join(current_lines), current_lines, method)
            extracted = extract_amount(current_lines)
            direction = inferred
            if extracted is not None:
                amount = -abs(extracted) if inferred == "debit" else abs(extracted)

        txs.append({
            "date": current["date"].isoformat(),
            "title": current["title"],
            "merchant": merchant,
            "method": method,
            "amount": amount,
            "currency": "RON",
            "direction": direction or "debit",
            "raw_lines": current_lines,
        })
        current = None
        current_lines = []
        current_debit = None
        current_credit = None

    for page in pdf.pages:
        words = page.extract_words() or []
        if not words:
            continue

        debit_x, credit_x, balance_x = find_column_centers(words)
        lines_words = group_words_by_line(words)
        _, table_lines_words, _ = split_page_sections(lines_words)
        active_lines_words = table_lines_words if table_lines_words else lines_words

        for ln_words in active_lines_words:
            ln_text = line_text_from_words(ln_words)
            if is_noise_line(ln_text):
                continue

            # Skip obvious headers/footers.
            lower = normalize_ro(ln_text)
            if lower.startswith("data") and "detalii tranzactie" in lower and "debit" in lower and "credit" in lower:
                continue
            if ln_text.startswith("Titular cont:") or ln_text.startswith("Numar cont:") or ln_text.startswith("Tip cont:") or ln_text.startswith("Moneda:"):
                continue
            if re.match(r"^\d{1,2}/\d{2}\s+Informatii despre schema", ln_text):
                continue
            if ln_text.startswith("Roxana Petria") or ln_text.startswith("Alexandra Ilie") or "Åžef Serviciu" in ln_text or "Informatii despre schema" in ln_text:
                continue
            if ln_text.startswith("Extras de cont") or ln_text.startswith("Pentru perioada:") or ln_text.startswith("CIF:"):
                continue

            m = DATE_LINE_RE.match(ln_text)
            if m:
                flush()
                d = parse_date_ro(m.group("dd"), m.group("mon"), m.group("yyyy"))
                title = extract_title_from_words(ln_words) or extract_title_from_date_line(m.group("rest"))
                current = {"date": d, "title": title}
                current_lines = [ln_text]
                d_amt, c_amt = extract_column_amounts_from_line(ln_words, debit_x, credit_x, balance_x)
                current_debit = d_amt
                current_credit = c_amt
            else:
                if current is not None:
                    current_lines.append(ln_text)
                    d_amt, c_amt = extract_column_amounts_from_line(ln_words, debit_x, credit_x, balance_x)
                    if d_amt not in (None, 0.0):
                        current_debit = d_amt
                    if c_amt not in (None, 0.0):
                        current_credit = c_amt

    flush()
    return txs

def parse_ing_statement_text(text: str) -> List[Dict]:
    """
    Parse ING RO account statement exported as text PDF.
    Works on the sample format where each transaction starts with:
      'DD <month> YYYY <Details> [amount]'
    and continues with structured lines (Terminal, Beneficiar, etc.).
    """
    lines = [ln.strip() for ln in text.splitlines()]
    # Remove obvious headers/footers
    cleaned = []
    for ln in lines:
        if is_noise_line(ln):
            continue
        if not ln:
            continue
        if ln.startswith("Titular cont:") or ln.startswith("Numar cont:") or ln.startswith("Tip cont:") or ln.startswith("Moneda:"):
            continue
        if re.match(r"^\d{1,2}/\d{2}\s+Informatii despre schema", ln):
            continue
        if ln.startswith("Roxana Petria") or ln.startswith("Alexandra Ilie") or "Şef Serviciu" in ln or "Informatii despre schema" in ln:
            continue
        if ln.startswith("Extras de cont") or ln.startswith("Pentru perioada:") or ln.startswith("CIF:"):
            continue
        cleaned.append(ln)

    txs: List[Dict] = []
    current: Optional[Dict] = None
    current_lines: List[str] = []

    def flush():
        nonlocal current, current_lines
        if not current:
            return
        amount = extract_amount(current_lines)
        merchant, method = extract_party(current["title"], current_lines)
        direction = infer_direction(current["title"], " ".join(current_lines), current_lines, method)
        signed = amount if amount is not None else None
        if signed is not None and direction == "debit":
            signed = -abs(signed)
        elif signed is not None and direction == "credit":
            signed = abs(signed)

        txs.append({
            "date": current["date"].isoformat(),
            "title": current["title"],
            "merchant": merchant,
            "method": method,
            "amount": signed,
            "currency": "RON",
            "direction": direction,
            "raw_lines": current_lines,
        })
        current = None
        current_lines = []

    for ln in cleaned:
        m = DATE_LINE_RE.match(ln)
        if m:
            # start new transaction
            flush()
            d = parse_date_ro(m.group("dd"), m.group("mon"), m.group("yyyy"))
            rest = m.group("rest")
            title = extract_title_from_date_line(rest)
            current = {"date": d, "title": title}
            current_lines = [ln]
        else:
            if current is not None:
                current_lines.append(ln)

    flush()
    return txs

# ----------------- Categorization -----------------

DEFAULT_RULES = [
    # Utilities & bills
    (r"\b(engie)\b", "Utilities"),
    (r"\b(digi|digi romania)\b", "Internet/Phone"),
    (r"\b(orange)\b", "Internet/Phone"),
    (r"\b(hidroelectrica)\b", "Utilities"),
    (r"\b(ghiseul\.ro)\b", "Taxes/Fees"),

    # Groceries
    (r"\b(lidl)\b", "Groceries"),
    (r"\b(profi)\b", "Groceries"),
    (r"\b(carrefour)\b", "Groceries"),
    (r"\b(auchan)\b", "Groceries"),

    # Transport & fuel
    (r"\b(mol|rompetrol)\b", "Transport/Fuel"),
    (r"\b(rat\s+craiova)\b", "Transport"),

    # Shopping / ecom
    (r"\b(emag|payu\*emag|twisto_emag)\b", "Shopping"),
    (r"\b(temu|aliexpress|trendyol|answear)\b", "Shopping"),
    (r"\b(dedeman|leroy merlin|jumbo)\b", "Home/DIY"),

    # Restaurants
    (r"\b(kfc|mcd|burger king)\b", "Restaurants"),

    # Subscriptions / digital
    (r"\b(netflix)\b", "Subscriptions"),
    (r"\b(spotify)\b", "Subscriptions"),
    (r"\b(sk(y)?showtime)\b", "Subscriptions"),
    (r"\b(amazon prime)\b", "Subscriptions"),
    (r"\b(google \*youtubepremium|youtubepremium)\b", "Subscriptions"),
    (r"\b(steam|steamgames\.com|steam purchase)\b", "Entertainment"),
    (r"\b(apple\.com/bill)\b", "Subscriptions"),
    (r"\b(openai \*chatgpt)\b", "Subscriptions"),

        # Transfers / internal movements
    (r"\b(transfer home'bank|transfer)\b", "Transfers"),
    (r"\b(alimentare card credit)\b", "Transfers"),
    (r"\b(plata debit direct)\b", "Bills"),

    # Banking internal
    (r"\b(tranzactie round up)\b", "Savings"),
    (r"\b(rata credit)\b", "Loans"),
    (r"\b(suma transferata din linia de credit)\b", "Loans"),
    (r"\b(taxe si comisioane)\b", "Fees"),
]

def normalize_iban_like(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())

def tx_mentions_target_account(tx: Dict, target_iban: str) -> bool:
    normalized_target = normalize_iban_like(target_iban)
    pieces: List[str] = []
    pieces.append(str(tx.get("title", "")))
    pieces.append(str(tx.get("merchant", "")))
    raw_lines = tx.get("raw_lines")
    if isinstance(raw_lines, list):
        pieces.extend(str(x) for x in raw_lines)
    haystack = normalize_iban_like(" ".join(pieces))
    return normalized_target in haystack

def target_account_flow(tx: Dict, target_iban: str) -> Optional[str]:
    """
    Returns:
    - "in"  when money flows into target account (Beneficiar is target)
    - "out" when money flows out of target account (Ordonator is target)
    """
    normalized_target = normalize_iban_like(target_iban)
    raw_lines = tx.get("raw_lines")
    if not isinstance(raw_lines, list):
        raw_lines = []

    lines = [str(ln) for ln in raw_lines]
    lines_norm = [normalize_ro(ln) for ln in lines]
    lines_iban = [normalize_iban_like(ln) for ln in lines]

    def has_target(idx: int) -> bool:
        if idx < 0 or idx >= len(lines_iban):
            return False
        return normalized_target in lines_iban[idx]

    in_score = 0
    out_score = 0

    # Explicit account flow markers in ING details (highest priority).
    for i, lnorm in enumerate(lines_norm):
        has_target_near = has_target(i) or has_target(i + 1) or has_target(i - 1)
        if not has_target_near:
            continue
        # Check "din contul" first; otherwise "in contul" would match as substring.
        if re.search(r"(^|\s)din contul(\s|:|$)", lnorm):
            return "out"
        if re.search(r"(^|\s)in contul(\s|:|$)", lnorm):
            return "in"

    merchant_norm = normalize_iban_like(str(tx.get("merchant", "")))
    method = str(tx.get("method", "") or "")

    # Strong direct signal from extracted transfer party.
    if merchant_norm == normalized_target:
        if method == "transfer_out":
            return "in"
        if method == "transfer_in":
            return "out"

    in_markers = ("beneficiar", "destinatar", "catre", "cont beneficiar", "iban beneficiar")
    out_markers = ("ordonator", "platitor", "cont ordonator", "iban ordonator", "din cont")

    for i, lnorm in enumerate(lines_norm):
        # Direct mention with marker on same line.
        if has_target(i):
            if any(m in lnorm for m in in_markers):
                in_score += 2
            if any(m in lnorm for m in out_markers):
                out_score += 2

        # Handle split key/value layout across neighboring lines.
        if any(m in lnorm for m in in_markers):
            if has_target(i) or has_target(i + 1) or has_target(i - 1):
                in_score += 1
        if any(m in lnorm for m in out_markers):
            if has_target(i) or has_target(i + 1) or has_target(i - 1):
                out_score += 1

    saw_in = in_score > out_score and in_score > 0
    saw_out = out_score > in_score and out_score > 0

    if saw_in and not saw_out:
        return "in"
    if saw_out and not saw_in:
        return "out"
    return None


def categorize_transactions(
    txs: List[Dict],
    merchant_overrides: Dict[str, str] | None = None,
    savings_accounts: List[str] | None = None,
) -> List[Dict]:
    """
    Apply rule-based categorization, with optional merchant overrides.

    IMPORTANT:
    - Overrides are keyed by exact (case-sensitive) Merchant + Type.
      Key format: "<merchant>||<type>".
    """
    merchant_overrides = merchant_overrides or {}
    overrides_exact = {str(k): v for k, v in merchant_overrides.items()}

    def format_override_amount(value: Any) -> str:
        try:
            if value is None:
                return ""
            return f"{float(value):.2f}"
        except Exception:
            return str(value).strip()

    compiled = [(re.compile(pat, re.IGNORECASE), cat) for pat, cat in DEFAULT_RULES]
    configured_accounts = [a for a in (savings_accounts or []) if str(a).strip()]

    for tx in txs:
        merchant_raw = (tx.get("merchant") or "")
        title_raw = (tx.get("title") or "")
        override_key = f'{str(merchant_raw).strip()}||{str(title_raw).strip()}'
        tx_override_key = "||".join([
            str(merchant_raw).strip(),
            str(title_raw).strip(),
            str(tx.get("date") or "").strip(),
            format_override_amount(tx.get("amount")),
        ])

        # Transaction-specific manual override has highest priority.
        if tx_override_key in overrides_exact:
            tx["category"] = overrides_exact[tx_override_key]
            continue

        # Manual override must have highest priority.
        if override_key in overrides_exact:
            tx["category"] = overrides_exact[override_key]
            continue

        # High-priority account-specific rule (configured from UI):
        # money into savings account => Savings, money out => Loans.
        matched_account: Optional[str] = None
        for account in configured_accounts:
            if tx_mentions_target_account(tx, account):
                matched_account = account
                break
        if matched_account:
            flow = target_account_flow(tx, matched_account)
            if flow == "in":
                tx["category"] = "Savings"
                continue
            if flow == "out":
                tx["category"] = "Loans"
                continue
            # Fallback when role lines are missing: direction-relative behavior.
            if tx.get("direction") == "credit":
                tx["category"] = "Savings"
                continue
            if tx.get("direction") == "debit":
                tx["category"] = "Loans"
                continue

        blob = f'{tx.get("title","")} {merchant_raw}'
        cat = "Other"
        for rgx, c in compiled:
            if rgx.search(blob):
                cat = c
                break
        tx["category"] = cat

    return txs

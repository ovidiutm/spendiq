import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


os.environ.setdefault('DATABASE_URL', 'sqlite:///./.smoke-test.sqlite3')

from fastapi.testclient import TestClient

from app.main import app
from app.parser import (
    extract_statement_details_text,
    looks_like_ing_statement_text,
    normalize_statement_period,
    split_page_sections,
    categorize_transactions,
)


def test_normalize_statement_period_ro_months():
    value = '12 noiembrie 2025 - 12 februarie 2026'
    assert normalize_statement_period(value) == '12/11/2025 - 12/02/2026'


def test_extract_statement_details_text_and_layout_detection():
    text = '''
    Extras de cont
    Titular cont: DL Ovidiu Mihail Teodoru
    Numar cont: RO70INGB5523999901094499
    Tip cont: Cont Curent
    Pentru perioada: 31/12/2025 - 31/01/2026
    Data Detalii tranzactie Debit Credit
    '''
    details = extract_statement_details_text(text)
    assert details['account_holder'] == 'DL Ovidiu Mihail Teodoru'
    assert details['account_number'] == 'RO70INGB5523999901094499'
    assert details['account_type'] == 'Cont Curent'
    assert details['statement_period'] == '31/12/2025 - 31/01/2026'
    assert looks_like_ing_statement_text(text) is True


def test_split_page_sections_removes_footer_lines():
    lines_words = [
        [{'text': 'Extras'}, {'text': 'de'}, {'text': 'cont'}],
        [{'text': 'Data'}, {'text': 'Detalii'}, {'text': 'tranzactie'}, {'text': 'Debit'}, {'text': 'Credit'}],
        [{'text': '05'}, {'text': 'ianuarie'}, {'text': '2026'}, {'text': 'Taxe'}, {'text': 'si'}, {'text': 'comisioane'}],
        [{'text': '18,00'}],
        [{'text': 'pe'}, {'text': 'www.ing.ro/dgs'}, {'text': 'si'}, {'text': 'in'}, {'text': 'locatiile'}, {'text': 'bancii'}],
    ]
    header, table, footer = split_page_sections(lines_words)
    assert len(header) >= 2
    assert len(table) == 2
    assert len(footer) == 1


def test_categorize_transactions_savings_iban_rule_smoke():
    txs = [
        {
            'date': '01/02/2026',
            'merchant': 'Tranzactie Round Up',
            'title': 'Tranzactie Round Up',
            'amount': -5.0,
            'direction': 'debit',
            'raw_lines': ['In contul: RO41INGB0000999902619755'],
        },
        {
            'date': '02/02/2026',
            'merchant': 'Transfer',
            'title': 'Incasare',
            'amount': 100.0,
            'direction': 'credit',
            'raw_lines': ['Din contul: RO41INGB0000999902619755'],
        },
    ]
    out = categorize_transactions(txs, {}, ['RO41INGB0000999902619755'])
    assert out[0]['category'] == 'Savings'
    assert out[1]['category'] == 'Loans'


def test_parse_statement_endpoint_rejects_non_pdf_upload():
    with TestClient(app) as client:
        files = {'file': ('not-a-statement.txt', b'hello world', 'text/plain')}
        r = client.post('/api/parse/statement', files=files)
        assert r.status_code in (400, 415, 422)

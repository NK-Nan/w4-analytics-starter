"""รายงานรายเดือน (src/report.py)"""
import pytest

from src import metrics as m
from src import report


@pytest.fixture(scope="module")
def df():
    return m.load_orders()


def test_report_march_net_sales(df):
    r = report.build_report(df, "2026-03")
    assert r["net"] == pytest.approx(1_147_155, abs=1)
    assert r["prev_month"] == "2026-02"
    assert r["change"] == pytest.approx(r["net"] - r["prev_net"])


def test_report_markdown_file(df, tmp_path):
    out = report.write_report("2026-03", tmp_path / "monthly_report.md", df=df)
    text = out.read_text(encoding="utf-8")
    assert "1,147,155 บาท" in text
    assert "เดือนก่อน (2026-02)" in text
    assert "อัตรายกเลิก" in text and "อัตราคืนสินค้า" in text


def test_report_top_products(df):
    top = report.build_report(df, "2026-03")["top_products"]
    assert len(top) == 5
    assert list(top["net"]) == sorted(top["net"], reverse=True)


def test_first_month_has_no_previous(df):
    r = report.build_report(df, "2025-10")
    assert r["prev_net"] is None and r["change"] is None


def test_unknown_month(df):
    with pytest.raises(ValueError):
        report.build_report(df, "2030-01")

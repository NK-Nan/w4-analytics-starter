"""สร้างรายงานยอดขายรายเดือนเป็น Markdown

    python -m src.report 2026-03        # เขียน reports/monthly_report.md

ตัวเลขทุกตัวมาจากฟังก์ชันใน src/metrics.py
"""
import argparse
import re
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import pandas as pd

from src import metrics as m

REPORTS = Path(__file__).resolve().parent.parent / "reports"
TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
             "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]


def previous_month(month: str) -> str:
    """'2026-03' → '2026-02', '2026-01' → '2025-12'"""
    year, mon = int(month[:4]), int(month[5:7])
    year, mon = (year - 1, 12) if mon == 1 else (year, mon - 1)
    return f"{year}-{mon:02d}"


def thai_month(month: str) -> str:
    """'2026-03' → 'มีนาคม 2569'"""
    return f"{TH_MONTHS[int(month[5:7]) - 1]} {int(month[:4]) + 543}"


def build_report(df: pd.DataFrame, month: str) -> dict:
    """ตัวเลขของรายงานเดือน month ('YYYY-MM') จาก df ที่ได้จาก metrics.load_orders()"""
    if month not in set(df["month"]):
        raise ValueError(f"ไม่มีข้อมูลเดือน {month}")
    this = df[df["month"] == month]
    prev_month = previous_month(month)
    sales = m.monthly_sales(df)
    net = m.net_sales(this)
    prev = float(sales[prev_month]) if prev_month in sales.index else None
    return {
        "month": month,
        "prev_month": prev_month,
        "net": net,
        "prev_net": prev,
        "change": None if prev is None else net - prev,
        "change_pct": None if not prev else (net - prev) / prev * 100,
        "orders": len(this),
        "top_products": m.top_products(this, 5),
        "cancel_rate": m.cancel_rate(this),
        "return_rate": m.return_rate(this),
    }


def _baht(v: float) -> str:
    """ปัดเศษแบบครึ่งขึ้น (62,386.5 → 62,387) ไม่ใช้ round-half-even ของ Python"""
    return f"{Decimal(str(v)).quantize(Decimal('1'), rounding=ROUND_HALF_UP):,} บาท"


def render_markdown(r: dict) -> str:
    lines = [
        f"# รายงานยอดขายประจำเดือน {thai_month(r['month'])} ({r['month']})",
        "",
        "บ้านสบาย ช็อป · ยอดขายสุทธิคิดเฉพาะคำสั่งซื้อที่จัดส่งสำเร็จ ไม่รวมค่าส่ง",
        "",
        "## ยอดขายสุทธิ",
        "",
        "| รายการ | ค่า |",
        "|---|---:|",
        f"| ยอดขายสุทธิ {r['month']} | {_baht(r['net'])} |",
    ]
    if r["prev_net"] is None:
        lines.append(f"| เดือนก่อน ({r['prev_month']}) | ไม่มีข้อมูล |")
    else:
        sign = "+" if r["change"] >= 0 else "−"
        lines += [
            f"| เดือนก่อน ({r['prev_month']}) | {_baht(r['prev_net'])} |",
            f"| เปลี่ยนแปลง | {sign}{_baht(abs(r['change']))} ({sign}{abs(r['change_pct']):.2f}%) |",
        ]
    lines += [
        "",
        "## 5 สินค้าขายดี (ตามยอดขายสุทธิ)",
        "",
        "| อันดับ | รหัส | สินค้า | จำนวน (ชิ้น) | ยอดขายสุทธิ |",
        "|---:|---|---|---:|---:|",
    ]
    for i, p in enumerate(r["top_products"].itertuples(index=False), start=1):
        lines.append(f"| {i} | {p.product_id} | {p.product_name} | {int(p.qty):,} | {_baht(p.net)} |")
    lines += [
        "",
        "## อัตรายกเลิกและอัตราคืนสินค้า",
        "",
        f"คิดจากคำสั่งซื้อทั้งหมด {r['orders']:,} รายการในเดือนนี้",
        "",
        "| รายการ | ค่า |",
        "|---|---:|",
        f"| อัตรายกเลิก | {r['cancel_rate']:.2f}% |",
        f"| อัตราคืนสินค้า | {r['return_rate']:.2f}% |",
        "",
    ]
    return "\n".join(lines)


def write_report(month: str, out: Path | str = REPORTS / "monthly_report.md",
                 df: pd.DataFrame | None = None) -> Path:
    """สร้างรายงานเดือน month แล้วเขียนลงไฟล์ out คืน path ของไฟล์"""
    df = m.load_orders() if df is None else df
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_markdown(build_report(df, month)), encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="สร้างรายงานยอดขายรายเดือน")
    parser.add_argument("month", help="เดือนในรูปแบบ YYYY-MM เช่น 2026-03")
    parser.add_argument("--out", default=REPORTS / "monthly_report.md", help="ไฟล์ปลายทาง")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", args.month):
        parser.error("เดือนต้องอยู่ในรูปแบบ YYYY-MM เช่น 2026-03")
    try:
        path = write_report(args.month, args.out)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    print(f"เขียนรายงานแล้ว: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

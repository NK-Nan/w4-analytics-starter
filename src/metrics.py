"""ฟังก์ชันคำนวณตัวชี้วัดของบ้านสบาย ช็อป

ทุกฟังก์ชันรับ DataFrame ที่ได้จาก load_orders() เป็นพารามิเตอร์แรก
นิยามตัวชี้วัดอยู่ใน CLAUDE.md
"""
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"

DELIVERED = "จัดส่งสำเร็จ"
CANCELLED = "ยกเลิก"
RETURNED = "คืนสินค้า"

SHIP_BUCKETS = ["1-2", "3-4", "5-6", "7+"]


def load_orders(path: Path | str = DATA / "orders.csv") -> pd.DataFrame:
    """อ่าน orders.csv แล้วเพิ่มคอลัมน์ที่ใช้บ่อย: net, unit_cost, gp, month, date"""
    df = pd.read_csv(path, encoding="utf-8-sig")
    products = pd.read_csv(DATA / "products.csv", encoding="utf-8-sig")
    df = df.merge(products[["product_id", "unit_cost"]], on="product_id", how="left")

    # net และ gp นับเฉพาะแถวที่จัดส่งสำเร็จ แถวอื่นเป็น 0 เพื่อให้ .sum() ได้ตามนิยามตรง ๆ
    delivered = df["status"] == DELIVERED
    gross = df["qty"] * df["unit_price"] * (1 - df["discount_pct"] / 100)
    df["net"] = gross.where(delivered, 0.0)
    df["gp"] = (gross - df["qty"] * df["unit_cost"]).where(delivered, 0.0)
    df["month"] = df["order_datetime"].str[:7]
    df["date"] = df["order_datetime"].str[:10]
    return df


def _between(values: pd.Series, start: str | None, end: str | None) -> pd.Series:
    """mask ของค่าในช่วง start..end (รวมทั้งสองฝั่ง) ค่า None = ไม่จำกัดฝั่งนั้น"""
    mask = pd.Series(True, index=values.index)
    if start is not None:
        mask &= values >= start
    if end is not None:
        mask &= values <= end
    return mask


def _rate(df: pd.DataFrame, status: str) -> float:
    """จำนวนแถวสถานะนั้น ÷ จำนวนคำสั่งซื้อทั้งหมดใน df × 100"""
    if len(df) == 0:
        return 0.0
    return float((df["status"] == status).sum() / len(df) * 100)


def net_sales(df: pd.DataFrame) -> float:
    """ยอดขายสุทธิรวม (บาท)"""
    return float(df["net"].sum())


def gross_profit(df: pd.DataFrame) -> float:
    """กำไรขั้นต้นรวม (บาท)"""
    return float(df["gp"].sum())


def aov(df: pd.DataFrame) -> float:
    """ยอดขายสุทธิเฉลี่ยต่อคำสั่งซื้อที่จัดส่งสำเร็จ (บาท)"""
    orders = int((df["status"] == DELIVERED).sum())
    return net_sales(df) / orders if orders else 0.0


def cancel_rate(df: pd.DataFrame) -> float:
    """อัตรายกเลิกของคำสั่งซื้อทั้งหมดใน df (เปอร์เซ็นต์ 0–100)"""
    return _rate(df, CANCELLED)


def monthly_sales(df: pd.DataFrame) -> pd.Series:
    """ยอดขายสุทธิรายเดือน index = 'YYYY-MM' เรียงตามเวลา"""
    return df.groupby("month")["net"].sum().sort_index()


def best_month(df: pd.DataFrame) -> str:
    """เดือนที่ยอดขายสุทธิสูงสุด ('YYYY-MM')"""
    return str(monthly_sales(df).idxmax())


def channel_share(df: pd.DataFrame, channel: str, start_month: str, end_month: str) -> float:
    """สัดส่วนยอดขายสุทธิของช่องทางในช่วงเดือน start_month..end_month (รวมทั้งสองเดือน) เป็นเปอร์เซ็นต์"""
    window = df[_between(df["month"], start_month, end_month)]
    total = window["net"].sum()
    if total == 0:
        return 0.0
    return float(window.loc[window["channel"] == channel, "net"].sum() / total * 100)


def top_products(df: pd.DataFrame, n: int = 5) -> pd.DataFrame:
    """สินค้าขายดี n อันดับตามยอดขายสุทธิ คอลัมน์ product_id, product_name, qty (ชิ้นที่จัดส่งสำเร็จ), net"""
    delivered = df[df["status"] == DELIVERED]
    top = (delivered.groupby(["product_id", "product_name"], as_index=False)
           .agg(qty=("qty", "sum"), net=("net", "sum"))
           .sort_values(["net", "product_id"], ascending=[False, True]))
    return top.head(n).reset_index(drop=True)


def _ship_bucket(days: float) -> str:
    if days <= 2:
        return "1-2"
    if days <= 4:
        return "3-4"
    if days <= 6:
        return "5-6"
    return "7+"


def rating_by_ship_bucket(df: pd.DataFrame) -> dict[str, float]:
    """คะแนนรีวิวเฉลี่ยตามระยะส่ง คืน dict คีย์ '1-2', '3-4', '5-6', '7+'"""
    # ใช้ทุกแถวที่มีทั้งรีวิวและระยะส่ง (ตัดค่าว่างออกก่อนเฉลี่ย ตาม CLAUDE.md)
    rated = df.dropna(subset=["rating", "ship_days"])
    means = rated.groupby(rated["ship_days"].map(_ship_bucket))["rating"].mean()
    return {b: float(means[b]) for b in SHIP_BUCKETS if b in means.index}


def top_province(df: pd.DataFrame, region: str) -> str:
    """จังหวัดที่มียอดขายสุทธิสูงสุดในภูมิภาคที่ระบุ"""
    in_region = df[df["region"] == region]
    return str(in_region.groupby("province")["net"].sum().idxmax())


def avg_ship_days(df: pd.DataFrame, region: str | None = None, carrier: str | None = None,
                  start_date: str | None = None, end_date: str | None = None) -> float:
    """ระยะส่งเฉลี่ย (วัน) ตามตัวกรองที่ให้มา วันที่เป็น 'YYYY-MM-DD' และรวมทั้งสองวัน"""
    mask = _between(df["date"], start_date, end_date)
    if region is not None:
        mask &= df["region"] == region
    if carrier is not None:
        mask &= df["carrier"] == carrier
    # ship_days ว่างเมื่อยกเลิก: mean() ของ pandas ข้ามค่าว่างให้
    return float(df.loc[mask, "ship_days"].mean())


def return_rate(df: pd.DataFrame, product_id: str | None = None,
                start_date: str | None = None, end_date: str | None = None) -> float:
    """อัตราคืนสินค้า (เปอร์เซ็นต์) ของสินค้าและช่วงวันที่ที่ระบุ"""
    mask = _between(df["date"], start_date, end_date)
    if product_id is not None:
        mask &= df["product_id"] == product_id
    return _rate(df[mask], RETURNED)

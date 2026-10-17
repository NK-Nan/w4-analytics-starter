"""จำแนกตั๋วลูกค้าด้วย Claude โดยใช้ prompt v2 (prompts/classify_v2.md)

API key อ่านจาก environment variable (ANTHROPIC_API_KEY) โดย SDK เท่านั้น ห้ามใส่ในโค้ด
"""
import json
import os
from pathlib import Path

import anthropic

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "classify_v2.md"
MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
MAX_MESSAGE_CHARS = 4000

CATEGORIES = [
    "ส่งช้า",
    "ชำระเงินและโปรโมชั่น",
    "ขอคืนเงิน",
    "สินค้าชำรุด",
    "เปลี่ยนแปลงคำสั่งซื้อ",
    "ได้รับสินค้าผิด",
    "ชมเชย",
    "สอบถามทั่วไป",
]
SENTIMENTS = ["บวก", "กลาง", "ลบ"]
URGENCIES = ["สูง", "ปกติ"]
FLAGS = ["", "prompt_injection"]

# บังคับให้คำตอบเป็น JSON ตามค่าที่ prompt กำหนดเท่านั้น
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": CATEGORIES},
        "sentiment": {"type": "string", "enum": SENTIMENTS},
        "urgency": {"type": "string", "enum": URGENCIES},
        "flag": {"type": "string", "enum": FLAGS},
    },
    "required": ["category", "sentiment", "urgency", "flag"],
    "additionalProperties": False,
}

MESSAGE_SLOT = "<message>{message}</message>"


class ClassifyError(Exception):
    """ข้อผิดพลาดที่แสดงให้ผู้ใช้เห็นได้"""


def load_system_prompt(path: Path = PROMPT_PATH) -> str:
    """อ่าน prompt v2 แล้วตัดช่อง <message>{message}</message> ออก (ข้อความลูกค้าส่งแยกใน user turn)"""
    text = path.read_text(encoding="utf-8")
    if MESSAGE_SLOT not in text:
        raise ValueError(f"ไม่พบ {MESSAGE_SLOT} ใน {path}")
    return text.replace(MESSAGE_SLOT, "").rstrip() + "\n"


def wrap_message(message: str) -> str:
    """ห่อข้อความลูกค้าด้วย <message> และกันไม่ให้ลูกค้าปิดแท็กเองเพื่อแทรกคำสั่ง"""
    safe = message.replace("<message>", "&lt;message&gt;").replace("</message>", "&lt;/message&gt;")
    return f"<message>{safe}</message>"


def validate_message(message: str) -> str:
    message = (message or "").strip()
    if not message:
        raise ClassifyError("กรุณาพิมพ์ข้อความลูกค้า")
    if len(message) > MAX_MESSAGE_CHARS:
        raise ClassifyError(f"ข้อความยาวเกิน {MAX_MESSAGE_CHARS} ตัวอักษร")
    return message


def parse_response(response) -> dict:
    """ดึง JSON ผลจำแนกจาก response และตรวจค่าทุกช่อง"""
    if response.stop_reason == "refusal":
        raise ClassifyError("โมเดลปฏิเสธการจำแนกข้อความนี้")
    if response.stop_reason == "max_tokens":
        raise ClassifyError("คำตอบของโมเดลถูกตัดกลางคัน ลองใหม่อีกครั้ง")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise ClassifyError("โมเดลไม่ได้ส่งผลลัพธ์กลับมา")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ClassifyError("ผลลัพธ์ไม่ใช่ JSON ที่ถูกต้อง") from e
    allowed = {"category": CATEGORIES, "sentiment": SENTIMENTS, "urgency": URGENCIES, "flag": FLAGS}
    for key, values in allowed.items():
        if data.get(key) not in values:
            raise ClassifyError(f"ค่า {key} ไม่อยู่ในรายการที่กำหนด: {data.get(key)!r}")
    return {key: data[key] for key in allowed}


class Classifier:
    def __init__(self, client=None, model: str = MODEL, system_prompt: str | None = None):
        self.client = client or anthropic.Anthropic()
        self.model = model
        self.system_prompt = system_prompt or load_system_prompt()

    def classify(self, message: str) -> dict:
        message = validate_message(message)
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=2048,
                system=self.system_prompt,
                messages=[{"role": "user", "content": wrap_message(message)}],
                output_config={
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
                },
                # ถ้าโมเดลหลักปฏิเสธ ให้ API ส่งต่อไปโมเดลสำรองที่ Anthropic แนะนำ
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.AuthenticationError as e:
            raise ClassifyError("API key ไม่ถูกต้อง ตรวจ ANTHROPIC_API_KEY") from e
        except anthropic.RateLimitError as e:
            raise ClassifyError("เรียก API ถี่เกินไป รอสักครู่แล้วลองใหม่") from e
        except anthropic.APIStatusError as e:
            raise ClassifyError(f"API ผิดพลาด ({e.status_code})") from e
        except anthropic.APIConnectionError as e:
            raise ClassifyError("เชื่อมต่อ API ไม่ได้") from e
        result = parse_response(response)
        result["model"] = response.model
        return result

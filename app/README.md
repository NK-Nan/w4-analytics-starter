# เว็บจำแนกตั๋วลูกค้า (prompt v2)

รับข้อความลูกค้าใหม่ แล้วให้ Claude ประเมิน **category / sentiment / urgency** (และ `flag` เมื่อพบ prompt injection)
ตามกติกาใน [`prompts/classify_v2.md`](../prompts/classify_v2.md)

## วิธีรัน

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...   # อ่านจาก environment เท่านั้น ห้ามใส่ในโค้ด
python -m app.server                  # เปิด http://localhost:5000
```

ตัวเลือก: `CLAUDE_MODEL` (ค่าเริ่มต้น `claude-opus-5-5`), `PORT` (ค่าเริ่มต้น `5000`)

## การทำงาน

- `prompts/classify_v2.md` ใช้เป็น system prompt ส่วนข้อความลูกค้าส่งแยกใน `<message>…</message>`
  และแท็ก `</message>` ที่ลูกค้าพิมพ์มาจะถูก escape กันการแทรกคำสั่ง
- บังคับรูปแบบคำตอบด้วย JSON schema (`output_config.format`) ค่าแต่ละช่องต้องอยู่ในรายการที่ prompt กำหนด
- เปิด server-side fallback (`fallbacks: "default"`) ถ้าโมเดลหลักปฏิเสธ API จะส่งต่อให้โมเดลสำรองเอง
- `effort: "low"` เพราะเป็นงานจำแนกสั้น ๆ

## API

`POST /api/classify` body `{"message": "..."}`

```json
{"category": "ส่งช้า", "sentiment": "ลบ", "urgency": "สูง", "flag": "", "model": "claude-opus-5-5"}
```

ข้อความว่างหรือยาวเกิน 4,000 ตัวอักษร หรือโมเดลตอบผิดรูปแบบ จะได้ HTTP 422 พร้อม `{"error": "..."}`

## ทดสอบ

```bash
pytest -q app   # ใช้ client ปลอม ไม่เรียก API จริง
```

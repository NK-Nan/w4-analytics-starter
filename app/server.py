"""เว็บรับข้อความลูกค้าใหม่ แล้วประเมิน category / sentiment / urgency ด้วย prompt v2

รัน: ANTHROPIC_API_KEY=... python -m app.server  แล้วเปิด http://localhost:5000
"""
import os

from flask import Flask, jsonify, request, send_from_directory

from app.classifier import CATEGORIES, SENTIMENTS, URGENCIES, ClassifyError, Classifier

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


def create_app(classifier=None) -> Flask:
    app = Flask(__name__, static_folder=None)
    # สร้าง client ตอนเรียกครั้งแรก เพื่อให้เปิดหน้าเว็บได้แม้ยังไม่ตั้ง API key
    state = {"classifier": classifier}

    def get_classifier():
        if state["classifier"] is None:
            state["classifier"] = Classifier()
        return state["classifier"]

    @app.get("/")
    def index():
        return send_from_directory(STATIC_DIR, "index.html")

    @app.get("/api/labels")
    def labels():
        return jsonify(categories=CATEGORIES, sentiments=SENTIMENTS, urgencies=URGENCIES)

    @app.post("/api/classify")
    def classify():
        body = request.get_json(silent=True) or {}
        message = body.get("message")
        if not isinstance(message, str):
            return jsonify(error="ต้องส่ง message เป็นข้อความ"), 400
        try:
            return jsonify(get_classifier().classify(message))
        except ClassifyError as e:
            return jsonify(error=str(e)), 422

    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    create_app().run(host="127.0.0.1", port=port, debug=False)

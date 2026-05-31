from pathlib import Path
import base64
import csv
import json
import os
import random
import re
import shutil
import subprocess
import time
import zipfile
from io import BytesIO

from flask import Flask, jsonify, request, send_file, send_from_directory


BASE_FOLDER = Path(__file__).parent
SPEECH_BANK_FOLDER = BASE_FOLDER / "speech_bank"
UPLOAD_FOLDER = Path(os.environ.get("MAMELUSHEN_UPLOAD_FOLDER", BASE_FOLDER / "uploads"))
AUDIO_FOLDER = UPLOAD_FOLDER / "audio"
TEXT_FOLDER = UPLOAD_FOLDER / "text"
METADATA_FILE = UPLOAD_FOLDER / "metadata.csv"
TEMP_FOLDER = UPLOAD_FOLDER / "temp"
ADMIN_PASSWORD = os.environ.get("MAMELUSHEN_ADMIN_PASSWORD", "")

app = Flask(__name__, static_folder="static")


def admin_allowed():
    if not ADMIN_PASSWORD:
        return False

    password = request.args.get("password", "") or request.headers.get("X-Admin-Password", "")
    return password == ADMIN_PASSWORD


def require_admin():
    if admin_allowed():
        return None

    return jsonify({
        "ok": False,
        "error": "Admin password is missing or wrong.",
    }), 401


def split_long_piece_by_commas(piece, max_words=16):
    piece = piece.strip()
    if not piece:
        return []

    parts = re.split(r"(?<=[,،])\s+", piece)
    chunks = []
    current = []

    for part in parts:
        words = part.split()
        current_words = " ".join(current).split()

        if current and len(current_words) + len(words) > max_words:
            chunks.append(" ".join(current).strip())
            current = [part]
        else:
            current.append(part)

    if current:
        chunks.append(" ".join(current).strip())

    final_chunks = []

    for chunk in chunks:
        words = chunk.split()

        if len(words) <= max_words + 4:
            final_chunks.append(chunk)
            continue

        for start in range(0, len(words), max_words):
            final_chunks.append(" ".join(words[start:start + max_words]))

    return [chunk for chunk in final_chunks if chunk]


def split_text_into_sentences(text, max_words=16):
    text = " ".join(text.split())
    if not text:
        return []

    sentence_pieces = re.split(r"(?<=[.!?׃:;؟])\s+", text)
    sentences = []

    for piece in sentence_pieces:
        piece = piece.strip()
        if not piece:
            continue

        words = piece.split()

        if len(words) <= max_words + 4:
            sentences.append(piece)
        else:
            sentences.extend(split_long_piece_by_commas(piece, max_words=max_words))

    return [sentence.strip() for sentence in sentences if sentence.strip()]


def all_sentence_choices():
    choices = []
    SPEECH_BANK_FOLDER.mkdir(parents=True, exist_ok=True)

    for speech_path in sorted(SPEECH_BANK_FOLDER.glob("*.txt")):
        text = speech_path.read_text(encoding="utf-8-sig")
        for sentence in split_text_into_sentences(text):
            choices.append({
                "source": speech_path.name,
                "sentence": sentence,
            })

    return choices


def next_sample_number():
    AUDIO_FOLDER.mkdir(parents=True, exist_ok=True)
    existing_numbers = []

    for audio_file in AUDIO_FOLDER.glob("sample_*.*"):
        try:
            number = int(audio_file.stem.split("_")[1])
            existing_numbers.append(number)
        except (IndexError, ValueError):
            pass

    if not existing_numbers:
        return 1

    return max(existing_numbers) + 1


def add_metadata(row):
    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    file_exists = METADATA_FILE.exists()

    with METADATA_FILE.open("a", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "sample",
                "speaker",
                "email",
                "mode",
                "source",
                "audio",
                "text_file",
                "text",
                "created_at",
            ],
        )

        if not file_exists:
            writer.writeheader()

        writer.writerow(row)


def read_metadata_rows():
    if not METADATA_FILE.exists():
        return []

    with METADATA_FILE.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def upload_summary():
    rows = read_metadata_rows()
    audio_count = len(list(AUDIO_FOLDER.glob("*"))) if AUDIO_FOLDER.exists() else 0
    text_count = len(list(TEXT_FOLDER.glob("*.txt"))) if TEXT_FOLDER.exists() else 0

    latest_rows = rows[-20:]
    latest_rows.reverse()

    return {
        "ok": True,
        "upload_folder": str(UPLOAD_FOLDER),
        "metadata_exists": METADATA_FILE.exists(),
        "total_metadata_rows": len(rows),
        "audio_files": audio_count,
        "text_files": text_count,
        "latest": latest_rows,
    }


def make_dataset_zip():
    memory_file = BytesIO()

    with zipfile.ZipFile(memory_file, "w", zipfile.ZIP_DEFLATED) as archive:
        if METADATA_FILE.exists():
            archive.write(METADATA_FILE, "metadata.csv")

        for folder, folder_name in [(AUDIO_FOLDER, "audio"), (TEXT_FOLDER, "text")]:
            if not folder.exists():
                continue

            for path in sorted(folder.glob("*")):
                if path.is_file():
                    archive.write(path, f"{folder_name}/{path.name}")

    memory_file.seek(0)
    return memory_file


def save_audio(audio_base64, sample_name):
    AUDIO_FOLDER.mkdir(parents=True, exist_ok=True)
    TEMP_FOLDER.mkdir(parents=True, exist_ok=True)

    webm_path = TEMP_FOLDER / f"{sample_name}.webm"
    wav_path = AUDIO_FOLDER / f"{sample_name}.wav"

    webm_path.write_bytes(base64.b64decode(audio_base64))

    ffmpeg = shutil.which("ffmpeg")

    if ffmpeg:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(webm_path),
                "-ac",
                "1",
                "-ar",
                "16000",
                str(wav_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        webm_path.unlink(missing_ok=True)
        return wav_path

    final_webm_path = AUDIO_FOLDER / f"{sample_name}.webm"
    shutil.move(str(webm_path), str(final_webm_path))
    return final_webm_path


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/admin")
def admin_page():
    return send_from_directory(app.static_folder, "admin.html")


@app.get("/api/random-sentence")
def random_sentence():
    choices = all_sentence_choices()

    if not choices:
        return jsonify({
            "ok": False,
            "error": "No speech text files were found.",
        }), 404

    return jsonify({"ok": True, **random.choice(choices)})


@app.post("/api/submit")
def submit_recording():
    payload = request.get_json(force=True)
    audio_base64 = payload.get("audio", "")
    text = payload.get("text", "").strip()
    speaker = payload.get("speaker", "").strip()
    email = payload.get("email", "").strip()
    mode = payload.get("mode", "").strip()
    source = payload.get("source", "").strip()
    consent = bool(payload.get("consent"))

    if not audio_base64:
        return jsonify({"ok": False, "error": "No audio was uploaded."}), 400

    if not text:
        return jsonify({"ok": False, "error": "No Yiddish text was included."}), 400

    if not consent:
        return jsonify({"ok": False, "error": "Permission checkbox is required."}), 400

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"ok": False, "error": "A valid email is required."}), 400

    TEXT_FOLDER.mkdir(parents=True, exist_ok=True)

    sample_number = next_sample_number()
    sample_name = f"sample_{sample_number:06d}"
    audio_path = save_audio(audio_base64, sample_name)
    text_path = TEXT_FOLDER / f"{sample_name}.txt"
    text_path.write_text(text, encoding="utf-8")

    add_metadata({
        "sample": sample_name,
        "speaker": speaker,
        "email": email,
        "mode": mode,
        "source": source,
        "audio": str(audio_path.relative_to(UPLOAD_FOLDER)).replace("\\", "/"),
        "text_file": str(text_path.relative_to(UPLOAD_FOLDER)).replace("\\", "/"),
        "text": text,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    })

    return jsonify({"ok": True, "sample": sample_name})


@app.get("/api/admin/summary")
def admin_summary():
    blocked = require_admin()
    if blocked:
        return blocked

    return jsonify(upload_summary())


@app.get("/api/admin/download-dataset")
def admin_download_dataset():
    blocked = require_admin()
    if blocked:
        return blocked

    filename = f"mamelushen_uploads_{time.strftime('%Y%m%d_%H%M%S')}.zip"
    return send_file(
        make_dataset_zip(),
        mimetype="application/zip",
        as_attachment=True,
        download_name=filename,
    )


@app.get("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    app.run(host="0.0.0.0", port=port)

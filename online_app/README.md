# Yiddish Speech Collection Online App

This is the online version of the Yiddish speech collection website.

## Local Test

```powershell
cd online_app
python -m pip install -r requirements.txt
python app.py
```

Open:

```text
http://127.0.0.1:8765
```

## Add Speeches

Put `.txt` files into:

```text
speech_bank
```

The website automatically picks random sentence chunks from all text files.

## Saved Recordings

Uploads are saved into:

```text
uploads/audio
uploads/text
uploads/metadata.csv
```

## Deploy Later

This app is ready for services like Render, Railway, Fly.io, or a cloud server.

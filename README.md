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

## Admin Download

Set this environment variable on the server:

```text
MAMELUSHEN_ADMIN_PASSWORD
```

Then open:

```text
/admin
```

Use the password to check counts and download all recordings as a zip.

For Render, add a Persistent Disk and set:

```text
MAMELUSHEN_UPLOAD_FOLDER=/var/data/uploads
```

Mount the disk at:

```text
/var/data
```

## Deploy Later

This app is ready for services like Render, Railway, Fly.io, or a cloud server.

Railway start command:

```text
gunicorn app:app --bind 0.0.0.0:$PORT
```

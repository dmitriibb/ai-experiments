# Meme Lizard Button

## Requirements

- Python 3.9+
- System audio output
- Tkinter (bundled with standard CPython on most platforms)
- SDL-backed audio libraries for `pygame`
- Speech backend for `pyttsx3`

On Ubuntu, install the system packages like so:

```bash
sudo apt install python3-tk python3-pygame espeak-ng
```

Install Python dependencies (inside your virtualenv):

```bash
pip install -r requirements.txt
```

## Running the app

From the `meme-lizard` directory:

```bash
source .venv/bin/activate
python app.py
deactivate
```

The first launch generates an audio clip using `pyttsx3`. Subsequent button presses reuse the cached sound and instantly stop/resume playback so quick clicks always play the latest press.

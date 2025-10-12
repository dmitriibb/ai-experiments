#!/usr/bin/env python3
import sys
import threading
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox
from tkinter import font as tkfont

from PIL import Image, ImageTk


APP_DIR = Path(__file__).resolve().parent
ASSET_DIR = APP_DIR / "assets"
ASSET_DIR.mkdir(parents=True, exist_ok=True)
DISPLAY_SIZE = (360, 640)
ZOOM_STEP = 0.1
SHIFT_STEP = 0.1
INITIAL_DECREASE_FACTOR = 4
INITIAL_SCALE = 1 / INITIAL_DECREASE_FACTOR


def ensure_audio_asset(path: Path) -> Path:
    if path.exists():
        return path
    try:
        import pyttsx3
    except ImportError as exc:
        raise RuntimeError("pyttsx3 is required to generate lizard audio") from exc
    engine = pyttsx3.init()
    engine.setProperty("rate", 170)
    engine.save_to_file("Lizard", str(path))
    engine.runAndWait()
    return path

class AudioPlayer:
    def __init__(self, audio_path: Path):
        try:
            import pygame
        except ImportError as exc:
            raise RuntimeError("pygame is required for playback") from exc
        self._pygame = pygame
        if not self._pygame.mixer.get_init():
            self._pygame.mixer.init()
        self._sound = self._pygame.mixer.Sound(str(audio_path))
        self._channel = None
        self._lock = threading.Lock()

    def play(self):
        with self._lock:
            if not self._pygame.mixer.get_init():
                self._pygame.mixer.init()
            if self._channel is not None:
                self._channel.stop()
            self._channel = self._sound.play()

    def shutdown(self):
        with self._lock:
            if self._pygame.mixer.get_init():
                self._pygame.mixer.quit()


class MemeImage:
    def __init__(self, path: Path):
        if not path.exists():
            raise FileNotFoundError(f"Missing meme image at {path}")
        self.path = path
        self._cache = {}

    def tk_photo(
        self,
        max_size: tuple[int, int],
        zoom_factor: float = 1.0,
        shift_fraction: float = 0.0,
    ) -> ImageTk.PhotoImage:
        cache_key = (tuple(max_size), round(zoom_factor, 3), round(shift_fraction, 3))
        cached = self._cache.get(cache_key)
        if cached:
            return cached
        with Image.open(self.path) as img:
            img = img.convert("RGBA")
            original_width, original_height = img.size
            zoomed_width = int(original_width * zoom_factor)
            zoomed_height = int(original_height * zoom_factor)
            if zoom_factor != 1.0:
                img = img.resize((zoomed_width, zoomed_height), Image.LANCZOS)

            max_w, max_h = max_size
            shift_pixels = int(shift_fraction * max_h)
            crop_height = min(max_h, zoomed_height)
            crop_width = min(max_w, zoomed_width)

            if zoomed_height <= max_h:
                crop_top = 0
            else:
                crop_top = min(zoomed_height - crop_height, max(0, shift_pixels))
            crop_bottom = crop_top + crop_height

            if zoomed_width <= max_w:
                crop_left = 0
            else:
                crop_left = max(0, (zoomed_width - max_w) // 2)
                crop_left = min(crop_left, zoomed_width - crop_width)
            crop_right = crop_left + crop_width

            cropped = img.crop((crop_left, crop_top, crop_right, crop_bottom))
            final = Image.new("RGBA", max_size, "#141e2a")
            paste_x = max(0, (max_w - cropped.size[0]) // 2)
            paste_y = max(0, (max_h - cropped.size[1]) // 2)
            final.paste(cropped, (paste_x, paste_y), cropped)

            photo = ImageTk.PhotoImage(final)
            self._cache[cache_key] = photo
            return photo


class LizardApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Lizzard Button")
        self.root.geometry("960x720")
        self.root.minsize(960, 720)
        self.root.maxsize(960, 720)
        self.root.resizable(False, False)

        self._audio_player = None
        self._reset_job = None
        self._click_count = 0
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        self.main_frame = ttk.Frame(root, padding=20)
        self.main_frame.grid(row=0, column=0, sticky="nsew")
        self.main_frame.columnconfigure(0, weight=3)
        self.main_frame.columnconfigure(1, weight=1)
        self.main_frame.rowconfigure(1, weight=1)

        self.title_label = ttk.Label(
            self.main_frame,
            text="Press the Lizzard button!",
            font=("Helvetica", 22),
            anchor="center",
        )
        self.title_label.grid(row=0, column=0, columnspan=2, pady=(0, 20))

        self.meme_image = MemeImage(APP_DIR / "lizard.png")
        blank_canvas = Image.new("RGB", DISPLAY_SIZE, "#141e2a")
        self.blank_image = ImageTk.PhotoImage(blank_canvas)
        self.image_label = tk.Label(
            self.main_frame,
            image=self.blank_image,
            relief="sunken",
            bg="#141e2a",
            fg="white",
        )
        self.image_label.image = self.blank_image
        self.image_label.grid(row=1, column=0, sticky="nsew", padx=(0, 20))

        button_container = ttk.Frame(self.main_frame, padding=10)
        button_container.grid(row=1, column=1, sticky="n", pady=(0, 20))

        self.lizard_button = tk.Button(
            button_container,
            text="🦎",
            command=self.on_press,
            font=self._emoji_font(),
            width=1,
            height=1,
            bg="#f4d35e",
            activebackground="#f4d35e",
            relief="raised",
            bd=4,
        )
        self.lizard_button.pack()

        self._prepare_audio()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _emoji_font(self) -> tuple[str, int]:
        preferred = (
            "Noto Color Emoji",
            "Segoe UI Emoji",
            "Apple Color Emoji",
            "Twemoji Mozilla",
            "DejaVu Sans",
            "Helvetica",
        )
        available = {name for name in tkfont.families()}
        for family in preferred:
            if family in available:
                return (family, 56)
        return ("TkDefaultFont", 56)

    def _prepare_audio(self):
        audio_path = ensure_audio_asset(ASSET_DIR / "lizard.wav")
        try:
            self._audio_player = AudioPlayer(audio_path)
        except RuntimeError as exc:
            messagebox.showerror("Audio unavailable", str(exc))
            self._audio_player = None

    def on_press(self):
        if self._audio_player:
            try:
                self._audio_player.play()
            except Exception as exc:
                messagebox.showerror("Playback error", str(exc))
        self._click_count += 1
        zoom_factor = INITIAL_SCALE * ((1 + ZOOM_STEP) ** (self._click_count - 1))
        shift_fraction = min(1.0, SHIFT_STEP * (self._click_count - 1))
        meme_photo = self.meme_image.tk_photo(DISPLAY_SIZE, zoom_factor, shift_fraction)
        self.image_label.configure(
            image=meme_photo,
            text="",
            bg="#141e2a",
        )
        self.image_label.image = meme_photo
        self.title_label.configure(text="LIZZARD!!!")
        self.root.after(600, lambda: self.title_label.configure(text="Press the Lizzard button!"))
        if self._reset_job is not None:
            self.root.after_cancel(self._reset_job)
        self._reset_job = self.root.after(2000, self.reset_display)

    def on_close(self):
        if self._audio_player:
            self._audio_player.shutdown()
        if self._reset_job is not None:
            self.root.after_cancel(self._reset_job)
        self.root.destroy()

    def reset_display(self):
        self._click_count = 0
        self.image_label.configure(image=self.blank_image, bg="#141e2a")
        self.image_label.image = self.blank_image


def main() -> int:
    root = tk.Tk()
    try:
        LizardApp(root)
    except Exception as exc:  # pragma: no cover - GUI init error
        messagebox.showerror("Startup error", str(exc))
        return 1
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Transcribe piano audio (.mp3 / .wav) into MIDI and Remotion notes.json."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterator

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
MIDI_MIN = 21  # A0
MIDI_MAX = 108  # C8
DEFAULT_CHECKPOINT_URL = (
    "https://zenodo.org/record/4034264/files/"
    "CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
)
DEFAULT_CHECKPOINT_MIN_BYTES = 160_000_000


def ensure_checkpoint(checkpoint_path: str | None) -> Path:
    """Ensure the piano_transcription_inference checkpoint exists locally without calling wget."""
    if checkpoint_path:
        resolved = Path(checkpoint_path).expanduser().resolve()
        if not resolved.exists():
            raise FileNotFoundError(f"Checkpoint not found: {resolved}")
        return resolved

    target = Path.home() / "piano_transcription_inference_data" / "note_F1=0.9677_pedal_F1=0.9186.pth"
    if target.exists() and target.stat().st_size >= DEFAULT_CHECKPOINT_MIN_BYTES:
        return target

    import requests

    target.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target.with_suffix(".pth.part")
    print(f"Downloading model checkpoint (~165 MB) to {target}...")

    with requests.get(DEFAULT_CHECKPOINT_URL, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        downloaded = 0
        next_report_pct = 10
        with temp_path.open("wb") as fh:
            for chunk in resp.iter_content(chunk_size=1024 * 512):
                if not chunk:
                    continue
                fh.write(chunk)
                downloaded += len(chunk)
                if total > 0:
                    pct = int((downloaded * 100) / total)
                    if pct >= next_report_pct:
                        print(f"  Checkpoint download: {pct}% ({downloaded // (1024 * 1024)} MB)")
                        next_report_pct += 10

    if temp_path.stat().st_size < DEFAULT_CHECKPOINT_MIN_BYTES:
        temp_path.unlink(missing_ok=True)
        raise RuntimeError("Downloaded checkpoint is smaller than expected.")

    temp_path.replace(target)
    print("Checkpoint download complete.")
    return target


@contextmanager
def allow_legacy_torch_load() -> Iterator[None]:
    """Scope weights_only=False compatibility for legacy checkpoint loading on torch >= 2.6."""
    import torch

    orig_load = torch.load

    def patched_load(*args: Any, **kwargs: Any) -> Any:
        kwargs.setdefault("weights_only", False)
        return orig_load(*args, **kwargs)

    torch.load = patched_load  # type: ignore[assignment]
    try:
        yield
    finally:
        torch.load = orig_load  # type: ignore[assignment]


def midi_to_note_name(pitch: int) -> str:
    semitone = pitch % 12
    octave = (pitch // 12) - 1
    return f"{NOTE_NAMES[semitone]}{octave}"


def midi_file_to_notes(
    midi_path: Path,
    min_velocity: float = 0.0,
    min_duration: float = 0.0,
    max_duration: float | None = None,
) -> tuple[list[dict[str, Any]], int]:
    import mido

    mid = mido.MidiFile(str(midi_path))
    current_time = 0.0
    active_notes: dict[tuple[int, int], list[tuple[float, float]]] = {}
    events: list[dict[str, Any]] = []
    raw_count = 0

    for msg in mid:
        current_time += msg.time
        if msg.type == "note_on" and msg.velocity > 0:
            key = (msg.channel, msg.note)
            active_notes.setdefault(key, []).append((current_time, msg.velocity / 127.0))
        elif msg.type in ("note_off", "note_on") and getattr(msg, "velocity", 0) == 0:
            key = (msg.channel, msg.note)
            stack = active_notes.get(key)
            if stack:
                start_time, raw_velocity = stack.pop(0)
                if MIDI_MIN <= msg.note <= MIDI_MAX and current_time > start_time:
                    raw_count += 1
                    velocity = min(max(raw_velocity, 0.0), 1.0)
                    end_time = current_time
                    if max_duration is not None and (end_time - start_time) > max_duration:
                        end_time = start_time + max_duration
                    duration = end_time - start_time

                    if velocity < min_velocity or duration < min_duration:
                        continue

                    events.append(
                        {
                            "pitch": int(msg.note),
                            "name": midi_to_note_name(int(msg.note)),
                            "startTime": round(start_time, 4),
                            "endTime": round(end_time, 4),
                            "velocity": round(velocity, 3),
                        }
                    )

    events.sort(key=lambda item: (item["startTime"], item["pitch"]))
    return events, raw_count


def resolve_audio_file_ref(input_audio: Path, explicit_audio_file: str | None) -> str | None:
    if explicit_audio_file is not None:
        return explicit_audio_file or None

    public_dir = Path("public").resolve()
    try:
        rel = input_audio.resolve().relative_to(public_dir)
        return rel.as_posix()
    except ValueError:
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Transcribe piano audio to MIDI and Remotion data/notes.json using piano_transcription_inference."
    )
    parser.add_argument("audio", type=Path, help="Path to input audio file (.mp3 / .wav)")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("data/notes.json"),
        help="Output JSON path (default: data/notes.json)",
    )
    parser.add_argument(
        "--midi-out",
        type=Path,
        default=None,
        help="Optional output MIDI path (default: <output_stem>.mid alongside JSON)",
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=30,
        help="Target FPS written to notes.json (default: 30)",
    )
    parser.add_argument(
        "--device",
        choices=("auto", "cpu", "cuda"),
        default="auto",
        help="Inference device (default: auto)",
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        default=None,
        help="Optional path to custom piano_transcription_inference checkpoint (.pth)",
    )
    parser.add_argument(
        "--audio-file",
        type=str,
        default=None,
        help="Relative path inside public/ for Remotion <Audio> (auto-detected if audio is inside public/)",
    )
    parser.add_argument(
        "--title",
        type=str,
        default=None,
        help="Optional song title displayed in Remotion",
    )
    parser.add_argument(
        "--onset-threshold",
        type=float,
        default=0.38,
        help="Model onset detection threshold 0..1 (default: 0.38, upstream default: 0.30)",
    )
    parser.add_argument(
        "--frame-threshold",
        type=float,
        default=0.25,
        help="Model active-frame threshold 0..1 (default: 0.25, upstream default: 0.10)",
    )
    parser.add_argument(
        "--offset-threshold",
        type=float,
        default=0.35,
        help="Model offset detection threshold 0..1 (default: 0.35, upstream default: 0.30)",
    )
    parser.add_argument(
        "--min-velocity",
        type=float,
        default=0.22,
        help="Drop weak/ghost notes below this normalized velocity (default: 0.22)",
    )
    parser.add_argument(
        "--min-duration",
        type=float,
        default=0.06,
        help="Drop micro-notes shorter than this duration in seconds (default: 0.06)",
    )
    parser.add_argument(
        "--max-duration",
        type=float,
        default=None,
        help="Optional cap on maximum note duration in seconds (default: unlimited)",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=None,
        help="PyTorch CPU threads (default: auto-adaptive based on available cores / LXC quota)",
    )
    return parser.parse_args()


def resolve_torch_threads(explicit_threads: int | None) -> int:
    if explicit_threads is not None and explicit_threads >= 1:
        return explicit_threads
    env_val = os.environ.get("TORCH_NUM_THREADS")
    if env_val and env_val.isdigit() and int(env_val) >= 1:
        return int(env_val)

    if hasattr(os, "sched_getaffinity"):
        cores = len(os.sched_getaffinity(0))
    else:
        cores = os.cpu_count() or 2

    if cores <= 2:
        return 1
    if cores <= 4:
        return cores - 1
    return max(2, cores - 2)


def main() -> int:
    args = parse_args()
    audio_path: Path = args.audio

    if not audio_path.exists():
        print(f"Error: audio file not found: {audio_path}", file=sys.stderr)
        return 1

    cpu_threads = resolve_torch_threads(args.threads)
    os.environ.setdefault("OMP_NUM_THREADS", str(cpu_threads))
    os.environ.setdefault("MKL_NUM_THREADS", str(cpu_threads))

    import librosa
    import torch
    from piano_transcription_inference import PianoTranscription, sample_rate

    torch.set_num_threads(cpu_threads)

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    output_json: Path = args.output
    output_json.parent.mkdir(parents=True, exist_ok=True)

    midi_path: Path = args.midi_out or output_json.with_suffix(".mid")
    midi_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Loading audio: {audio_path} (sr={sample_rate})...")
    audio, _ = librosa.load(str(audio_path), sr=sample_rate, mono=True)
    duration_in_seconds = round(float(len(audio)) / float(sample_rate), 2)

    checkpoint = ensure_checkpoint(args.checkpoint)
    print(
        "Running PianoTranscription on device='{}' "
        "(threads={}, onset={}, frame={}, offset={})...".format(
            device, cpu_threads, args.onset_threshold, args.frame_threshold, args.offset_threshold
        )
    )
    with allow_legacy_torch_load():
        transcriptor = PianoTranscription(device=device, checkpoint_path=str(checkpoint))

    transcriptor.onset_threshold = args.onset_threshold
    transcriptor.frame_threshold = args.frame_threshold
    # Upstream package spells this attribute without the second 'l'
    if hasattr(transcriptor, "offset_threshod"):
        transcriptor.offset_threshod = args.offset_threshold
    if hasattr(transcriptor, "offset_threshold"):
        transcriptor.offset_threshold = args.offset_threshold

    transcriptor.transcribe(audio, str(midi_path))

    notes, raw_count = midi_file_to_notes(
        midi_path,
        min_velocity=args.min_velocity,
        min_duration=args.min_duration,
        max_duration=args.max_duration,
    )
    max_dur = round(max((n["endTime"] - n["startTime"]) for n in notes), 2) if notes else 0.0
    audio_file_ref = resolve_audio_file_ref(audio_path, args.audio_file)

    payload: dict[str, Any] = {
        "fps": args.fps,
        "durationInSeconds": duration_in_seconds,
        "title": args.title or audio_path.stem,
        "notes": notes,
    }
    if audio_file_ref:
        payload["audioFile"] = audio_file_ref

    output_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        f"Done! Kept {len(notes)}/{raw_count} notes "
        f"(min_vel={args.min_velocity}, min_dur={args.min_duration}s, max_dur={max_dur}s) "
        f"-> {output_json}"
    )
    print(f"MIDI saved to: {midi_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

import csv
import requests
import sys

API_URL = "http://localhost:8000/transcribe"

def batch_upload(manifest_path):
    """
    manifest.csv format:
    filename,accent_group,reference_text
    sample1.wav,malayalam,The quick brown fox jumps over the lazy dog
    sample2.wav,delhi_hindi,She sells seashells by the seashore
    """
    with open(manifest_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Found {len(rows)} samples to upload.\n")

    for i, row in enumerate(rows, 1):
        filename = row['filename']
        accent_group = row['accent_group']
        reference_text = row['reference_text']

        try:
            with open(filename, 'rb') as audio_file:
                response = requests.post(
                    API_URL,
                    data={
                        'reference_text': reference_text,
                        'accent_group': accent_group
                    },
                    files={'file': audio_file}
                )
            if response.status_code == 200:
                result = response.json()
                print(f"[{i}/{len(rows)}] {filename} ({accent_group}) -> WER: {result['wer']}")
            else:
                print(f"[{i}/{len(rows)}] {filename} FAILED: {response.status_code} {response.text}")
        except FileNotFoundError:
            print(f"[{i}/{len(rows)}] {filename} NOT FOUND, skipping.")
        except Exception as e:
            print(f"[{i}/{len(rows)}] {filename} ERROR: {e}")

    print("\nDone. Check /results/by-accent for aggregated WER.")

if __name__ == "__main__":
    manifest = sys.argv[1] if len(sys.argv) > 1 else "manifest.csv"
    batch_upload(manifest)

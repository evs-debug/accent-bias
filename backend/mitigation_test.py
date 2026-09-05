import sqlite3
from rapidfuzz import process, fuzz
from jiwer import wer, Compose, ToLowerCase, RemovePunctuation, RemoveMultipleSpaces, Strip, ReduceToListOfListOfWords
import re

normalize = Compose([
    ToLowerCase(),
    RemovePunctuation(),
    RemoveMultipleSpaces(),
    Strip(),
    ReduceToListOfListOfWords()
])

conn = sqlite3.connect('accent_bias.db')
cursor = conn.cursor()
cursor.execute('SELECT reference_text, transcript, wer, accent_group FROM transcription_results')
rows = cursor.fetchall()
conn.close()

# Build vocabulary from all reference texts
vocab = set()
for ref, _, _, _ in rows:
    words = re.findall(r"[a-zA-Z']+", ref.lower())
    vocab.update(words)
vocab = list(vocab)

def correct_transcript(transcript, vocab, threshold=80):
    words = transcript.split()
    corrected = []
    for word in words:
        clean_word = re.sub(r"[^a-zA-Z']", "", word.lower())
        if not clean_word:
            corrected.append(word)
            continue
        match = process.extractOne(clean_word, vocab, scorer=fuzz.ratio)
        if match and match[1] >= threshold and match[0] != clean_word:
            corrected.append(match[0])
        else:
            corrected.append(word)
    return ' '.join(corrected)

improvements = []
for ref, transcript, original_wer, accent_group in rows:
    corrected = correct_transcript(transcript, vocab)
    new_wer = wer(ref, corrected, reference_transform=normalize, hypothesis_transform=normalize)
    if new_wer < original_wer:
        improvements.append({
            'accent_group': accent_group,
            'reference': ref,
            'original_transcript': transcript,
            'corrected_transcript': corrected,
            'original_wer': round(original_wer, 4),
            'new_wer': round(new_wer, 4)
        })

improvements.sort(key=lambda x: x['original_wer'] - x['new_wer'], reverse=True)

print(f"Total samples: {len(rows)}")
print(f"Samples improved by correction: {len(improvements)}\n")

for imp in improvements[:8]:
    print(f"[{imp['accent_group']}] WER {imp['original_wer']} -> {imp['new_wer']}")
    print(f"  Reference:  {imp['reference']}")
    print(f"  Before:     {imp['original_transcript']}")
    print(f"  After:      {imp['corrected_transcript']}")
    print()

avg_before = sum(r[2] for r in rows) / len(rows)
avg_after_all = sum(
    wer(r[0], correct_transcript(r[1], vocab), reference_transform=normalize, hypothesis_transform=normalize)
    for r in rows
) / len(rows)

print(f"Overall avg WER before correction: {avg_before:.4f}")
print(f"Overall avg WER after correction:  {avg_after_all:.4f}")

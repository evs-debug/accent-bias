import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import IndiaMapSection from './IndiaMapSection'
import './App.css'

interface AccentResult {
  accent_group: string
  avg_wer: number
  sample_count: number
}

interface Sample {
  id: number
  filename: string
  reference_text: string
  transcript: string
  wer: number
}

interface MitigationExample {
  accent_group: string
  reference: string
  before_transcript: string
  after_transcript: string
  before_wer: number
  after_wer: number
}

interface MitigationSummary {
  total_samples: number
  samples_improved: number
  avg_wer_before: number
  avg_wer_after: number
  top_examples: MitigationExample[]
}

interface MitigationExample {
  accent_group: string
  reference: string
  before_transcript: string
  after_transcript: string
  before_wer: number
  after_wer: number
}

interface MitigationSummary {
  total_samples: number
  samples_improved: number
  avg_wer_before: number
  avg_wer_after: number
  top_examples: MitigationExample[]
}

const API_BASE = 'http://localhost:8000'

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, '')
}

function diffWords(reference: string, transcript: string) {
  const refWords = reference.split(/\s+/)
  const transWords = transcript.split(/\s+/)
  const refNorm = refWords.map(normalizeWord)
  const transNorm = transWords.map(normalizeWord)

  const matched = new Set(refNorm.filter((w) => transNorm.includes(w)))

  return transWords.map((word) => ({
    word,
    isCorrect: matched.has(normalizeWord(word))
  }))
}

function App() {
  const [data, setData] = useState<AccentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [samples, setSamples] = useState<Sample[]>([])
  const [samplesLoading, setSamplesLoading] = useState(false)

  const [mitigation, setMitigation] = useState<MitigationSummary | null>(null)
  const [mitigationLoading, setMitigationLoading] = useState(true)

  const [testFile, setTestFile] = useState<File | null>(null)
  const [testReference, setTestReference] = useState('')
  const [testAccentGroup, setTestAccentGroup] = useState('')
  const [testResult, setTestResult] = useState<{ transcript: string; wer: number } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([])

  interface WordSuggestion {
    word: string
    is_wrong: boolean
    suggestion: string | null
  }
  const [wordSuggestions, setWordSuggestions] = useState<WordSuggestion[]>([])
  const [acceptedFixes, setAcceptedFixes] = useState<Record<number, boolean>>({})
  const [liveWer, setLiveWer] = useState<number | null>(null)
  const [routingChoice, setRoutingChoice] = useState<'accepted' | 'rerecord' | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/results/by-accent`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch results')
        return res.json()
      })
      .then((json: AccentResult[]) => {
        const filtered = json.filter((d) => d.accent_group !== 'test_group')
        const sorted = filtered.sort((a, b) => a.avg_wer - b.avg_wer)
        setData(sorted)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/mitigation/summary`)
      .then((res) => res.json())
      .then((json: MitigationSummary) => {
        setMitigation(json)
        setMitigationLoading(false)
      })
      .catch(() => setMitigationLoading(false))
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/mitigation/summary`)
      .then((res) => res.json())
      .then((json: MitigationSummary) => {
        setMitigation(json)
        setMitigationLoading(false)
      })
      .catch(() => setMitigationLoading(false))
  }, [])

  const handleSelectGroup = (group: string) => {
    if (selectedGroup === group) {
      setSelectedGroup(null)
      setSamples([])
      return
    }
    setSelectedGroup(group)
    setSamplesLoading(true)
    fetch(`${API_BASE}/results/by-accent/${group}`)
      .then((res) => res.json())
      .then((json: Sample[]) => {
        setSamples(json)
        setSamplesLoading(false)
      })
      .catch(() => setSamplesLoading(false))
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const file = new File([blob], 'recording.webm', { type: 'audio/webm' })
        setTestFile(file)
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setRecordedChunks(chunks)
      setIsRecording(true)
    } catch (err) {
      setTestError('Could not access microphone. Check browser permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    setIsRecording(false)
  }

  const handleTestSubmit = async () => {
    if (!testFile || !testReference.trim()) {
      setTestError('Please provide both an audio file and the reference text.')
      return
    }
    setTestLoading(true)
    setTestError(null)
    setTestResult(null)

    const formData = new FormData()
    formData.append('reference_text', testReference)
    formData.append('accent_group', testAccentGroup.trim() || 'self_test')
    formData.append('file', testFile)

    try {
      const res = await fetch(`${API_BASE}/transcribe`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) throw new Error('Transcription failed. Try a different audio file.')
      const json = await res.json()
      setTestResult({ transcript: json.transcript, wer: json.wer })
      setLiveWer(json.wer)
      setAcceptedFixes({})

      const suggestRes = await fetch(`${API_BASE}/suggest-corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_text: testReference, transcript: json.transcript })
      })
      const suggestJson = await suggestRes.json()
      setWordSuggestions(suggestJson.words)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setTestLoading(false)
    }
  }

  const toggleFix = async (index: number) => {
    const newAccepted = { ...acceptedFixes, [index]: !acceptedFixes[index] }
    setAcceptedFixes(newAccepted)

    const editedWords = wordSuggestions.map((w, i) => {
      if (newAccepted[i] && w.suggestion) return w.suggestion
      return w.word
    })
    const editedTranscript = editedWords.join(' ')

    try {
      const res = await fetch(`${API_BASE}/compute-wer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_text: testReference, hypothesis_text: editedTranscript })
      })
      const json = await res.json()
      setLiveWer(json.wer)
    } catch {
      // silently ignore, keep previous score
    }
  }

  const getBarColor = (wer: number) => {
    if (wer < 0.05) return '#4A9B6E'
    if (wer < 0.10) return '#E8A33D'
    return '#D96C5F'
  }

  const gap = data.length > 0
    ? (data[data.length - 1].avg_wer / data[0].avg_wer).toFixed(1)
    : null

  return (
    <div className="page">
      <div className="eyebrow-line">Sarvam AI Challenge — Accent Bias Auditor</div>
      <h1 className="headline">Not every accent gets heard the same way.</h1>
      <p className="subhead">
        We benchmarked Sarvam's speech-to-text model against real Indian-English speakers
        across ten language backgrounds, using the Svarah dataset (AI4Bharat). Word Error Rate
        measures how much of what was said actually made it into the transcript correctly.
      </p>

      {loading && <p className="status-text">Loading results...</p>}
      {error && <p className="status-error">Couldn't load results: {error}</p>}

      {!loading && !error && data.length > 0 && (
        <>
          <div className="finding-block">
            <div className="finding-number">{gap}×</div>
            <div className="finding-label">
              gap in error rate between the best- and worst-performing accent groups
              in our sample
            </div>
          </div>

          <div className="chart-table-row">
            <div className="chart-section">
              <div className="section-label">Average word error rate by accent group</div>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2E36" vertical={false} />
                  <XAxis dataKey="accent_group" stroke="#8A8F98" tick={{ fill: '#B4B8BF', fontSize: 12 }} />
                  <YAxis
                    stroke="#8A8F98"
                    tick={{ fill: '#B4B8BF', fontSize: 13 }}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    domain={[0, 'dataMax + 0.03']}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'WER']}
                    contentStyle={{ background: '#1D2128', border: '1px solid #2A2E36', borderRadius: '6px', color: '#EDEAE3' }}
                  />
                  <Bar
                    dataKey="avg_wer"
                    radius={[4, 4, 0, 0]}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.avg_wer)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="table-section">
              <div className="section-label">Full results — click a row for samples</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Accent</th>
                    <th>Avg WER</th>
                    <th>N</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr
                      key={row.accent_group}
                      onClick={() => handleSelectGroup(row.accent_group)}
                      className={selectedGroup === row.accent_group ? 'row-selected' : 'row-clickable'}
                    >
                      <td>{row.accent_group}</td>
                      <td>{(row.avg_wer * 100).toFixed(1)}%</td>
                      <td>{row.sample_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedGroup && (
            <div className="drilldown">
              <div className="section-label">
                {selectedGroup} — individual samples (worst first)
              </div>
              {samplesLoading && <p className="status-text">Loading samples...</p>}
              {!samplesLoading && samples.map((s) => (
                <div key={s.id} className="sample-card">
                  <div className="sample-wer" style={{ color: getBarColor(s.wer) }}>
                    {(s.wer * 100).toFixed(0)}% WER
                  </div>
                  <div className="sample-text">
                    <span className="sample-label">Reference:</span> {s.reference_text}
                  </div>
                  <div className="sample-text">
                    <span className="sample-label">Transcript:</span> {s.transcript}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mitigation-section">
            <div className="section-label">From detection to correction</div>
            <p className="mitigation-intro">
              Detecting the gap is the first step. As a proof of concept, we applied a
              domain-vocabulary correction pass to catch words the model likely garbled —
              regional names, cultural terms, and technical vocabulary the model has seen
              less of.
            </p>

            {mitigationLoading && <p className="status-text">Running correction pass...</p>}

            {!mitigationLoading && mitigation && (
              <>
                <div className="finding-block">
                  <div className="finding-number">
                    {(mitigation.avg_wer_before * 100).toFixed(1)}% → {(mitigation.avg_wer_after * 100).toFixed(1)}%
                  </div>
                  <div className="finding-label">
                    average WER before and after correction, across all {mitigation.total_samples} samples
                    ({mitigation.samples_improved} samples improved)
                  </div>
                </div>

                <div className="section-label">Example corrections</div>
                {mitigation.top_examples.map((ex, i) => (
                  <div key={i} className="sample-card">
                    <div className="sample-wer" style={{ color: '#4A9B6E' }}>
                      {ex.accent_group}: {(ex.before_wer * 100).toFixed(0)}% → {(ex.after_wer * 100).toFixed(0)}% WER
                    </div>
                    <div className="sample-text">
                      <span className="sample-label">Reference:</span> {ex.reference}
                    </div>
                    <div className="sample-text">
                      <span className="sample-label">Before:</span> {ex.before_transcript}
                    </div>
                    <div className="sample-text">
                      <span className="sample-label">After:</span> {ex.after_transcript}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <IndiaMapSection />

          <div className="test-section">
            <div className="section-label">Try it yourself</div>
            <p className="mitigation-intro">
              Record or upload a short clip of yourself speaking, type exactly what you said,
              and see how the model transcribes it — live.
            </p>

            <div className="test-form">
              <label className="test-field-label">Record your voice, or upload a file</label>
              <div className="record-row">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={isRecording ? 'record-btn recording' : 'record-btn'}
                >
                  {isRecording ? 'Stop recording' : 'Start recording'}
                </button>
                {testFile && !isRecording && (
                  <span className="file-selected-label">{testFile.name}</span>
                )}
              </div>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setTestFile(e.target.files ? e.target.files[0] : null)}
                className="test-input-file"
              />

              <label className="test-field-label">What did you say?</label>
              <textarea
                value={testReference}
                onChange={(e) => setTestReference(e.target.value)}
                placeholder="Type the exact words you said in the recording"
                className="test-textarea"
              />

              <label className="test-field-label">Your accent / language background (optional)</label>
              <input
                type="text"
                value={testAccentGroup}
                onChange={(e) => setTestAccentGroup(e.target.value)}
                placeholder="e.g. Tamil, Bengali, Nepali..."
                className="test-input-text"
              />

              <button
                onClick={handleTestSubmit}
                disabled={testLoading}
                className="test-submit-btn"
              >
                {testLoading ? 'Transcribing...' : 'Test it'}
              </button>

              {testError && <p className="status-error">{testError}</p>}

              {testResult && (
                <div className="test-result">
                  {(() => {
                    const matched = data.find(
                      (d) => d.accent_group.toLowerCase() === testAccentGroup.trim().toLowerCase()
                    )
                    if (!matched) return null
                    const currentWer = liveWer !== null ? liveWer : testResult.wer
                    const diff = currentWer - matched.avg_wer
                    return (
                      <div className="comparison-note">
                        Your result: <strong>{(currentWer * 100).toFixed(1)}%</strong> WER —{' '}
                        {matched.accent_group} speakers in our benchmark averaged{' '}
                        <strong>{(matched.avg_wer * 100).toFixed(1)}%</strong>.{' '}
                        {diff > 0.02
                          ? `You scored worse than average for this group.`
                          : diff < -0.02
                          ? `You scored better than average for this group.`
                          : `You're right around the average for this group.`}
                      </div>
                    )
                  })()}

                  <div className="sample-wer" style={{ color: liveWer !== null ? getBarColor(liveWer) : getBarColor(testResult.wer) }}>
                    {liveWer !== null ? (liveWer * 100).toFixed(1) : (testResult.wer * 100).toFixed(1)}% WER
                  </div>
                  <p className="mitigation-intro" style={{ marginBottom: '0.75rem' }}>
                    Click a red word to try our suggested correction.
                  </p>
                  <div className="sample-text">
                    <span className="sample-label">Transcript:</span>{' '}
                    {wordSuggestions.map((w, i) => {
                      const isFixed = acceptedFixes[i]
                      const displayWord = isFixed && w.suggestion ? w.suggestion : w.word
                      const clickable = w.is_wrong && w.suggestion
                      return (
                        <span
                          key={i}
                          onClick={() => clickable && toggleFix(i)}
                          style={{
                            color: isFixed ? '#4A9B6E' : w.is_wrong ? '#D96C5F' : '#EDEAE3',
                            fontWeight: w.is_wrong || isFixed ? 600 : 400,
                            cursor: clickable ? 'pointer' : 'default',
                            textDecoration: clickable ? 'underline dotted' : 'none'
                          }}
                        >
                          {displayWord}{' '}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {testResult && liveWer !== null && liveWer > 0.10 && (
                <div className="routing-demo">
                  <div className="section-label" style={{ marginTop: '2rem' }}>
                    What a real product would do
                  </div>
                  <p className="mitigation-intro">
                    This result fell below our confidence threshold. Instead of silently
                    serving a possibly-wrong transcript, a production system could route it
                    back for confirmation, like this:
                  </p>

                  {routingChoice === null && (
                    <div className="routing-bubble">
                      <div className="routing-question">
                        We're not fully confident we heard that right. Did you mean:
                      </div>
                      <div className="routing-suggestion">
                        "{wordSuggestions.map((w, i) => (acceptedFixes[i] && w.suggestion ? w.suggestion : w.word)).join(' ')}"
                      </div>
                      <div className="routing-actions">
                        <button className="routing-btn confirm" onClick={() => setRoutingChoice('accepted')}>
                          Yes, that's right
                        </button>
                        <button className="routing-btn reject" onClick={() => setRoutingChoice('rerecord')}>
                          No, let me try again
                        </button>
                      </div>
                    </div>
                  )}

                  {routingChoice === 'accepted' && (
                    <div className="routing-bubble routing-resolved">
                      Confirmed. The corrected transcript is saved, and this signal helps
                      flag which words this accent group's speakers get mistranscribed most.
                    </div>
                  )}

                  {routingChoice === 'rerecord' && (
                    <div className="routing-bubble routing-resolved">
                      No problem — instead of silently keeping a wrong transcript, the
                      system asks you to re-record rather than guessing.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App

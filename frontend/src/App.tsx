import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import './App.css'

interface AccentResult {
  accent_group: string
  avg_wer: number
  sample_count: number
}

const API_BASE = 'http://localhost:8000'

function App() {
  const [data, setData] = useState<AccentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        across six language backgrounds, using the Svarah dataset (AI4Bharat). Word Error Rate
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

          <div className="chart-section">
            <div className="section-label">Average word error rate by accent group</div>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2E36" vertical={false} />
                <XAxis dataKey="accent_group" stroke="#8A8F98" tick={{ fill: '#B4B8BF', fontSize: 13 }} />
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
                <Bar dataKey="avg_wer" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.avg_wer)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="section-label">Full results</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Accent group</th>
                <th>Avg WER</th>
                <th>Samples</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.accent_group}>
                  <td>{row.accent_group}</td>
                  <td>{(row.avg_wer * 100).toFixed(1)}%</td>
                  <td>{row.sample_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

export default App

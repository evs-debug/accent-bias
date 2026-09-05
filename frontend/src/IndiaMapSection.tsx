import { useEffect, useState } from 'react'
import IndiaMap from 'react-svgmap-india'

interface StateResult {
  state: string
  avg_wer: number
  sample_count: number
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  'Andaman and Nicobar Islands': 'AN',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  'Assam': 'AS',
  'Bihar': 'BR',
  'Chandigarh': 'CH',
  'Chhattisgarh': 'CT',
  'Delhi': 'DL',
  'Goa': 'GA',
  'Gujarat': 'GJ',
  'Himachal Pradesh': 'HP',
  'Haryana': 'HR',
  'Jharkhand': 'JH',
  'Jammu and Kashmir': 'JK',
  'Karnataka': 'KA',
  'Kerala': 'KL',
  'Ladakh': 'LA',
  'Lakshadweep': 'LD',
  'Maharashtra': 'MH',
  'Meghalaya': 'ML',
  'Manipur': 'MN',
  'Madhya Pradesh': 'MP',
  'Mizoram': 'MZ',
  'Nagaland': 'NL',
  'Odisha': 'OR',
  'Punjab': 'PB',
  'Puducherry': 'PY',
  'Rajasthan': 'RJ',
  'Sikkim': 'SK',
  'Telangana': 'TG',
  'Tamil Nadu': 'TN',
  'Tripura': 'TR',
  'Uttar Pradesh': 'UP',
  'Uttarakhand': 'UT',
  'West Bengal': 'WB'
}

const API_BASE = 'http://localhost:8000'

function getColorForWer(wer: number, sampleCount: number): string {
  if (sampleCount < 3) return '#3A3F47'
  if (wer < 0.05) return '#4A9B6E'
  if (wer < 0.10) return '#7BAF6A'
  if (wer < 0.15) return '#E8A33D'
  if (wer < 0.20) return '#DB8A4A'
  return '#D96C5F'
}

export default function IndiaMapSection() {
  const [stateData, setStateData] = useState<StateResult[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StateResult | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/results/by-state`)
      .then((res) => res.json())
      .then((json: StateResult[]) => {
        setStateData(json)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading || stateData.length === 0) return

    const applyColors = () => {
      stateData.forEach((row) => {
        const code = STATE_NAME_TO_CODE[row.state]
        if (!code) return
        const el = document.getElementById(code)
        if (el) {
          el.style.fill = getColorForWer(row.avg_wer, row.sample_count)
          el.style.cursor = 'pointer'
        }
      })
    }

    applyColors()
    const interval = setInterval(applyColors, 300)

    return () => clearInterval(interval)
  }, [loading, stateData])

  const handleMapClick = (code: string) => {
    const stateName = Object.keys(STATE_NAME_TO_CODE).find(
      (name) => STATE_NAME_TO_CODE[name] === code
    )
    const match = stateData.find((s) => s.state === stateName)
    setSelected(match || null)
  }

  return (
    <div className="map-section">
      <div className="section-label">Word error rate by speaker's home state</div>
      <p className="mitigation-intro">
        Click a state to see its results. Grey states had too few samples to be reliable.
      </p>

      {loading && <p className="status-text">Loading map...</p>}

      {!loading && (
        <div className="map-layout">
          <div className="map-container">
            <IndiaMap
              onClick={handleMapClick}
              size="380px"
              mapColor="#3A3F47"
              strokeColor="#15181D"
              strokeWidth="1"
              hoverColor="#E8A33D"
            />
          </div>

          <div className="map-details">
            {selected ? (
              <div className="sample-card">
                <div className="sample-wer" style={{ color: getColorForWer(selected.avg_wer, selected.sample_count) }}>
                  {selected.state}
                </div>
                <div className="sample-text">
                  Avg WER: {(selected.avg_wer * 100).toFixed(1)}%
                </div>
                <div className="sample-text">
                  Samples: {selected.sample_count}
                </div>
              </div>
            ) : (
              <p className="status-text">Click a state on the map to see its data.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

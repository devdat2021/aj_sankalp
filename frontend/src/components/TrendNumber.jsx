import { useState } from 'react'

export default function TrendNumber({ value, children }) {
  const [sample, setSample] = useState({ value, direction: 0 })
  if (value !== sample.value) {
    setSample({ value, direction: Math.sign(value - sample.value) })
  }
  return <>{children ?? value}{sample.direction !== 0 && <span className="metric-trend" title="Change since previous refresh" aria-label={sample.direction > 0 ? 'Increased since previous refresh' : 'Decreased since previous refresh'}>{sample.direction > 0 ? '▲' : '▼'}</span>}</>
}

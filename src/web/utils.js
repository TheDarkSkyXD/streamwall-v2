import { useState, useCallback } from 'preact/hooks'
import range from 'lodash/range'

const normalStreamKinds = new Set(['video', 'audio', 'web'])
function filterStreams(streams) {
  const liveStreams = []
  const otherStreams = []
  for (const stream of streams) {
    const { kind, status } = stream
    if (kind && !normalStreamKinds.has(kind)) {
      continue
    }
    if ((kind && kind !== 'video') || status === 'Live') {
      liveStreams.push(stream)
    } else {
      otherStreams.push(stream)
    }
  }
  return [liveStreams, otherStreams]
}

function calculateBasicLayout(streamCount) {
  if (streamCount <= 0) return [];
  
  // Define standard layouts for different stream counts
  const layouts = {
    1: [[0, 0, 4, 4]], // Full width/height
    2: [[0, 0, 2, 4], [2, 0, 2, 4]], // 1x2 grid
    3: [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 4, 2]], // 2+1 arrangement
    4: [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2]], // 2x2 grid
    5: [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2], [0, 4, 4, 1]], // 2x2 + 1
    6: [[0, 0, 2, 2], [2, 0, 2, 2], [4, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2], [4, 2, 2, 2]], // 3x2
    7: [[0, 0, 2, 2], [2, 0, 2, 2], [4, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2], [4, 2, 2, 2], [0, 4, 4, 1]], // 3x2 + 1
    8: [[0, 0, 2, 2], [2, 0, 2, 2], [4, 0, 2, 2], [6, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2], [4, 2, 2, 2], [6, 2, 2, 2]], // 4x2
    9: [[0, 0, 2, 2], [2, 0, 2, 2], [4, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2], [4, 2, 2, 2], [0, 4, 2, 2], [2, 4, 2, 2], [4, 4, 2, 2]], // 3x3
    10: [[0, 0, 2, 2], [2, 0, 2, 2], [4, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2], [4, 2, 2, 2], [0, 4, 2, 2], [2, 4, 2, 2], [4, 4, 2, 2], [0, 6, 4, 1]], // 3x3 + 1
    11: [[0, 0, 2, 2], [2, 0, 2, 2], [4, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2], [4, 2, 2, 2], [0, 4, 2, 2], [2, 4, 2, 2], [4, 4, 2, 2], [0, 6, 2, 1], [2, 6, 2, 1]], // 3x3 + 2
    12: [[0, 0, 2, 2], [2, 0, 2, 2], [4, 0, 2, 2], [6, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2], [4, 2, 2, 2], [6, 2, 2, 2], [0, 4, 2, 2], [2, 4, 2, 2], [4, 4, 2, 2], [6, 4, 2, 2]], // 4x3
  };

  // Return the predefined layout or default to a basic grid for larger numbers
  return layouts[streamCount] || [];
}

// An input that maintains local edits and fires onChange after blur (like a non-React input does), or optionally on every edit if isEager is set.
function LazyChangeInput({
  value = '',
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  isEager = false,
  ...props
}) {
  const [editingValue, setEditingValue] = useState()
  const handleFocus = useCallback(
    (ev) => {
      setEditingValue(ev.target.value)
      onFocus?.(ev)
    },
    [onFocus],
  )
  const handleBlur = useCallback(
    (ev) => {
      if (!isEager && editingValue !== undefined) {
        onChange(editingValue)
      }
      setEditingValue()
      onBlur?.(ev)
    },
    [onBlur, editingValue],
  )
  const handleKeyDown = useCallback((ev) => {
    if (ev.key === 'Enter') {
      handleBlur?.(ev)
    }
  })
  const handleChange = useCallback(
    (ev) => {
      const { value } = ev.target
      setEditingValue(value)
      if (isEager) {
        onChange(value)
      }
    },
    [onChange, isEager],
  )
  return (
    <input
      value={editingValue !== undefined ? editingValue : value}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      {...props}
    />
  )
}

export { filterStreams, calculateBasicLayout, LazyChangeInput }

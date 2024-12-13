import React, { useCallback, useState } from 'preact/hooks'
import { h } from 'preact'
import styled from 'styled-components'

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

function CustomStreamInput({ onChange, onDelete, ...props }) {
  const handleChangeLabel = useCallback(
    (value) => {
      onChange(props.link, { ...props, label: value })
    },
    [onChange, props],
  )
  const handleChangeCity = useCallback(
    (value) => {
      onChange(props.link, { ...props, city: value })
    },
    [onChange, props],
  )
  const handleChangeState = useCallback(
    (value) => {
      onChange(props.link, { ...props, state: value })
    },
    [onChange, props],
  )
  const handleChangeCountry = useCallback(
    (value) => {
      onChange(props.link, { ...props, country: value })
    },
    [onChange, props],
  )
  const handleDeleteClick = useCallback(() => {
    onDelete(props.link)
  }, [onDelete, props.link])
  return (
    <div>
      <LazyChangeInput
        value={props.label}
        onChange={handleChangeLabel}
        placeholder="Label (optional)"
      />{' '}
      <LazyChangeInput
        value={props.city}
        onChange={handleChangeCity}
        placeholder="City (optional)"
      />{' '}
      <LazyChangeInput
        value={props.state}
        onChange={handleChangeState}
        placeholder="State (optional)"
      />{' '}
      <LazyChangeInput
        value={props.country}
        onChange={handleChangeCountry}
        placeholder="Country (optional)"
      />{' '}
      <a href={props.link}>{props.link}</a> <span>({props.kind})</span>{' '}
      <button onClick={handleDeleteClick} title="Delete stream">x</button>
    </div>
  )
}

function CreateCustomStreamInput({ onCreate }) {
  const [link, setLink] = useState('')
  const [kind, setKind] = useState('video')
  const [label, setLabel] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [country, setCountry] = useState('')
  const handleSubmit = useCallback(
    (ev) => {
      ev.preventDefault()
      onCreate(link, { link, kind, label, city, state, country })
      setLink('')
      setKind('video')
      setLabel('')
      setCity('')
      setState('')
      setCountry('')
    },
    [onCreate, link, kind, label, city, state, country],
  )
  return (
    <form onSubmit={handleSubmit}>
      <input
        value={link}
        onChange={(ev) => setLink(ev.target.value)}
        placeholder="https://..."
      />
      <select onChange={(ev) => setKind(ev.target.value)} value={kind}>
        <option value="video">video</option>
        <option value="audio">audio</option>
        <option value="web">web</option>
        <option value="overlay">overlay</option>
        <option value="background">background</option>
      </select>
      <input
        value={label}
        onChange={(ev) => setLabel(ev.target.value)}
        placeholder="Label (optional)"
      />
      <input
        value={city}
        onChange={(ev) => setCity(ev.target.value)}
        placeholder="City (optional)"
      />
      <input
        value={state}
        onChange={(ev) => setState(ev.target.value)}
        placeholder="State (optional)"
      />
      <input
        value={country}
        onChange={(ev) => setCountry(ev.target.value)}
        placeholder="Country (optional)"
      />
      <button type="submit" title="Add new stream">add stream</button>
    </form>
  )
}

export { CustomStreamInput, CreateCustomStreamInput }

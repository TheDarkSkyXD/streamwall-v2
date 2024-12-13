import React, { useCallback } from 'preact/hooks'
import { h, Fragment } from 'preact'
import styled from 'styled-components'
import truncate from 'lodash/truncate'
import { idColor } from '../colors'
import { roleCan } from '../../roles'

const StyledId = styled.div`
  flex-shrink: 0;
  margin-right: 5px;
  background: ${({ color }) => color.lightness(50) || '#333'};
  color: white;
  padding: 3px;
  border-radius: 5px;
  width: 3em;
  text-align: center;
  cursor: ${({ disabled }) => (disabled ? 'normal' : 'pointer')};
`

const StyledStreamLine = styled.div`
  display: flex;
  align-items: center;
  margin: 0.5em 0;
`

function StreamLine({
  id,
  row: { label, source, title, link, notes, state, city, country },
  disabled,
  onClickId,
}) {
  // Use mousedown instead of click event so a potential destination grid input stays focused.
  const handleMouseDownId = useCallback(() => {
    onClickId(id)
  }, [onClickId, id])
  let location
  if (state && city && country) {
    location = ` (${city} ${state} ${country}) `
  }
  return (
    <StyledStreamLine>
      <StyledId
        disabled={disabled}
        onMouseDown={disabled ? null : handleMouseDownId}
        color={idColor(id)}
      >
        {id}
      </StyledId>
      <div>
        {label ? (
          label
        ) : (
          <>
            <strong>{source}</strong>
            {location}
            <a href={link} target="_blank">
              {truncate(title || link, { length: 55 })}
            </a>{' '}
            {notes}
          </>
        )}
      </div>
    </StyledStreamLine>
  )
}

function StreamList({ rows, onClickId, role }) {
  return rows.map((row) => (
    <StreamLine
      id={row._id}
      row={row}
      disabled={!roleCan(role, 'mutate-state-doc')}
      onClickId={onClickId}
    />
  ))
}

export { StreamList, StreamLine }

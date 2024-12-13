import React, { useState, useEffect, useCallback } from 'preact/hooks'
import styled from 'styled-components'
import { DateTime } from 'luxon'
import { roleCan } from '../../roles'

const StyledButton = styled.button`
  display: flex;
  align-items: center;
  border: 2px solid gray;
  border-color: gray;
  background: #ccc;
  border-radius: 5px;

  ${({ isActive, activeColor = 'red' }) =>
    isActive &&
    `
      border-color: ${activeColor};
      background: ${Color(activeColor).desaturate(0.5).lighten(0.5)};
    `};

  &:focus {
    outline: none;
    box-shadow: 0 0 10px orange inset;
  }

  svg {
    width: 20px;
    height: 20px;
  }
`

const StyledStreamDelayBox = styled.div`
  display: inline-flex;
  margin: 5px 0;
  padding: 10px;
  background: #fdd;

  & > * {
    margin-right: 1em;
  }
`

function StreamDurationClock({ startTime }) {
  const [now, setNow] = useState(() => DateTime.now())
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(DateTime.now())
    }, 500)
    return () => {
      clearInterval(interval)
    }
  }, [startTime])
  return (
    <span>{now.diff(DateTime.fromMillis(startTime)).toFormat('hh:mm:ss')}</span>
  )
}

function StreamDelayBox({
  role,
  delayState,
  setStreamCensored,
  setStreamRunning,
}) {
  const handleToggleStreamCensored = useCallback(() => {
    setStreamCensored(!delayState.isCensored)
  }, [delayState.isCensored, setStreamCensored])
  const handleToggleStreamRunning = useCallback(() => {
    if (!delayState.isStreamRunning || confirm('End stream?')) {
      setStreamRunning(!delayState.isStreamRunning)
    }
  }, [delayState.isStreamRunning, setStreamRunning])
  let buttonText
  if (delayState.isConnected) {
    if (delayState.state.matches('censorship.censored.deactivating')) {
      buttonText = 'Deactivating...'
    } else if (delayState.isCensored) {
      buttonText = 'Uncensor stream'
    } else {
      buttonText = 'Censor stream'
    }
  }
  return (
    <div>
      <StyledStreamDelayBox>
        <strong>Streamdelay</strong>
        {!delayState.isConnected && <span>connecting...</span>}
        {!delayState.isStreamRunning && <span>stream stopped</span>}
        {delayState.isConnected && (
          <>
            {delayState.startTime !== null && (
              <StreamDurationClock startTime={delayState.startTime} />
            )}
            <span>delay: {delayState.delaySeconds}s</span>
            {delayState.isStreamRunning && (
              <StyledButton
                isActive={delayState.isCensored}
                onClick={handleToggleStreamCensored}
                tabIndex={1}
                title="Toggle stream censorship"
              >
                {buttonText}
              </StyledButton>
            )}
            {roleCan(role, 'set-stream-running') && (
              <StyledButton onClick={handleToggleStreamRunning} tabIndex={1} title="Toggle stream running">
                {delayState.isStreamRunning ? 'End stream' : 'Start stream'}
              </StyledButton>
            )}
          </>
        )}
      </StyledStreamDelayBox>
    </div>
  )
}

export { StreamDelayBox, StreamDurationClock }

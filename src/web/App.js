import { h, render, Fragment } from 'preact'
import { useState, useCallback, useLayoutEffect, useRef } from 'preact/hooks'
import styled, { createGlobalStyle } from 'styled-components'
import { useHotkeys } from 'react-hotkeys-hook'
import { range } from 'lodash'
import { useStreamwallConnection } from './hooks'
import { StreamList } from './components/StreamList'
import { GridInput, GridControls, StyledGridContainer, StyledGridPreview, StyledGridPreviewBox, StyledGridInfo, StyledGridLabel, StyledGridInputs } from './components/Grid'
import { CustomStreamInput, CreateCustomStreamInput } from './components/CustomStream'
import { CreateInviteInput, AuthTokenLine, StyledNewInviteBox } from './components/Auth'
import { StreamDelayBox } from './components/StreamDelay'
import Facts from './components/Facts'
import { filterStreams, calculateBasicLayout } from './utils'
import { idxInBox } from '../geometry'
import { roleCan } from '../roles'
import { idColor } from './colors'
import GridIcon from '../static/grid-solid.svg'
import SlidersIcon from '../static/sliders-h-solid.svg'
import './index.css'

const GlobalStyle = createGlobalStyle`
  html {
    height: 100%;
  }

  html, body {
    display: flex;
    flex: 1;
  }
`

const hotkeyTriggers = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
  'q',
  'w',
  'e',
  'r',
  't',
  'y',
  'u',
  'i',
  'o',
  'p',
]

const StyledHeader = styled.header`
  display: flex;
  flex-direction: row;
  align-items: center;

  h1 {
    margin-top: 0;
    margin-bottom: 0;
  }

  * {
    margin-right: 2rem;
  }
`

const StyledDataContainer = styled.div`
  opacity: ${({ isConnected }) => (isConnected ? 1 : 0.5)};
`

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  flex: ${({ flex }) => flex};
  ${({ scroll }) => scroll && `overflow-y: auto`};
  ${({ minHeight }) => minHeight && `min-height: ${minHeight}px`};
`

function App({ wsEndpoint, role }) {
  const {
    isConnected,
    send,
    sharedState,
    stateDoc,
    config,
    streams,
    customStreams,
    views,
    stateIdxMap,
    delayState,
    authState,
  } = useStreamwallConnection(wsEndpoint)
  const { gridCount, width: windowWidth, height: windowHeight } = config

  const [showDebug, setShowDebug] = useState(false)
  const handleChangeShowDebug = useCallback((ev) => {
    setShowDebug(ev.target.checked)
  })

  const [swapStartIdx, setSwapStartIdx] = useState()
  const handleSwapView = useCallback(
    (idx) => {
      if (!stateIdxMap.has(idx)) {
        return
      }
      // Deselect the input so the contents aren't persisted by GridInput's `editingValue`
      document.activeElement.blur()
      setSwapStartIdx(idx)
    },
    [stateIdxMap],
  )
  const handleSwap = useCallback(
    (toIdx) => {
      if (swapStartIdx === undefined) {
        return
      }
      stateDoc.transact(() => {
        const viewsState = stateDoc.getMap('views')
        const startStreamId = viewsState
          .get(String(swapStartIdx))
          .get('streamId')
        const toStreamId = viewsState.get(String(toIdx)).get('streamId')
        const startSpaces = stateIdxMap.get(swapStartIdx).spaces
        const toSpaces = stateIdxMap.get(toIdx).spaces
        for (const startSpaceIdx of startSpaces) {
          viewsState.get(String(startSpaceIdx)).set('streamId', toStreamId)
        }
        for (const toSpaceIdx of toSpaces) {
          viewsState.get(String(toSpaceIdx)).set('streamId', startStreamId)
        }
      })
      setSwapStartIdx()
    },
    [stateDoc, stateIdxMap, swapStartIdx],
  )

  const [hoveringIdx, setHoveringIdx] = useState()
  const updateHoveringIdx = useCallback(
    (ev) => {
      const { width, height, left, top } =
        ev.currentTarget.getBoundingClientRect()
      const x = Math.floor(ev.clientX - left)
      const y = Math.floor(ev.clientY - top)
      const spaceWidth = width / gridCount
      const spaceHeight = height / gridCount
      const idx =
        Math.floor(y / spaceHeight) * gridCount + Math.floor(x / spaceWidth)
      setHoveringIdx(idx)
    },
    [setHoveringIdx, gridCount],
  )
  const [dragStart, setDragStart] = useState()
  const handleDragStart = useCallback(
    (ev) => {
      ev.preventDefault()
      if (swapStartIdx !== undefined) {
        handleSwap(hoveringIdx)
      } else {
        setDragStart(hoveringIdx)
        // Select the text (if it is an input element)
        ev.target.select?.()
      }
    },
    [handleSwap, swapStartIdx, hoveringIdx],
  )
  useLayoutEffect(() => {
    function endDrag() {
      if (dragStart === undefined) {
        return
      }
      stateDoc.transact(() => {
        const viewsState = stateDoc.getMap('views')
        const streamId = viewsState.get(String(dragStart)).get('streamId')
        for (let idx = 0; idx < gridCount ** 2; idx++) {
          if (idxInBox(gridCount, dragStart, hoveringIdx, idx)) {
            viewsState.get(String(idx)).set('streamId', streamId)
          }
        }
      })
      setDragStart()
    }
    window.addEventListener('mouseup', endDrag)
    return () => window.removeEventListener('mouseup', endDrag)
  }, [stateDoc, dragStart, hoveringIdx])

  const [focusedInputIdx, setFocusedInputIdx] = useState()
  const handleFocusInput = useCallback(setFocusedInputIdx, [])
  const handleBlurInput = useCallback(() => setFocusedInputIdx(), [])

  const handleSetView = useCallback(
    (idx, streamId) => {
      const stream = streams.find((d) => d._id === streamId)
      stateDoc
        .getMap('views')
        .get(String(idx))
        .set('streamId', stream ? streamId : '')
    },
    [stateDoc, streams],
  )

  const handleSetListening = useCallback((idx, listening) => {
    send({
      type: 'set-listening-view',
      viewIdx: listening ? idx : null,
    })
  }, [])

  const handleSetBackgroundListening = useCallback((viewIdx, listening) => {
    send({
      type: 'set-view-background-listening',
      viewIdx,
      listening,
    })
  }, [])

  const handleSetBlurred = useCallback((viewIdx, blurred) => {
    send({
      type: 'set-view-blurred',
      viewIdx,
      blurred: blurred,
    })
  }, [])

  const handleReloadView = useCallback((viewIdx) => {
    send({
      type: 'reload-view',
      viewIdx,
    })
  }, [])

  const handleRotateStream = useCallback(
    (streamId) => {
      const stream = streams.find((d) => d._id === streamId)
      if (!stream) {
        return
      }
      send({
        type: 'rotate-stream',
        url: stream.link,
        rotation: ((stream.rotation || 0) + 90) % 360,
      })
    },
    [streams],
  )

  const handleBrowse = useCallback(
    (streamId) => {
      const stream = streams.find((d) => d._id === streamId)
      if (!stream) {
        return
      }
      send({
        type: 'browse',
        url: stream.link,
      })
    },
    [streams],
  )

  const handleDevTools = useCallback((viewIdx) => {
    send({
      type: 'dev-tools',
      viewIdx,
    })
  }, [])

  const handleClickId = useCallback(
    (streamId) => {
      try {
        navigator.clipboard.writeText(streamId)
      } catch (err) {
        console.warn('Unable to copy stream id to clipboard:', err)
      }

      if (focusedInputIdx !== undefined) {
        handleSetView(focusedInputIdx, streamId)
        return
      }

      const availableIdx = range(gridCount * gridCount).find(
        (i) => !sharedState.views[i].streamId,
      )
      if (availableIdx === undefined) {
        return
      }
      handleSetView(availableIdx, streamId)
    },
    [gridCount, sharedState, focusedInputIdx, handleSetView],
  )

  const handleChangeCustomStream = useCallback((url, customStream) => {
    send({
      type: 'update-custom-stream',
      url,
      data: customStream,
    })
  }, [send])

  const handleDeleteCustomStream = useCallback((url) => {
    send({
      type: 'delete-custom-stream',
      url,
    })
    return
  }, [send])

  const setStreamCensored = useCallback((isCensored) => {
    send({
      type: 'set-stream-censored',
      isCensored,
    })
  }, [send])

  const setStreamRunning = useCallback((isStreamRunning) => {
    send({
      type: 'set-stream-running',
      isStreamRunning,
    })
  }, [send])

  const [newInvite, setNewInvite] = useState()

  const handleCreateInvite = useCallback(({ name, role }) => {
    send(
      {
        type: 'create-invite',
        name,
        role,
      },
      ({ name, secret }) => {
        setNewInvite({ name, secret })
      },
    )
  }, [send])

  const handleDeleteToken = useCallback((tokenId) => {
    send({
      type: 'delete-token',
      tokenId,
    })
  }, [send])

  const preventLinkClick = useCallback((ev) => {
    ev.preventDefault()
 }, [])

  // Set up keyboard shortcuts.
  useHotkeys(
    hotkeyTriggers.map((k) => `alt+${k}`).join(','),
    (ev, { key }) => {
      ev.preventDefault()
      const idx = hotkeyTriggers.indexOf(key[key.length - 1])
      const isListening = stateIdxMap.get(idx)?.isListening ?? false
      handleSetListening(idx, !isListening)
    },
    // This enables hotkeys when input elements are focused, and affects all hotkeys, not just this one.
    { filter: () => true },
    [stateIdxMap, handleSetListening],
  )
  useHotkeys(
    hotkeyTriggers.map((k) => `alt+shift+${k}`).join(','),
    (ev, { key }) => {
      ev.preventDefault()
      const idx = hotkeyTriggers.indexOf(key[key.length - 1])
      const isBlurred = stateIdxMap.get(idx)?.isBlurred ?? false
      handleSetBlurred(idx, !isBlurred)
    },
    [stateIdxMap, handleSetBlurred],
  )
  useHotkeys(
    `alt+c`,
    () => {
      setStreamCensored(true)
    },
    [setStreamCensored],
  )
  useHotkeys(
    `alt+shift+c`,
    () => {
      setStreamCensored(false)
    },
    [setStreamCensored],
  )
  useHotkeys(
    `alt+s`,
    () => {
      handleSwapView(focusedInputIdx)
    },
    [handleSwapView, focusedInputIdx],
  )

  const handleRemoveStream = useCallback(
    (idx) => {
      stateDoc.transact(() => {
        const viewsState = stateDoc.getMap('views')
        viewsState.get(String(idx)).set('streamId', '')
      })
    },
    [stateDoc],
  )

  const [liveStreams, otherStreams] = filterStreams(streams)

  const [mode, setMode] = useState('basic')

  const StyledModeToggle = styled.div`
    display: flex;
    gap: 8px;
    margin: 8px 0;
  `

  const StyledModeButton = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    background: ${({ isActive }) => (isActive ? '#4a4a4a' : '#2a2a2a')};
    color: ${({ isActive }) => (isActive ? '#fff' : '#aaa')};
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: ${({ isActive }) => (isActive ? '#5a5a5a' : '#3a3a3a')};
    }

    svg {
      width: 16px;
      height: 16px;
    }
  `

  const handleModeChange = useCallback(
    (newMode) => {
      setMode(newMode);
      if (newMode === 'basic') {
        // Apply automatic layout
        const activeStreams = Object.entries(streams)
          .filter(([_, stream]) => stream.status === 'Live' || stream.kind === 'web')
          .map(([id]) => id);
        
        const layout = calculateBasicLayout(activeStreams.length);
        
        stateDoc.transact(() => {
          const viewsState = stateDoc.getMap('views');
          // Clear all existing stream assignments
          for (let i = 0; i < gridCount; i++) {
            const view = viewsState.get(String(i));
            if (view) {
              view.set('streamId', '');
            }
          }
          
          // Apply new layout
          layout.forEach(([x, y, w, h], index) => {
            if (index < activeStreams.length) {
              const streamId = activeStreams[index];
              const gridIndex = y * 4 + x;
              const view = viewsState.get(String(gridIndex));
              if (view) {
                view.set('streamId', streamId);
                view.set('width', w);
                view.set('height', h);
              }
            }
          });
        });
      }
    },
    [stateDoc, streams, gridCount],
  );

  function ModeToggle({ mode, onModeChange }) {
    return (
      <StyledModeToggle>
        <StyledModeButton
          isActive={mode === 'basic'}
          onClick={() => onModeChange('basic')}
          title="Basic Mode - Auto-arrange streams to fill grid efficiently"
        >
          <GridIcon /> Basic
        </StyledModeButton>
        <StyledModeButton
          isActive={mode === 'advanced'}
          onClick={() => onModeChange('advanced')}
          title="Advanced Mode - Manual stream positioning and sizing"
        >
          <SlidersIcon /> Advanced
        </StyledModeButton>
      </StyledModeToggle>
    )
  }

  return (
    <>
      <GlobalStyle />
      <Stack flex="1">
        <Stack>
          <StyledHeader>
            <h1>Streamwall ({location.host})</h1>
            <div>
              connection status: {isConnected ? 'connected' : 'connecting...'}
            </div>
            <div>role: {role}</div>
          </StyledHeader>
          {delayState && (
            <StreamDelayBox
              role={role}
              delayState={delayState}
              setStreamCensored={setStreamCensored}
              setStreamRunning={setStreamRunning}
            />
          )}
          <ModeToggle mode={mode} onModeChange={handleModeChange} />
          <StyledDataContainer isConnected={isConnected}>
            {gridCount && (
              <StyledGridContainer
                onMouseMove={updateHoveringIdx}
                windowWidth={windowWidth}
                windowHeight={windowHeight}
              >
                <StyledGridInputs>
                  {range(0, gridCount).map((y) =>
                    range(0, gridCount).map((x) => {
                      const idx = gridCount * y + x
                      const { state } = stateIdxMap.get(idx) || {}
                      const { streamId } = sharedState.views?.[idx] ?? {}
                      const isDragHighlighted =
                        dragStart !== undefined &&
                        idxInBox(gridCount, dragStart, hoveringIdx, idx)
                      return (
                        <GridInput
                          style={{
                            width: `${100 / gridCount}%`,
                            height: `${100 / gridCount}%`,
                            left: `${(100 * x) / gridCount}%`,
                            top: `${(100 * y) / gridCount}%`,
                          }}
                          idx={idx}
                          spaceValue={streamId}
                          onChangeSpace={handleSetView}
                          isHighlighted={isDragHighlighted}
                          role={role}
                          onMouseDown={handleDragStart}
                          onFocus={handleFocusInput}
                          onBlur={handleBlurInput}
                        />
                      )
                    }),
                  )}
                </StyledGridInputs>
                <StyledGridPreview>
                  {views.map(({ state, isListening }) => {
                    const { pos } = state.context
                    const { streamId } = sharedState.views[pos.spaces[0]] ?? {}
                    const data = streams.find((d) => d._id === streamId)
                    return (
                      <StyledGridPreviewBox
                        color={idColor(streamId)}
                        style={{
                          left: `${(100 * pos.x) / windowWidth}%`,
                          top: `${(100 * pos.y) / windowHeight}%`,
                          width: `${(100 * pos.width) / windowWidth}%`,
                          height: `${(100 * pos.height) / windowHeight}%`,
                        }}
                        pos={pos}
                        windowWidth={windowWidth}
                        windowHeight={windowHeight}
                        isListening={isListening}
                        isError={state && state.matches('displaying.error')}
                      >
                        <StyledGridInfo>
                          <StyledGridLabel>{streamId}</StyledGridLabel>
                          <div>{data?.source}</div>
                        </StyledGridInfo>
                      </StyledGridPreviewBox>
                    )
                  })}
                </StyledGridPreview>
                {views.map(
                  ({ state, isListening, isBackgroundListening, isBlurred }) => {
                    const { pos } = state.context
                    const { streamId } = sharedState.views[pos.spaces[0]] ?? {}
                    return (
                      <GridControls
                        idx={pos.spaces[0]}
                        streamId={streamId}
                        style={{
                          left: `${(100 * pos.x) / windowWidth}%`,
                          top: `${(100 * pos.y) / windowHeight}%`,
                          width: `${(100 * pos.width) / windowWidth}%`,
                          height: `${(100 * pos.height) / windowHeight}%`,
                        }}
                        isDisplaying={state && state.matches('displaying')}
                        isListening={isListening}
                        isBackgroundListening={isBackgroundListening}
                        isBlurred={isBlurred}
                        isSwapping={pos.spaces.includes(swapStartIdx)}
                        showDebug={showDebug}
                        role={role}
                        onSetListening={handleSetListening}
                        onSetBackgroundListening={handleSetBackgroundListening}
                        onSetBlurred={handleSetBlurred}
                        onReloadView={handleReloadView}
                        onSwapView={handleSwapView}
                        onRotateView={handleRotateStream}
                        onBrowse={handleBrowse}
                        onDevTools={handleDevTools}
                        onMouseDown={handleDragStart}
                        onRemoveStream={handleRemoveStream}
                      />
                    )
                  },
                )}
              </StyledGridContainer>
            )}
            <Facts />
          </StyledDataContainer>
        </Stack>
        <Stack flex="1" scroll={true} minHeight={200}>
          <StyledDataContainer isConnected={isConnected}>
            {isConnected ? (
              <div>
                <h3>Live</h3>
                <StreamList rows={liveStreams} onClickId={handleClickId} role={role} />
                <h3>Offline / Unknown</h3>
                <StreamList rows={otherStreams} onClickId={handleClickId} role={role} />
              </div>
            ) : (
              <div>loading...</div>
            )}
            {roleCan(role, 'update-custom-stream') &&
              roleCan(role, 'delete-custom-stream') && (
                <>
                  <h2>Custom Streams</h2>
                  <div>
                    {/*
                    Include an empty object at the end to create an extra input for a new custom stream.
                    We need it to be part of the array (rather than JSX below) for DOM diffing to match the key and retain focus.
                  */}
                    {customStreams.map(
                      ({ link, label, kind, city, state, country }, idx) => (
                        <CustomStreamInput
                          key={idx}
                          link={link}
                          label={label}
                          city={city}
                          state={state}
                          country={country}
                          kind={kind}
                          onChange={handleChangeCustomStream}
                          onDelete={handleDeleteCustomStream}
                        />
                      ),
                    )}
                    <CreateCustomStreamInput
                      onCreate={handleChangeCustomStream}
                    />
                  </div>
                </>
              )}
            {roleCan(role, 'edit-tokens') && authState && (
              <>
                <h2>Access</h2>
                <div>
                  <CreateInviteInput onCreateInvite={handleCreateInvite} />
                  <h3>Invites</h3>
                  {newInvite && (
                    <StyledNewInviteBox>
                      Invite link created:{' '}
                      <a
                        href={`/invite/${newInvite.secret}`}
                        onClick={preventLinkClick}
                      >
                        "{newInvite.name}"
                      </a>
                    </StyledNewInviteBox>
                  )}
                  {authState.invites.map(({ id, name, role }) => (
                    <AuthTokenLine
                      id={id}
                      name={name}
                      role={role}
                      onDelete={handleDeleteToken}
                    />
                  ))}
                  <h3>Sessions</h3>
                  {authState.sessions.map(({ id, name, role }) => (
                    <AuthTokenLine
                      id={id}
                      name={name}
                      role={role}
                      onDelete={handleDeleteToken}
                    />
                  ))}
                </div>
              </>
            )}
          </StyledDataContainer>
        </Stack>
      </Stack>
    </>
  )
}

function main() {
  const script = document.getElementById('main-script')
  render(
    <App wsEndpoint={script.dataset.wsEndpoint} role={script.dataset.role} />,
    document.body,
  )
}

main()

export default App

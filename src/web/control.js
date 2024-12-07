import range from 'lodash/range'
import sortBy from 'lodash/sortBy'
import truncate from 'lodash/truncate'
import ReconnectingWebSocket from 'reconnecting-websocket'
import * as Y from 'yjs'
import { patch as patchJSON } from 'jsondiffpatch'
import { h, Fragment, render } from 'preact'
import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
} from 'preact/hooks'
import { State } from 'xstate'
import styled, { createGlobalStyle } from 'styled-components'
import { useHotkeys } from 'react-hotkeys-hook'
import Color from 'color'
import { DateTime } from 'luxon'

import '../index.css'
import { idxInBox } from '../geometry'
import { roleCan } from '../roles'
import SoundIcon from '../static/volume-up-solid.svg'
import NoVideoIcon from '../static/video-slash-solid.svg'
import ReloadIcon from '../static/sync-alt-solid.svg'
import RotateIcon from '../static/redo-alt-solid.svg'
import SwapIcon from '../static/exchange-alt-solid.svg'
import LifeRingIcon from '../static/life-ring-regular.svg'
import WindowIcon from '../static/window-maximize-regular.svg'
import TrashIcon from '../static/trash-alt-solid.svg'
import GridIcon from '../static/grid-solid.svg'
import SlidersIcon from '../static/sliders-h-solid.svg'
import { idColor } from './colors'

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

const GlobalStyle = createGlobalStyle`
  html {
    height: 100%;
  }

  html, body {
    display: flex;
    flex: 1;
  }
`

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

function useYDoc(keys) {
  const [doc, setDoc] = useState(new Y.Doc())
  const [docValue, setDocValue] = useState()
  useEffect(() => {
    function updateDocValue() {
      const valueCopy = Object.fromEntries(
        keys.map((k) => [k, doc.getMap(k).toJSON()]),
      )
      setDocValue(valueCopy)
    }
    updateDocValue()
    doc.on('update', updateDocValue)
    return () => {
      doc.off('update', updateDocValue)
    }
  }, [doc])
  return [docValue, doc, setDoc]
}

function useStreamwallConnection(wsEndpoint) {
  const wsRef = useRef()
  const [isConnected, setIsConnected] = useState(false)
  const [sharedState, stateDoc, setStateDoc] = useYDoc(['views'])
  const [config, setConfig] = useState({})
  const [streams, setStreams] = useState([])
  const [customStreams, setCustomStreams] = useState([])
  const [views, setViews] = useState([])
  const [stateIdxMap, setStateIdxMap] = useState(new Map())
  const [delayState, setDelayState] = useState()
  const [authState, setAuthState] = useState()

  useEffect(() => {
    let lastStateData
    const ws = new ReconnectingWebSocket(wsEndpoint, [], {
      maxReconnectionDelay: 5000,
      minReconnectionDelay: 1000 + Math.random() * 500,
      reconnectionDelayGrowFactor: 1.1,
    })
    ws.binaryType = 'arraybuffer'
    ws.addEventListener('open', () => setIsConnected(true))
    ws.addEventListener('close', () => {
      setStateDoc(new Y.Doc())
      setIsConnected(false)
    })
    ws.addEventListener('message', (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        return
      }
      const msg = JSON.parse(ev.data)
      if (msg.response) {
        const { responseMap } = wsRef.current
        const responseCb = responseMap.get(msg.id)
        if (responseCb) {
          responseMap.delete(msg.id)
          responseCb(msg)
        }
      } else if (msg.type === 'state' || msg.type === 'state-delta') {
        let state
        if (msg.type === 'state') {
          state = msg.state
        } else {
          state = patchJSON(lastStateData, msg.delta)
        }
        lastStateData = state

        const {
          config: newConfig,
          streams: newStreams,
          views,
          streamdelay,
          auth,
        } = state
        const newStateIdxMap = new Map()
        const newViews = []
        for (const viewState of views) {
          const { pos } = viewState.context
          const state = State.from(viewState.state, viewState.context)
          const isListening = state.matches(
            'displaying.running.audio.listening',
          )
          const isBackgroundListening = state.matches(
            'displaying.running.audio.background',
          )
          const isBlurred = state.matches('displaying.running.video.blurred')
          const viewInfo = {
            state,
            isListening,
            isBackgroundListening,
            isBlurred,
            spaces: pos.spaces,
          }
          newViews.push(viewInfo)
          for (const space of pos.spaces) {
            if (!newStateIdxMap.has(space)) {
              newStateIdxMap.set(space, {})
            }
            Object.assign(newStateIdxMap.get(space), viewInfo)
          }
        }
        setConfig(newConfig)
        setStateIdxMap(newStateIdxMap)
        setStreams(sortBy(newStreams, ['_id']))
        setViews(newViews)
        setCustomStreams(newStreams.filter((s) => s._dataSource === 'custom'))
        setDelayState(
          streamdelay && {
            ...streamdelay,
            state: State.from(streamdelay.state),
          },
        )
        setAuthState(auth)
      } else {
        console.warn('unexpected ws message', msg)
      }
    })
    wsRef.current = { ws, msgId: 0, responseMap: new Map() }
  }, [])

  const send = useCallback((msg, cb) => {
    const { ws, msgId, responseMap } = wsRef.current
    ws.send(
      JSON.stringify({
        ...msg,
        id: msgId,
      }),
    )
    if (cb) {
      responseMap.set(msgId, cb)
    }
    wsRef.current.msgId++
  }, [])

  useEffect(() => {
    function sendUpdate(update, origin) {
      if (origin === 'server') {
        return
      }
      wsRef.current.ws.send(update)
    }
    function receiveUpdate(ev) {
      if (!(ev.data instanceof ArrayBuffer)) {
        return
      }
      Y.applyUpdate(stateDoc, new Uint8Array(ev.data), 'server')
    }
    stateDoc.on('update', sendUpdate)
    wsRef.current.ws.addEventListener('message', receiveUpdate)
    return () => {
      stateDoc.off('update', sendUpdate)
      wsRef.current.ws.removeEventListener('message', receiveUpdate)
    }
  }, [stateDoc])

  return {
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
  }
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
    [gridCount, sharedState, focusedInputIdx],
  )

  const handleChangeCustomStream = useCallback((url, customStream) => {
    send({
      type: 'update-custom-stream',
      url,
      data: customStream,
    })
  })

  const handleDeleteCustomStream = useCallback((url) => {
    send({
      type: 'delete-custom-stream',
      url,
    })
    return
  })

  const setStreamCensored = useCallback((isCensored) => {
    send({
      type: 'set-stream-censored',
      isCensored,
    })
  }, [])

  const setStreamRunning = useCallback((isStreamRunning) => {
    send({
      type: 'set-stream-running',
      isStreamRunning,
    })
  }, [])

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
  }, [])

  const handleDeleteToken = useCallback((tokenId) => {
    send({
      type: 'delete-token',
      tokenId,
    })
  }, [])

  const preventLinkClick = useCallback((ev) => {
    ev.preventDefault()
 })

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
    [stateIdxMap],
  )
  useHotkeys(
    hotkeyTriggers.map((k) => `alt+shift+${k}`).join(','),
    (ev, { key }) => {
      ev.preventDefault()
      const idx = hotkeyTriggers.indexOf(key[key.length - 1])
      const isBlurred = stateIdxMap.get(idx)?.isBlurred ?? false
      handleSetBlurred(idx, !isBlurred)
    },
    [stateIdxMap],
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
  function StreamList({ rows }) {
    return rows.map((row) => (
      <StreamLine
        id={row._id}
        row={row}
        disabled={!roleCan(role, 'mutate-state-doc')}
        onClickId={handleClickId}
      />
    ))
  }

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
              <StreamList rows={liveStreams} />
              <h3>Offline / Unknown</h3>
              <StreamList rows={otherStreams} />
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
  )
}

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  flex: ${({ flex }) => flex};
  ${({ scroll }) => scroll && `overflow-y: auto`};
  ${({ minHeight }) => minHeight && `min-height: ${minHeight}px`};
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

function GridInput({
  style,
  idx,
  onChangeSpace,
  spaceValue,
  isHighlighted,
  role,
  onMouseDown,
  onFocus,
  onBlur,
}) {
  const handleFocus = useCallback(() => {
    onFocus(idx)
  }, [onFocus, idx])
  const handleBlur = useCallback(() => {
    onBlur(idx)
  }, [onBlur, idx])
  const handleChange = useCallback(
    (value) => {
      onChangeSpace(idx, value)
    },
    [idx, onChangeSpace],
  )
  return (
    <StyledGridInputContainer style={style}>
      <StyledGridInput
        value={spaceValue}
        color={idColor(spaceValue)}
        isHighlighted={isHighlighted}
        disabled={!roleCan(role, 'mutate-state-doc')}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onMouseDown={onMouseDown}
        onChange={handleChange}
        isEager
      />
    </StyledGridInputContainer>
  )
}

function GridControls({
  idx,
  streamId,
  style,
  isDisplaying,
  isListening,
  isBackgroundListening,
  isBlurred,
  isSwapping,
  showDebug,
  role,
  onSetListening,
  onSetBackgroundListening,
  onSetBlurred,
  onReloadView,
  onSwapView,
  onRotateView,
  onBrowse,
  onDevTools,
  onMouseDown,
  onRemoveStream,
}) {
  // TODO: Refactor callbacks to use streamID instead of idx.
  // We should probably also switch the view-state-changing RPCs to use a view id instead of idx like they do currently.
  const handleListeningClick = useCallback(
    (ev) =>
      ev.shiftKey || isBackgroundListening
        ? onSetBackgroundListening(idx, !isBackgroundListening)
        : onSetListening(idx, !isListening),
    [
      idx,
      onSetListening,
      onSetBackgroundListening,
      isListening,
      isBackgroundListening,
    ],
  )
  const handleBlurClick = useCallback(
    () => onSetBlurred(idx, !isBlurred),
    [idx, onSetBlurred, isBlurred],
  )
  const handleReloadClick = useCallback(
    () => onReloadView(idx),
    [idx, onReloadView],
  )
  const handleSwapClick = useCallback(() => onSwapView(idx), [idx, onSwapView])
  const handleRotateClick = useCallback(
    () => onRotateView(streamId),
    [streamId, onRotateView],
  )
  const handleBrowseClick = useCallback(
    () => onBrowse(streamId),
    [streamId, onBrowse],
  )
  const handleDevToolsClick = useCallback(
    () => onDevTools(idx),
    [idx, onDevTools],
  )
  const handleRemoveClick = useCallback(
    () => onRemoveStream(idx),
    [idx, onRemoveStream],
  )
  return (
    <StyledGridControlsContainer style={style} onMouseDown={onMouseDown}>
      <StyledGridButtons side="left">
        {roleCan(role, 'browse') && (
          <StyledSmallButton onClick={handleBrowseClick} tabIndex={1} title="Open in new window">
            <WindowIcon />
          </StyledSmallButton>
        )}
        {roleCan(role, 'dev-tools') && (
          <StyledSmallButton onClick={handleDevToolsClick} tabIndex={1} title="Open DevTools">
            <LifeRingIcon />
          </StyledSmallButton>
        )}
        {roleCan(role, 'rotate-stream') && (
          <StyledSmallButton onClick={handleRotateClick} tabIndex={1} title="Rotate stream">
            <RotateIcon />
          </StyledSmallButton>
        )}
        {roleCan(role, 'mutate-state-doc') && (
          <StyledSmallButton onClick={handleRemoveClick} tabIndex={1} title="Remove stream">
            <TrashIcon />
          </StyledSmallButton>
        )}
      </StyledGridButtons>

      <StyledGridButtons side="right">
        {roleCan(role, 'set-listening-view') && (
          <StyledButton
            isActive={isListening || isBackgroundListening}
            activeColor={isListening ? 'red' : Color('red').desaturate(0.5)}
            onClick={handleListeningClick}
            tabIndex={1}
            title={isListening ? "Stop listening" : (isBackgroundListening ? "Stop background listening" : "Start listening")}
          >
            <SoundIcon />
          </StyledButton>
        )}
        {roleCan(role, 'set-view-blurred') && (
          <StyledButton
            isActive={isBlurred}
            onClick={handleBlurClick}
            tabIndex={1}
            title={isBlurred ? "Unblur video" : "Blur video"}
          >
            <NoVideoIcon />
          </StyledButton>
        )}
        {roleCan(role, 'reload-view') && (
          <StyledSmallButton onClick={handleReloadClick} tabIndex={1} title="Reload view">
            <ReloadIcon />
          </StyledSmallButton>
        )}
        {roleCan(role, 'mutate-state-doc') && (
          <StyledSmallButton
            isActive={isSwapping}
            onClick={handleSwapClick}
            tabIndex={1}
            title={isSwapping ? "Cancel swap" : "Swap streams"}
          >
            <SwapIcon />
          </StyledSmallButton>
        )}
      </StyledGridButtons>
    </StyledGridControlsContainer>
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
      onChange(props.link, { ...props, label: value })
    },
    [onChange, props],
  )
  const handleChangeState = useCallback(
    (value) => {
      onChange(props.link, { ...props, label: value })
    },
    [onChange, props],
  )
  const handleChangeCountry = useCallback(
    (value) => {
      onChange(props.link, { ...props, label: value })
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
      onCreate(link, { link, kind, label })
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

const StyledStreamDelayBox = styled.div`
  display: inline-flex;
  margin: 5px 0;
  padding: 10px;
  background: #fdd;

  & > * {
    margin-right: 1em;
  }
`

const StyledDataContainer = styled.div`
  opacity: ${({ isConnected }) => (isConnected ? 1 : 0.5)};
`

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

const StyledSmallButton = styled(StyledButton)`
  svg {
    width: 14px;
    height: 14px;
  }
`

const StyledGridPreview = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`

const StyledGridPreviewBox = styled.div.attrs((props) => ({
  borderWidth: 2,
}))`
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  background: ${({ color }) => color.lightness(50) || '#333'};
  border: 0 solid ${({ isError }) => (isError ? 'red' : 'black')};
  border-left-width: ${({ pos, borderWidth }) =>
    pos.x === 0 ? 0 : borderWidth}px;
  border-right-width: ${({ pos, borderWidth, windowWidth }) =>
    pos.x + pos.width === windowWidth ? 0 : borderWidth}px;
  border-top-width: ${({ pos, borderWidth }) =>
    pos.y === 0 ? 0 : borderWidth}px;
  border-bottom-width: ${({ pos, borderWidth, windowHeight }) =>
    pos.y + pos.height === windowHeight ? 0 : borderWidth}px;
  box-shadow: ${({ isListening }) =>
    isListening ? `0 0 0 4px red inset` : 'none'};
  box-sizing: border-box;
  overflow: hidden;
  user-select: none;
`

const StyledGridInfo = styled.div`
  text-align: center;
`

const StyledGridLabel = styled.div`
  font-size: 30px;
`

const StyledGridInputs = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 100ms ease-out;
  overflow: hidden;
  z-index: 100;
`

const StyledGridInputContainer = styled.div`
  position: absolute;
`

const StyledGridButtons = styled.div`
  display: flex;
  position: absolute;
  ${({ side }) =>
    side === 'left' ? 'top: 0; left: 0' : 'bottom: 0; right: 0'};

  ${StyledButton} {
    margin: 5px;
    ${({ side }) => (side === 'left' ? 'margin-right: 0' : 'margin-left: 0')};
  }
`

const StyledGridInput = styled(LazyChangeInput)`
  width: 100%;
  height: 100%;
  outline: 1px solid black;
  border: none;
  padding: 0;
  background: ${({ color, isHighlighted }) =>
    isHighlighted ? color.lightness(90) : color.lightness(75)};
  font-size: 20px;
  text-align: center;

  &:focus {
    outline: 1px solid black;
    box-shadow: 0 0 5px black inset;
    z-index: 100;
  }
`

const StyledGridControlsContainer = styled.div`
  position: absolute;
  user-select: none;

  & > * {
    z-index: 200;
  }
`

const StyledGridContainer = styled.div.attrs((props) => ({
  scale: 0.75,
}))`
  position: relative;
  width: 1280px;
  height: 600px;
  border: 2px solid black;
  background: black;

  &:hover ${StyledGridInputs} {
    opacity: 0.35;
  }
`

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

function CreateInviteInput({ onCreateInvite }) {
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('operator')
  const handleChangeName = useCallback(
    (ev) => {
      setInviteName(ev.target.value)
    },
    [setInviteName],
  )
  const handleChangeRole = useCallback(
    (ev) => {
      setInviteRole(ev.target.value)
    },
    [setInviteRole],
  )
  const handleSubmit = useCallback(
    (ev) => {
      ev.preventDefault()
      setInviteName('')
      setInviteRole('operator')
      onCreateInvite({ name: inviteName, role: inviteRole })
    },
    [onCreateInvite, inviteName, inviteRole],
  )
  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          onChange={handleChangeName}
          placeholder="Name"
          value={inviteName}
        />
        <select onChange={handleChangeRole} value={inviteRole}>
          <option value="admin">Production manager</option>
          <option value="operator">Production Assistant</option>
          <option value="operator">Operator</option>
          <option value="monitor">Feed Monitor</option>
        </select>
        <button type="submit" title="Create new invite for team member">Invite Team Member</button>
      </form>
    </div>
  )
}

const StyledNewInviteBox = styled.div`
  display: inline-block;
  padding: 10px;
  background: #dfd;
`

function AuthTokenLine({ id, role, name, onDelete }) {
  const handleDeleteClick = useCallback(() => {
    onDelete(id)
  }, [id])
  return (
    <div>
      <strong>{name}</strong>: {role}{' '}
      <button onClick={handleDeleteClick} title="Revoke team member access">revoke</button>
    </div>
  )
}

function Facts() {
  return (
    <StyledFacts>
      <BLM>Black Lives Matter.</BLM>
      <FP>Free Internet</FP>
    </StyledFacts>
  )
}

const StyledFacts = styled.div`
  display: flex;
  margin: 4px 0;

  & > * {
    line-height: 26px;
    margin-right: 0.5em;
    padding: 0 6px;
    flex-shrink: 0;
  }
`

const BLM = styled.div`
  background: black;
  color: white;
`

const TRM = styled.div`
  background: linear-gradient(
    to bottom,
    #55cdfc 12%,
    #f7a8b8 12%,
    #f7a8b8 88%,
    #55cdfc 88%
  );
  color: white;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`

const TIN = styled.div`
  background: gray;
  font-family: monospace;
`
const FP = styled.div`
  background: linear-gradient(
    to bottom,
    #000000 26.55%,
    #ffffff 26.55%,
    #ffffff 73.45%,
    #008000 73.45%
  );
  position: relative;
  width: 120px;
  text-align: center;
  font-weight: bold;
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    border-left: 15px solid #e4312b; /* Adjust the size of the triangle as needed */
    border-bottom: 15px solid transparent; /* Adjust the size of the triangle as needed */
    border-top: 12px solid transparent; /* Adjust the size of the triangle as needed */
    border-right: 0;
  }
`

function main() {
  const script = document.getElementById('main-script')
  render(
    <>
      <GlobalStyle />
      <App wsEndpoint={script.dataset.wsEndpoint} role={script.dataset.role} />
    </>,
    document.body,
  )
}

main()

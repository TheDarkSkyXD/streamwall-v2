import { h, Fragment } from 'preact'
import { useState, useCallback, useLayoutEffect, useRef } from 'preact/hooks'
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
import { StyledHeader, StyledDataContainer, Stack } from './styles'
import { useAppHotkeys } from './hotkeys'
import ModeToggle from './components/ModeToggle'
import { useAppHandlers } from './handlers'


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
  const [dragStart, setDragStart] = useState()
  const [hoveringIdx, setHoveringIdx] = useState()
  const [focusedInputIdx, setFocusedInputIdx] = useState()

  const {
    handleSwapView,
    handleSwap,
    updateHoveringIdx,
    handleDragStart,
    handleFocusInput,
    handleBlurInput,
    handleSetView,
    handleSetListening,
    handleSetBackgroundListening,
    handleSetBlurred,
    handleReloadView,
    handleRotateStream,
    handleBrowse,
    handleDevTools,
    handleClickId,
    handleChangeCustomStream,
    handleDeleteCustomStream,
    handleCreateInvite,
    handleDeleteToken,
    preventLinkClick,
    handleRemoveStream,
  } = useAppHandlers({
    stateDoc,
    send,
    streams,
    sharedState,
    gridCount,
    stateIdxMap,
    setSwapStartIdx,
    setDragStart,
    setHoveringIdx,
    setFocusedInputIdx,
    setStreamCensored,
    setStreamRunning,
  })


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
  }, [stateDoc, dragStart, hoveringIdx, gridCount])


  useAppHotkeys({ stateIdxMap, handleSetListening, handleSetBlurred, setStreamCensored, handleSwapView, focusedInputIdx })


  const [liveStreams, otherStreams] = filterStreams(streams)

  const [mode, setMode] = useState('basic')


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
  )
}

export default App

import React, { useCallback, useState } from 'preact/hooks'
import { h } from 'preact'
import styled from 'styled-components'
import Color from 'color'
import { idColor } from '../colors'
import SoundIcon from '../../static/volume-up-solid.svg'
import NoVideoIcon from '../../static/video-slash-solid.svg'
import ReloadIcon from '../../static/sync-alt-solid.svg'
import RotateIcon from '../../static/redo-alt-solid.svg'
import SwapIcon from '../../static/exchange-alt-solid.svg'
import LifeRingIcon from '../../static/life-ring-regular.svg'
import WindowIcon from '../../static/window-maximize-regular.svg'
import TrashIcon from '../../static/trash-alt-solid.svg'
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

export { GridInput, GridControls, StyledGridContainer, StyledGridPreview, StyledGridPreviewBox, StyledGridInfo, StyledGridLabel, StyledGridInputs }

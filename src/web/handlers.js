import { useCallback } from 'preact/hooks'
import { range } from 'lodash'
import { idxInBox } from '../geometry'

export function useAppHandlers({ stateDoc, send, streams, sharedState, gridCount, stateIdxMap, setSwapStartIdx, setDragStart, setHoveringIdx, setFocusedInputIdx, setStreamCensored, setStreamRunning }) {
    const handleSwapView = useCallback(
        (idx) => {
          if (!stateIdxMap.has(idx)) {
            return
          }
          // Deselect the input so the contents aren't persisted by GridInput's `editingValue`
          document.activeElement.blur()
          setSwapStartIdx(idx)
        },
        [stateIdxMap, setSwapStartIdx],
      )
      const handleSwap = useCallback(
        (toIdx) => {
          if (stateDoc === undefined) {
            return
          }
          if (setSwapStartIdx === undefined) {
            return
          }
          stateDoc.transact(() => {
            const viewsState = stateDoc.getMap('views')
            const startStreamId = viewsState
              .get(String(setSwapStartIdx))
              .get('streamId')
            const toStreamId = viewsState.get(String(toIdx)).get('streamId')
            const startSpaces = stateIdxMap.get(setSwapStartIdx).spaces
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
        [stateDoc, stateIdxMap, setSwapStartIdx],
      )
    
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
      const handleDragStart = useCallback(
        (ev) => {
          ev.preventDefault()
          if (setSwapStartIdx !== undefined) {
            handleSwap(setHoveringIdx)
          } else {
            setDragStart(setHoveringIdx)
            // Select the text (if it is an input element)
            ev.target.select?.()
          }
        },
        [handleSwap, setSwapStartIdx, setHoveringIdx, setDragStart],
      )
    
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
      }, [send])
    
      const handleSetBackgroundListening = useCallback((viewIdx, listening) => {
        send({
          type: 'set-view-background-listening',
          viewIdx,
          listening,
        })
      }, [send])
    
      const handleSetBlurred = useCallback((viewIdx, blurred) => {
        send({
          type: 'set-view-blurred',
          viewIdx,
          blurred: blurred,
        })
      }, [send])
    
      const handleReloadView = useCallback((viewIdx) => {
        send({
          type: 'reload-view',
          viewIdx,
        })
      }, [send])
    
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
        [streams, send],
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
        [streams, send],
      )
    
      const handleDevTools = useCallback((viewIdx) => {
        send({
          type: 'dev-tools',
          viewIdx,
        })
      }, [send])
    
      const handleClickId = useCallback(
        (streamId) => {
          try {
            navigator.clipboard.writeText(streamId)
          } catch (err) {
            console.warn('Unable to copy stream id to clipboard:', err)
          }
    
          if (setFocusedInputIdx !== undefined) {
            handleSetView(setFocusedInputIdx, streamId)
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
        [gridCount, sharedState, setFocusedInputIdx, handleSetView],
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
    
      const handleCreateInvite = useCallback(({ name, role }) => {
        send(
          {
            type: 'create-invite',
            name,
            role,
          },
          ({ name, secret }) => {
            
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

     const handleRemoveStream = useCallback(
        (idx) => {
          stateDoc.transact(() => {
            const viewsState = stateDoc.getMap('views')
            viewsState.get(String(idx)).set('streamId', '')
          })
        },
        [stateDoc],
      )

      return {
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
      }
}

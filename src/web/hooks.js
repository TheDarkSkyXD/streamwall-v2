import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import * as Y from 'yjs'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { patch as patchJSON } from 'jsondiffpatch'
import { State } from 'xstate'
import sortBy from 'lodash/sortBy'

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

export { useYDoc, useStreamwallConnection }

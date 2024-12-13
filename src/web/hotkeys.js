import { useHotkeys } from 'react-hotkeys-hook'

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

export function useAppHotkeys({ stateIdxMap, handleSetListening, handleSetBlurred, setStreamCensored, handleSwapView, focusedInputIdx }) {
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
}

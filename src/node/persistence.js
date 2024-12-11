import { app } from 'electron'
import { promises as fsPromises, stat } from 'fs'
import path from 'path'
import throttle from 'lodash/throttle'

// This variable is assigned the path to a JSON file where the application state will be stored. The file is located in the user's data directory, which is a directory specific to the user on the system
const stateFilePath = path.join(app.getPath('userData'), 'streamwall.json')

// This variable holds the last known state of the application. It's initially an empty object 
let lastState = {}

// This function is an asynchronous function that takes a partialState object as an argument. It merges this partial state with the last known state, updates lastState, converts the resulting state to a JSON string, and writes it to the specified file using the fsPromises.writeFile method.
async function _save(partialState) {
  const state = { ...lastState, ...partialState }
  lastState = state
  const data = JSON.stringify(state)
  await fsPromises.writeFile(stateFilePath, data)
}

// This function is a throttled version of _save. It uses the throttle function from lodash to ensure that the _save function is not called more frequently than every 501 milliseconds.
export const save = throttle(_save, 501)

// This function is an asynchronous function that attempts to read the contents of the state file. If the file is not found (ENOENT error), it returns an empty object. If any other error occurs during reading, it logs a warning to the console and returns an empty object.
export async function load() {
  try {
    const data = await fsPromises.readFile(stateFilePath)
    return JSON.parse(data)
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Ignore missing file.
    } else {
      console.warn('error reading persisted state:', err)
    }
    return {}
  }
}

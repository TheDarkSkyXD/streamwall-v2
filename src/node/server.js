import url from 'url'
import http from 'http'
import https from 'https'
import WebSocket from 'ws'
import * as Y from 'yjs'
import simpleCert from 'node-simple-cert'

import Koa from 'koa'
import route from 'koa-route'
import serveStatic from 'koa-static'
import views from '@ladjs/koa-views'
import websocket from 'koa-easy-ws'

import { create as createJSONDiffPatch } from 'jsondiffpatch'

import { promisify } from 'util'
import { roleCan } from '../roles'

// Defines a constant for the session cookie name.
export const SESSION_COOKIE_NAME = 's'

// Uses jsondiffpatch to create a utility function (stateDiff) for generating the difference between two JSON objects.
const stateDiff = createJSONDiffPatch({
  objectHash: (obj, idx) => obj._id || `$$index:${idx}`,
  // Disable text diffing, both because it's overkill, and because it can crash with emojis (https://github.com/google/diff-match-patch/issues/68)
  textDiff: {
    minLength: Infinity,
  },
})

// Initializes a Koa application with middleware for authentication, routes for handling invites, rendering views, and WebSocket handling.
function initApp({
  auth,
  baseURL,
  webDistPath,
  clientState,
  logEnabled,
  onMessage,
  stateDoc,
}) {
  const expectedOrigin = new URL(baseURL).origin
  const sockets = new Set()

  const app = new Koa()

  // silence koa printing errors when websockets close early
  app.silent = true

  app.use(views(webDistPath, { extension: 'ejs' }))
  app.use(serveStatic(webDistPath))
  app.use(websocket())

  // Sets up WebSocket handling for communication between the server and clients. It includes logic for message processing, state updates, and delta transmission.
  app.use(
    route.get('/invite/:token', async (ctx, token) => {
      const tokenInfo = await auth.validateToken(token)
      if (!tokenInfo || tokenInfo.kind !== 'invite') {
        return ctx.throw(403)
      }
      const { secret } = await auth.createToken({
        kind: 'session',
        name: tokenInfo.name,
        role: tokenInfo.role,
      })
      ctx.cookies.set(SESSION_COOKIE_NAME, secret, {
        maxAge: 1 * 365 * 24 * 60 * 60 * 1000,
        overwrite: true,
      })
      await auth.deleteToken(tokenInfo.id)
      ctx.redirect('/')
    }),
  )

  app.use(async (ctx, next) => {
    // Set default admin identity without authentication
    ctx.state.identity = auth.admin()
    await next()
  })

  app.use(
    route.get('/', async (ctx) => {
      await ctx.render('control', {
        wsEndpoint: url.resolve(baseURL, 'ws').replace(/^http/, 'ws'),
        role: ctx.state.identity.role,
      })
    }),
  )

  app.use(
    route.get('/ws', async (ctx) => {
      if (ctx.ws) {
        if (ctx.headers.origin !== expectedOrigin) {
          ctx.status = 403
          return
        }

        const { identity } = ctx.state

        const ws = await ctx.ws()
        const client = {
          ws,
          lastState: null,
          identity,
        }
        sockets.add(client)

        ws.binaryType = 'arraybuffer'

        const pingInterval = setInterval(() => {
          ws.ping()
        }, 20 * 1000)

        ws.on('close', () => {
          sockets.delete(ws)
          clearInterval(pingInterval)
        })

        ws.on('message', (rawData) => {
          let msg
          const respond = (responseData) => {
            if (ws.readyState !== WebSocket.OPEN) {
              return
            }
            ws.send(
              JSON.stringify({
                ...responseData,
                response: true,
                id: msg && msg.id,
              }),
            )
          }
          if (rawData instanceof ArrayBuffer) {
            if (!roleCan(identity.role, 'mutate-state-doc')) {
              if (logEnabled) {
                console.warn(
                  `Unauthorized attempt to edit state doc by "${identity.name}"`,
                )
              }
              respond({
                error: 'unauthorized',
              })
              return
            }
            Y.applyUpdate(stateDoc, new Uint8Array(rawData))
            return
          }

          try {
            msg = JSON.parse(rawData)
          } catch (err) {
            if (logEnabled) {
              console.warn('received unexpected ws data:', rawData)
            }
            return
          }

          try {
            if (!roleCan(identity.role, msg.type)) {
              if (logEnabled) {
                console.warn(
                  `Unauthorized attempt to "${msg.type}" by "${identity.name}"`,
                )
              }
              respond({
                error: 'unauthorized',
              })
              return
            }
            onMessage(msg, respond)
          } catch (err) {
            console.error('failed to handle ws message:', data, err)
          }
        })

        const state = clientState.view(identity.role)
        ws.send(JSON.stringify({ type: 'state', state }))
        ws.send(Y.encodeStateAsUpdate(stateDoc))
        client.lastState = state
        return
      }
      ctx.status = 404
    }),
  )

  // Listens for updates in the client state and state documents, sending corresponding updates to connected WebSocket clients.


  clientState.on('state', (state) => {
    for (const client of sockets) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        continue
      }
      const stateView = state.view(client.identity.role)
      const delta = stateDiff.diff(client.lastState, stateView)
      client.lastState = stateView
      if (!delta) {
        continue
      }
      client.ws.send(JSON.stringify({ type: 'state-delta', delta }))
    }
  })

  stateDoc.on('update', (update) => {
    for (const client of sockets) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        continue
      }
      client.ws.send(update)
    }
  })

  // Monitors changes in authentication state and closes WebSocket connections for unauthorized clients. Includes Koa routes for handling authentication and rendering views.


  auth.on('state', (state) => {
    const tokenIds = new Set(state.sessions.map((t) => t.id))
    for (const client of sockets) {
      if (client.identity.role === 'admin') {
        continue
      }
      if (!tokenIds.has(client.identity.id)) {
        client.ws.close()
      }
    }
  })

  return { app }
}

// Exports an asynchronous function for initializing the web server. It creates an HTTP or HTTPS server based on the configuration, sets up routes, and starts listening on the specified port.
//  ... creates an HTTP or HTTPS server based on configuration, sets up routes, and starts listening
export default async function initWebServer({
  certDir,
  certProduction,
  email,
  url: baseURL,
  hostname: overrideHostname,
  port: overridePort,
  webDistPath,
  auth,
  logEnabled,
  clientState,
  onMessage,
  stateDoc,
}) {
  let { protocol, hostname, port } = new URL(baseURL)
  if (!port) {
    port = protocol === 'https:' ? 443 : 80
  }
  if (overridePort) {
    port = overridePort
  }

  const { app } = initApp({
    auth,
    baseURL,
    webDistPath,
    clientState,
    logEnabled,
    onMessage,
    stateDoc,
  })

  let server
  if (protocol === 'https:' && certDir) {
    const { key, cert } = await simpleCert({
      dataDir: certDir,
      commonName: hostname,
      email,
      production: certProduction,
      serverHost: overrideHostname || hostname,
    })
    server = https.createServer({ key, cert }, app.callback())
  } else {
    server = http.createServer(app.callback())
  }

  const listen = promisify(server.listen).bind(server)
  await listen(port, overrideHostname || hostname)

  return { server }
}

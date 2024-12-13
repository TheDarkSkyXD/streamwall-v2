import { h, render, Fragment } from 'preact'
import App from './App'
import './index.css'
import { createGlobalStyle } from 'styled-components'

const GlobalStyle = createGlobalStyle`
  html {
    height: 100%;
  }

  html, body {
    display: flex;
    flex: 1;
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

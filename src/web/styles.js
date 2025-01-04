import styled from 'styled-components'

export const StyledHeader = styled.header`
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

export const StyledDataContainer = styled.div`
  opacity: ${({ isConnected }) => (isConnected ? 1 : 0.5)};
`

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  flex: ${({ flex }) => flex};
  ${({ scroll }) => scroll && `overflow-y: auto`};
  ${({ minHeight }) => minHeight && `min-height: ${minHeight}px`};
`

export const StyledModeToggle = styled.div`
  display: flex;
  gap: 8px;
  margin: 8px 0;
`

export const StyledModeButton = styled.button`
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

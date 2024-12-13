import React, { h } from 'preact'
import styled from 'styled-components'

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

function Facts() {
  return (
    <StyledFacts>
      <BLM>Black Lives Matter.</BLM>
      <FP>Free Internet</FP>
    </StyledFacts>
  )
}

export default Facts

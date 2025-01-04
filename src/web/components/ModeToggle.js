import { StyledModeToggle, StyledModeButton } from '../styles'
import GridIcon from '../../static/grid-solid.svg'
import SlidersIcon from '../../static/sliders-h-solid.svg'

function ModeToggle({ mode, onModeChange }) {
    return (
      <StyledModeToggle>
        <StyledModeButton
          isActive={mode === 'basic'}
          onClick={() => onModeChange('basic')}
          title="Basic Mode - Auto-arrange streams to fill grid efficiently"
        >
          <GridIcon /> Basic
        </StyledModeButton>
        <StyledModeButton
          isActive={mode === 'advanced'}
          onClick={() => onModeChange('advanced')}
          title="Advanced Mode - Manual stream positioning and sizing"
        >
          <SlidersIcon /> Advanced
        </StyledModeButton>
      </StyledModeToggle>
    )
  }

export default ModeToggle

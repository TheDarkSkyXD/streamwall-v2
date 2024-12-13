import React, { useCallback, useState } from 'preact/hooks'
import { h } from 'preact'
import styled from 'styled-components'

function CreateInviteInput({ onCreateInvite }) {
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('operator')
  const handleChangeName = useCallback(
    (ev) => {
      setInviteName(ev.target.value)
    },
    [setInviteName],
  )
  const handleChangeRole = useCallback(
    (ev) => {
      setInviteRole(ev.target.value)
    },
    [setInviteRole],
  )
  const handleSubmit = useCallback(
    (ev) => {
      ev.preventDefault()
      setInviteName('')
      setInviteRole('operator')
      onCreateInvite({ name: inviteName, role: inviteRole })
    },
    [onCreateInvite, inviteName, inviteRole],
  )
  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          onChange={handleChangeName}
          placeholder="Name"
          value={inviteName}
        />
        <select onChange={handleChangeRole} value={inviteRole}>
          <option value="admin">Production manager</option>
          <option value="operator">Production Assistant</option>
          <option value="operator">Operator</option>
          <option value="monitor">Feed Monitor</option>
        </select>
        <button type="submit" title="Create new invite for team member">Invite Team Member</button>
      </form>
    </div>
  )
}

const StyledNewInviteBox = styled.div`
  display: inline-block;
  padding: 10px;
  background: #dfd;
`

function AuthTokenLine({ id, role, name, onDelete }) {
  const handleDeleteClick = useCallback(() => {
    onDelete(id)
  }, [id])
  return (
    <div>
      <strong>{name}</strong>: {role}{' '}
      <button onClick={handleDeleteClick} title="Revoke team member access">revoke</button>
    </div>
  )
}

export { CreateInviteInput, AuthTokenLine, StyledNewInviteBox }

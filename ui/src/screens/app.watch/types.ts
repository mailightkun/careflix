export interface State {
  party: AppParty | null
  isLoading: boolean
}

export interface Handlers {
  onCancel: (invitation: AppPartyInvitation) => void
  onInvite: (invitation: AppPartyInvitation) => void
  onChangeVideo: (party: AppParty) => void
}

export type ContextType = State & Handlers

export type Action = ReducerAction<'data:init'>
 | ReducerAction<'data:success', { party: AppParty }>
 | ReducerAction<'data:error'>
 | ReducerAction<'data:update', { party: AppParty }>
 | ReducerAction<'invitation.send', { invitation: AppPartyInvitation }>
 | ReducerAction<'invitation.cancel', { invitation: AppPartyInvitation }>
import './style'

import * as React from 'react'
import cx from 'classnames'
import UiAvatar from '~/components/UiAvatar'
import UiPlainButton from '~/components/UiPlainButton'
import ChatInvitationModal from '../ChatInvitationModal'
import TextareaAutosize from 'react-textarea-autosize'
import ChatWidgetTip from '../ChatWidgetTip'

import { usePropRef } from '~/hooks/usePropRef'
import { useAuth } from '~/contexts/Auth'

import axios from '~/lib/axios'
import last from '~/utils/last'
import uuid from '~/lib/uuid'
import immer from 'immer'
import { useReducer, useState, useEffect, useMemo, useRef } from 'react'
import { useAsyncEffect } from 'use-async-effect'
import { usePusher } from '~/hooks/usePusher'
import { useWindowVisibility } from '~/hooks/useWindowVisibility'
import useWindowSize from 'react-use/lib/useWindowSize'
import getStandardFormattedDateTime from '~/utils/date/getStandardFormattedDateTime'

import asset_chatInactive from '~/assets/audio/chat-inactive.ogg'
import asset_chatSend from '~/assets/audio/chat-send.ogg'
import UiAvatarGroup from '~components/UiAvatarGroup'
import isFocusedToInput from '~/utils/dom/isFocusedToInput'

interface State {
  logs: AppPartyLog[]
  message: {
    text: string
  }
  isSending: {
    [key: number]: string
  }
  isLoading: boolean
}

type Action =
  | ReducerAction<'request:init'>
  | ReducerAction<'request:error'>
  | ReducerAction<'request:success', { logs: AppPartyLog[] }>
  | ReducerAction<'logs:push', { log: AppPartyLog }>
  | ReducerAction<'chat:input', { input: string }>
  | ReducerAction<'chat:init', { log: AppPartyLog }>
  | ReducerAction<'chat:success', { id: AppId; log: AppPartyLog }>
  | ReducerAction<'chat:error', { id: AppId }>

interface Props {
  party: AppParty
  isChatOpen: boolean
  isSeasonSelectionOpen: boolean
  isInvitationOpen: boolean
  isKeyboardInfoOpen: boolean
  onOpenInvitationModal: () => void
  onCloseInvitationModal: () => void
}

interface GroupedLog {
  type: 'activity' | 'message'
  user: AppUser
  logs: AppPartyLog[]
}

const reducer = (state: State, action: Action) => {
  switch (action.type) {
    case 'request:init': {
      return {
        ...state,
        isLoading: true
      }
    }

    case 'request:success': {
      return {
        ...state,
        logs: action.payload.logs,
        isLoading: false
      }
    }

    case 'request:error': {
      return {
        ...state,
        isLoading: false
      }
    }

    case 'logs:push': {
      return {
        ...state,
        logs: [...state.logs, action.payload.log]
      }
    }

    case 'chat:input': {
      return immer(state, draft => {
        draft.message.text = action.payload.input
      })
    }

    case 'chat:init': {
      return immer(state, draft => {
        draft.message.text = ''
        draft.logs.push(action.payload.log)
      })
    }

    case 'chat:error': {
      // @TODO
      return {
        ...state
      }
    }

    case 'chat:success': {
      return immer(state, draft => {
        const index = draft.logs.findIndex(log => log.id === action.payload.id)
        draft.logs[index] = action.payload.log
      })
    }
  }
}

const init: State = {
  logs: [],
  message: { text: '' },
  isSending: {},
  isLoading: false
}

function ChatWidget(props: Props) {
  const auth = useAuth()
  const [state, dispatch] = useReducer(reducer, init)
  const { height } = useWindowSize()
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false)
  const chatbarRef = useRef<HTMLDivElement>(null)
  const idleAudioRef = useRef<HTMLAudioElement>(null)
  const sendAudioRef = useRef<HTMLAudioElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // One-off flag used to check if we're supposed to scroll to the bottom
  const shouldScrollToBottomRef = useRef<boolean>(true)
  // The last stored scroll distance from the bottom of our chat list container
  // We want to update when then the user scrolls the container or the container size changes.
  const lastScrollDistanceFromBottom = useRef<number>(0)
  // One-off flag used to check if it's a message sent through pusher
  const isReceivingRef = useRef<boolean>(true)
  const isSubmittable = state.message.text.trimRight().trimLeft().length > 0

  useAsyncEffect(
    async () => {
      dispatch({
        type: 'request:init'
      })

      const [err, res] = await axios.get(`/api/parties/${props.party.id}/logs`)

      if (err != null) {
        return dispatch({
          type: 'request:error'
        })
      }

      dispatch({
        type: 'request:success',
        payload: { logs: res.data }
      })

      scrollToBottom(chatbarRef.current)
    },
    null,
    []
  )

  React.useLayoutEffect(() => {
    if (!isReceivingRef.current || shouldScrollToBottomRef.current) {
      // Scroll to bottom whenever:
      // A new log gets sent by someone else while we're scrolled a bit from above.
      // We sent the message by ourself.
      scrollToBottom(chatbarRef.current)
    } else if (isReceivingRef.current) {
      // If we received a message while not scrolled to the bottom.
      // It may seem like it works if you remove the wrapping condition,
      // but we don't want a race condition. We also don't want it to flash
      // if it we sent the message ourself.
      setHasUnreadMessages(true)
    }

    lastScrollDistanceFromBottom.current = getScrollDistanceFromBottom(chatbarRef.current)
  }, [state.logs.length])

  const isWindowVisible = useWindowVisibility()

  usePusher(`private-party.${props.party.id}`, 'log', (event: { log: AppPartyLog }) => {
    isReceivingRef.current = true

    // If the user was scrolled to the bottom before receiving a new message
    // we'll keep the illusion that they still are.
    shouldScrollToBottomRef.current = isScrolledToBottom(chatbarRef.current)

    dispatch({
      type: 'logs:push',
      payload: { log: event.log }
    })

    if (!isWindowVisible && event.log.type === 'message') {
      // Let's play a sound if the user receives a message while switched to another tab.
      idleAudioRef.current.play()
    }
  })

  useEffect(() => {
    // @TODO Make a reusable component that does this kasi tangina nito hahahah
    // <Audio volume={pakyu} />
    idleAudioRef.current.volume = 0.1
    sendAudioRef.current.volume = 0.1
  }, [])

  const propsRef = usePropRef(props)

  useEffect(() => {
    function handleKeyDown(evt: KeyboardEvent) {
      // @TODO Turn / into a shortcut to open up chat. At the moment,
      // causes bugs like breaking layout because we're forcing focus to
      // an element that's off-canvas.
      if (!propsRef.current.isChatOpen) {
        return
      }

      // We don't want keyboard events to fire while a modal is open
      if (
        propsRef.current.isInvitationOpen ||
        propsRef.current.isSeasonSelectionOpen ||
        propsRef.current.isKeyboardInfoOpen
      ) {
        return
      }

      // We simply don't want to interfere if the user is focused on any input.
      if (isFocusedToInput()) {
        return
      }

      if (evt.keyCode === 191 && !evt.shiftKey) {
        // Otherwise, the `/` keydown would be appended to the input.
        setTimeout(() => {
          inputRef.current.focus()
        }, 0)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Whether the user toggles fullscreen or changes their orientation,
  // we want to keep them at the same position as they were from the bottom.
  // @TODO Maybe we can have a component that scrolls from the bottom.
  useEffect(() => {
    scrollFromBottom(chatbarRef.current, lastScrollDistanceFromBottom.current)
  }, [height])

  function handleInput(evt: React.FormEvent<HTMLInputElement>) {
    dispatch({
      type: 'chat:input',
      payload: { input: evt.currentTarget.value }
    })
  }

  async function handleMessage(evt: React.FormEvent<HTMLFormElement>) {
    evt.preventDefault()

    if (!isSubmittable) {
      return
    }

    const id = uuid()

    const date = getStandardFormattedDateTime()

    const log: AppPartyLog = {
      id,
      party_id: props.party.id,
      type: 'message',
      message: {
        id: uuid(),
        text: state.message.text,
        user: auth.data,
        created_at: date,
        updated_at: date
      },
      activity: null,
      created_at: date,
      updated_at: date
    }

    isReceivingRef.current = false

    dispatch({
      type: 'chat:init',
      payload: { log }
    })

    sendAudioRef.current.play()

    const [err, res] = await axios.post(`/api/parties/${props.party.id}/logs/message`, {
      message: state.message.text
    })

    if (err != null) {
      return dispatch({
        type: 'chat:error',
        payload: { id }
      })
    }

    dispatch({
      type: 'chat:success',
      payload: {
        id,
        log: res.data
      }
    })
  }

  const grouped = useMemo(() => {
    return groupPartyLogs(state.logs)
  }, [state.logs])

  const inputRef = useRef<HTMLInputElement>(null)

  function handleInputKeyDown(evt: React.KeyboardEvent<HTMLInputElement>) {
    if (evt.keyCode === 27) {
      // We want to blur the input if the user presses escape to make it
      // convenient to access video player hotkeys without having to press anywhere
      inputRef.current.blur()
    }

    if (evt.keyCode === 13 && !evt.shiftKey) {
      // We want the message to be sent if the user presses enter;
      // To make a new line, the user has to press shift.
      buttonRef.current.click()

      // If we don't call this, we would send the message then make a new line.
      evt.preventDefault()
    }
  }

  function handleMessagesContainerScroll(evt) {
    lastScrollDistanceFromBottom.current = getScrollDistanceFromBottom(chatbarRef.current)

    if (hasUnreadMessages && isScrolledToBottom(chatbarRef.current)) {
      // We'll remove the "has unread messages" note when the user scrolls to the bottom.
      // This the removal of the unread messages when the user himself sends a message,
      // since it also auto-scrolls the user to the bottom of the list.
      setHasUnreadMessages(false)
    }
  }

  function handleClickUnreadMessages() {
    scrollToBottom(chatbarRef.current)
  }

  return (
    <div
      className={cx('watch-screen-chat', {
        'is-chat-open': props.isChatOpen
      })}>
      <div className="watch-screen-canopy">
        <UiAvatarGroup users={props.party.members} />

        <ChatInvitationModal
          isOpen={props.isInvitationOpen}
          onOpen={props.onOpenInvitationModal}
          onClose={props.onCloseInvitationModal}
        />
      </div>

      <div className="watch-screen-chat-messages-container">
        <div className="watch-screen-chat-messages" ref={chatbarRef} onScroll={handleMessagesContainerScroll}>
          <ChatWidgetTip />

          {grouped.map((group, i) => {
            if (group.type === 'activity') {
              return (
                <div className="watch-screen-activity-group" key={i}>
                  {group.logs.map(log => (
                    <div className="activity" key={log.id}>
                      <div className="avatar">
                        <UiAvatar user={log.activity.user} size="sm" />
                      </div>

                      <h6 className="ui-subheading">
                        {log.activity.user.name} {log.activity.text}.
                      </h6>
                    </div>
                  ))}
                </div>
              )
            }

            const isSelf = group.user.id === auth.data.id

            return (
              <div
                className={cx('watch-screen-chat-group', {
                  'is-self': isSelf
                })}
                key={i}>
                <div className="avatar">
                  <UiAvatar user={group.user} />
                </div>

                <div className="messages">
                  {!isSelf && <div className="name">{group.user.name}</div>}

                  <div className="list">
                    {group.logs.map(log => (
                      <div className="message" key={log.id}>
                        <div className="inner">{log.message.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {hasUnreadMessages && (
          <div className="watch-screen-chatbar-unread-note" onClick={handleClickUnreadMessages}>
            <UiPlainButton type="button" className="note">
              You have unread messages
              <span className="icon">
                <i className="fa fa-angle-down" />
              </span>
            </UiPlainButton>
          </div>
        )}
      </div>

      <div className="watch-screen-chatbar">
        <form onSubmit={handleMessage} className="watch-screen-chatbar-input">
          <TextareaAutosize
            placeholder={`Press / to focus`}
            value={state.message.text}
            inputRef={inputRef}
            onChange={handleInput}
            onKeyDown={handleInputKeyDown}
            className="textarea"
          />

          <UiPlainButton className="button" disabled={!isSubmittable} ref={buttonRef}>
            <i className="fa fa-arrow-up" />
          </UiPlainButton>
        </form>
      </div>

      <audio className="chat-notification-audio" ref={idleAudioRef}>
        <source src={asset_chatInactive} type="audio/ogg" />
      </audio>

      <audio className="chat-notification-audio" ref={sendAudioRef}>
        <source src={asset_chatSend} type="audio/ogg" />
      </audio>
    </div>
  )
}

/**
 * This will group chat based on the criteria:
 *
 * Suceeding logs
 * Succeeding messages sent by the same user
 */
function groupPartyLogs(logs: AppPartyLog[]): GroupedLog[] {
  if (logs.length === 0) {
    return []
  }

  const first: AppPartyLog = logs[0]

  const groups: GroupedLog[] = [
    {
      type: first.type,
      user: first[first.type].user,
      logs: [first]
    }
  ]

  // Since we've initialized the group with the first log, we'll start with the second log.
  logs.slice(1).forEach(log => {
    const recent = last(groups)

    // We'll add it to the last group if it fits the criteria
    if (
      (log.type === 'activity' && recent.type === log.type) ||
      (log.type === 'message' && recent.type === log.type && recent.user.id === log.message.user.id)
    ) {
      recent.logs.push(log)
    } else {
      // Otherwise, we'll create a new group and push it there
      groups.push({
        type: log.type,
        user: log[log.type].user,
        logs: [log]
      })
    }
  })

  return groups
}

function scrollToBottom(el: HTMLElement, opts: { treshold?: number } = {}) {
  const treshold = opts.treshold || 0
  el.scrollTop = getScrollableContainerHeight(el) - treshold
}

/**
 * In long terms "Scroll to <distance from bottom>".
 * We'll use `distance` as relative scroll distance from the bottom.
 */
function scrollFromBottom(el: HTMLElement, distance: number) {
  el.scrollTop = getScrollableContainerHeight(el) - distance
}

function getScrollDistanceFromBottom(el: HTMLElement): number {
  return getScrollableContainerHeight(el) - el.scrollTop
}

function isScrolledToBottom(el: HTMLElement, opts: { treshold?: number } = {}) {
  const treshold = opts.treshold || 0
  return el.scrollTop >= getScrollableContainerHeight(el) - treshold
}

function getScrollableContainerHeight(el: HTMLElement) {
  return el.scrollHeight - el.offsetHeight
}

export default ChatWidget

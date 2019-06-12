import './style'
import * as React from 'react'
import { useReducer, useMemo } from 'react'
import { useAsyncEffect } from 'use-async-effect'
import UiSelect from '~/components/UiSelect'
import StandardImageAspectRatio from '~/components/StandardImageAspectRatio'
import getFormattedDurationWithoutSeconds from '~/utils/date/getFormattedDurationWithoutSeconds'
import axios from '~/lib/axios'

interface Props {
  show: AppShow | null
  initialSelectedGroupId?: number
  onFetch?: (groups: AppShowGroup[]) => void
  onEpisodeClick: (video: AppShowVideo) => void
}

interface State {
  groups: AppShowGroup[]
  selectedGroupId: AppId
  isLoading: boolean
}

type Action =
  | ReducerAction<'request:init'>
  | ReducerAction<'request:success', { groups: AppShowGroup[] }>
  | ReducerAction<'request:error'>
  | ReducerAction<'modal:close'>
  | ReducerAction<'group:change', { id: AppId }>

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'request:init': {
      return {
        ...state,
        groups: [],
        isLoading: true
      }
    }

    case 'request:success': {
      return {
        ...state,
        groups: action.payload.groups,
        selectedGroupId: state.selectedGroupId === -1
          // If no selectedGroupId was provided, we'll apply the first season if it exists.
          ? (action.payload.groups.length ? action.payload.groups[0].id : -1)
          : state.selectedGroupId,
        isLoading: false
      }
    }

    // @TODO
    case 'request:error': {
      return {
        ...state,
        isLoading: false
      }
    }

    case 'modal:close': {
      return {
        ...state,
        groups: [],
        selectedGroupId: -1
      }
    }

    case 'group:change': {
      return {
        ...state,
        selectedGroupId: action.payload.id
      }
    }
  }
}

/**
 * @TODO Add group loader
 * @TODO For series with no shows, we'll show an empty placeholder.
 * @TODO Create party loader
 */
function ShowModal(props: Props) {
  const [state, dispatch] = useReducer(reducer, {
    groups: [],
    isLoading: false,
    selectedGroupId: props.initialSelectedGroupId || -1
  })

  const group = useMemo(() => {
    return state.groups.find(group => group.id === state.selectedGroupId)
  }, [state.selectedGroupId])

  useAsyncEffect(
    async () => {
      if (props.show == null || props.show.title_type === 'movie') {
        return
      }

      dispatch({
        type: 'request:init'
      })

      const [err, res] = await axios.get(`api/shows/${props.show.id}/groups`)

      if (err != null) {
        return dispatch({
          type: 'request:error'
        })
      }

      dispatch({
        type: 'request:success',
        payload: { groups: res.data }
      })

      props.onFetch && props.onFetch(res.data)
    },
    null,
    [props.show]
  )

  function handleGroupChange(evt: React.FormEvent<HTMLSelectElement>) {
    dispatch({
      type: 'group:change',
      payload: { id: Number(evt.currentTarget.value) }
    })
  }

  if (props.show.title_type === 'movie' || state.isLoading || !state.groups.length) {
    return null
  }

  return (
    <React.Fragment>
      <div className="c-season-selection-select">
        <UiSelect value={state.selectedGroupId} onChange={handleGroupChange}>
          {state.groups.map(group => (
            <option value={group.id} key={group.id}>
              {group.title}
            </option>
          ))}
        </UiSelect>
      </div>

      <section>
        {group.videos.map(video => (
          <button type="button" className="c-season-selection-episode" key={video.id} onClick={() => props.onEpisodeClick(video)}>
            <div className="thumbnail">
              <StandardImageAspectRatio src={props.show.preview_image} />
            </div>

            <div className="info">
              <div className="meta">
                <h5 className="ui-subheading is-compact">{getFormattedDurationWithoutSeconds(video.duration)}</h5>
              </div>

              <h3 className="title">{video.title}</h3>
            </div>

            <span className="play">
              <i className="fa fa-play" />
            </span>
          </button>
        ))}
      </section>
    </React.Fragment>
  )
}

export default ShowModal
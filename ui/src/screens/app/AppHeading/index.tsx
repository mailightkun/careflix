import './style'

import * as React from 'react'
import UiAvatar from '~/components/UiAvatar'
import UiNavigation from '~/components/UiNavigation'

import useReactRouter from 'use-react-router'
import { useAuth } from '~/contexts/Auth'
import GatewayDestWithFallback from '~/components/GatewayDestWithFallback'
import constants from '../constants'

function AppHeading() {
  const auth = useAuth()

  const route = useReactRouter()

  if (route.location.pathname.includes('watch')) {
    return null
  }

  return (
    <UiNavigation>
      <GatewayDestWithFallback name={constants.gateway.backUrl} fallback={<UiNavigation.Action />} />

      <GatewayDestWithFallback name={constants.gateway.title} fallback={<UiNavigation.Logo />} />

      <UiNavigation.Action to="/settings">
        <UiAvatar user={auth.data} />
      </UiNavigation.Action>
    </UiNavigation>
  )
}

export default AppHeading

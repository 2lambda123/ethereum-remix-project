/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { Fragment, ReactNode, useEffect, useState } from 'react'
import { FormStateProps, PluginManagerComponent } from '../../types'
import PermisssionsSettings from './permissions/permissionsSettings'
import { Profile } from '@remixproject/plugin-utils'
import LocalPluginForm from './LocalPluginForm'

interface RootViewProps {
  pluginComponent: PluginManagerComponent
  children: ReactNode
}

export interface pluginDeactivated {
  flag: boolean
  profile: Profile
}

export interface pluginActivated {
  flag: boolean
  profile: Profile
}

function RootView ({ pluginComponent, children }: RootViewProps) {
  /**
   * Component Local State declaration
   */
  const [visible, setVisible] = useState<boolean>(true)
  const [filterPlugins, setFilterPlugin] = useState<string>('')

  /**
   * Modal Visibility States
   */
  const openModal = () => {
    setVisible(false)
  }
  const closeModal = () => setVisible(true)

  useEffect(() => {
    pluginComponent.getAndFilterPlugins(filterPlugins)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPlugins])

  return (
    <Fragment>
      <div id="pluginManager" data-id="pluginManagerComponentPluginManager">
        <header className="form-group remixui_pluginSearch plugins-header py-3 px-4 border-bottom" data-id="pluginManagerComponentPluginManagerHeader">
          <input
            type="text"
            onChange={(event) => {
              setFilterPlugin(event.target.value.toLowerCase())
            }}
            value={filterPlugins}
            className="form-control"
            placeholder="Search"
            data-id="pluginManagerComponentSearchInput"
          />
          <button onClick={openModal} className="remixui_pluginSearchButton btn bg-transparent text-dark border-0 mt-2 text-underline" data-id="pluginManagerComponentPluginSearchButton">
            Connect to a Local Plugin
          </button>
        </header>
        {children}
        <PermisssionsSettings pluginSettings={pluginComponent.pluginSettings}/>
      </div>
      <LocalPluginForm
        closeModal={closeModal}
        visible={visible}
        pluginManager={pluginComponent}
      />
    </Fragment>
  )
}

export default RootView

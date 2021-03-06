import { Menu } from 'semantic-ui-react'
import { NavLink } from 'react-router-dom'
import React from 'react'

const Tabs = () => {
  return (
    <Menu as="nav" className="PD-Container-Tabs" size="large" pointing secondary>
      <Menu.Item as={NavLink} name="Cluster" to="/cluster" activeClassName="active" />
      <Menu.Item as={NavLink} name="Stores" to="/stores" activeClassName="active" />
      <Menu.Item as={NavLink} name="Regions" to="/regions" activeClassName="active" />
      <Menu.Item as={NavLink} name="KeyVis" to="/keyvis" activeClassName="active" />
    </Menu>
  )
}

export default Tabs

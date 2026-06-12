import React, { useState } from 'react'
import { tabs } from './constants.js'
import { useAboutPane } from './hooks/useAboutPane.js'
import { useActionsPane } from './hooks/useActionsPane.js'
import { useAiPane } from './hooks/useAiPane.js'
import { useCatalogPane } from './hooks/useCatalogPane.js'
import { usePetSettingsPane } from './hooks/usePetSettingsPane.js'
import { usePluginsPane } from './hooks/usePluginsPane.js'
import { useServicePane } from './hooks/useServicePane.js'
import { AboutPane } from './panes/AboutPane.jsx'
import { ActionsPane } from './panes/ActionsPane.jsx'
import { AiPane } from './panes/AiPane.jsx'
import { CatalogPane } from './panes/CatalogPane.jsx'
import { PetPane } from './panes/PetPane.jsx'
import { PluginsPane } from './panes/PluginsPane.jsx'
import { ServicePane } from './panes/ServicePane.jsx'

export function App() {
  const [activeTab, setActiveTab] = useState('pet')
  const pet = usePetSettingsPane()
  const actions = useActionsPane()
  const ai = useAiPane()
  const plugins = usePluginsPane()
  const catalog = useCatalogPane()
  const service = useServicePane()
  const about = useAboutPane()
  const loading = pet.loading || actions.loading || ai.loading || plugins.loading || catalog.loading || service.loading || about.loading

  let page = <AboutPane {...about.paneProps} />
  if (activeTab === 'pet') page = <PetPane {...pet.paneProps} />
  if (activeTab === 'actions') page = <ActionsPane {...actions.paneProps} />
  if (activeTab === 'ai') page = <AiPane {...ai.paneProps} />
  if (activeTab === 'plugins') page = <PluginsPane {...plugins.paneProps} />
  if (activeTab === 'catalog') page = <CatalogPane {...catalog.paneProps} />
  if (activeTab === 'service') page = <ServicePane {...service.paneProps} />

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>OpenPet</strong>
          <span>Control Center</span>
        </div>
        <nav className="nav" aria-label="Control Center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="content">
        {loading ? <div className="loading">加载中</div> : page}
      </div>
    </main>
  )
}

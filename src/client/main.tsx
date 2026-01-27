import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import 'antd-mobile/es/global' // Ant Design Mobile Global Styles
import './theme.css' // Custom Theme Overrides

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

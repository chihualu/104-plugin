import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installAuthInterceptor } from './auth'
import 'antd-mobile/es/global' // Ant Design Mobile Global Styles
import './theme.css' // Custom Theme Overrides

// Install the Authorization: Bearer interceptor before any request fires
installAuthInterceptor()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

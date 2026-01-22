import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import 'antd-mobile/es/global' // Ant Design Mobile Global Styles

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

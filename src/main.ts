import { createSSRApp } from 'vue'
import App from './App.vue'
import { requestInterceptor } from './http/interceptor'
import { routeInterceptor } from './router/interceptor'

import store from './store'
import { setupPwa } from './utils/pwa'
import { shareMixin } from './utils/share'
import '@/style/index.scss'
import 'virtual:uno.css'

export function createApp() {
  const app = createSSRApp(App)
  app.use(store)
  app.use(routeInterceptor)
  app.use(requestInterceptor)
  // #ifdef MP-WEIXIN
  app.mixin(shareMixin)
  // #endif
  // #ifdef H5
  setupPwa()
  // #endif

  return {
    app,
  }
}

export default defineNuxtConfig({
  nitro: {
    preset: 'vercel',
  },
  modules: [
    '@invictus.codes/nuxt-vuetify'
  ],
  vuetify: {
    /* vuetify options */
    vuetifyOptions: {
      // @TODO: list all vuetify options
    },

    moduleOptions: {
      /* nuxt-vuetify module options */
      // treeshaking: true | false,
      // useIconCDN: true | false,

      /* vite-plugin-vuetify options */
      // styles: true | 'none' | 'expose' | 'sass' | { configFile: string },
      // autoImport: true | false,
    }
  },
  routeRules: {
    '/**': {cors: true}
  },
  runtimeConfig: {
    public: {
      defaultServices: JSON.parse(process.env.DEFAULT_SERVICES || ''),
      baseServiceDomain: process.env.BASE_SERVICE_DOMAIN
    }
  }
});

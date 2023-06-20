<template>
  <v-container fluid="">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="3">
        <v-form @submit="authenticate">
          <v-text-field name="site" label="Site" v-model="site" />
          <v-text-field name="clientId" label="Client ID" type="password" v-model="clientId" />
          <v-row justify="end">
            <v-col cols="auto">
              <v-btn type="submit">Authenticate</v-btn>
            </v-col>
          </v-row>
        </v-form>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
export default {
  name: "AuthorizeForm",
  data() {
    const route = useRoute()

    return {
      site: route.query.set_site,
      clientId: route.query.set_client_id,
    }
  },
  methods: {
    authenticate (e) {
      e.preventDefault()
      // Create a URL object from the current URL
      const location = new URL(window.location.href);

      const newRedirectUri = `${location.protocol}//${location.host}/api/v1/redirect`

      // Get the original redirect_uri and state from the query string
      const originalRedirectUri = location.searchParams.get('redirect_uri');
      const originalState = location.searchParams.get('state');

      // Construct the new state object
      const newState = {
        redirectUri: originalRedirectUri,
        state: originalState,
        replacementRedirectUri: newRedirectUri,
        clientId: this.clientId,
        site: this.site
      };

      // Encode the state object as a JSON string
      const encodedState = encodeURIComponent(JSON.stringify(newState));

      // Add or replace the state parameter redirect_uri, and client_id
      location.searchParams.set('state', encodedState);
      location.searchParams.set('redirect_uri', newRedirectUri)
      location.searchParams.set('client_id', this.clientId)

      location.searchParams.delete('set_site')
      location.searchParams.delete('set_client_id')

      const siteUrl = new URL(this.site)
      window.location.href = `${siteUrl.protocol}//www.${siteUrl.host}/api/v1/authorize${location.search}`
    }
  }
};
</script>

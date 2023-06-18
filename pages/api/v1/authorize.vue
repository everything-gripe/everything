<template>
  <v-container fluid="">
    <v-row justify="center">
      <v-col cols="12" sm="8" md="3">
        <v-form ref="authorizeForm" @submit="authenticate">
          <v-text-field name="site" label="Site" />
          <v-text-field name="clientId" label="Client ID" type="password" />
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
  methods: {
    authenticate (e) {
      e.preventDefault()
      // Create a URL object from the current URL
      const location = new URL(window.location.href);

      // Get the original redirect_uri and state from the query string
      const originalRedirectUri = location.searchParams.get('redirect_uri');
      const originalState = location.searchParams.get('state');

      // Construct the new state object
      const newState = {
        redirectUri: originalRedirectUri,
        state: originalState
      };

      // Encode the state object as a JSON string
      const encodedState = encodeURIComponent(JSON.stringify(newState));

      // Add or replace the state parameter
      const newRedirectUriValue = `${location.protocol}//${location.host}/api/v1/redirect`

      // Add or replace the state parameter redirect_uri, and client_id
      location.searchParams.set('state', encodedState);
      location.searchParams.set('redirect_uri', newRedirectUriValue)
      location.searchParams.set('client_id', this.$refs.authorizeForm.clientId.value)

      window.location.href = `${this.$refs.authorizeForm.site.value}${location.pathname}${location.search}`
    }
  }
};
</script>

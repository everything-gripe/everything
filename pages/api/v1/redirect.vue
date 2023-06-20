<template>

</template>

<script>
export default {
  name: "Redirect",
  mounted() {
    const search = new URLSearchParams(window.location.search || window.location.hash.substring(1));

    // Get the original state, redirect_uri and others from the query string
    const encodedState = search.get('state');
    const accessToken = search.get('access_token');
    const code = search.get('code');
    const decodedState = JSON.parse(decodeURIComponent(encodedState));
    const { redirectUri: originalRedirectUri, state: originalState, ...modifiedResponse } = decodedState;

    // Add or update additional parameters in the modified redirect_uri
    search.set('state', originalState);

    if (accessToken) {
      modifiedResponse.accessToken = accessToken;
      const encodedModifiedResponse = encodeURIComponent(JSON.stringify(modifiedResponse));
      search.set('access_token', encodedModifiedResponse);
    } else if (code) {
      modifiedResponse.code = code;
      const encodedModifiedResponse = encodeURIComponent(JSON.stringify(modifiedResponse));
      search.set('code', encodedModifiedResponse);
    }

    // Construct the modified redirect_uri with the modified query parameters
    const modifiedRedirectUri = new URL(originalRedirectUri);
    modifiedRedirectUri.search = search.toString();
    modifiedRedirectUri.hash = search.toString();

    // Redirect to the modified redirect_uri
    window.location.href = modifiedRedirectUri.href;
  }
}
</script>

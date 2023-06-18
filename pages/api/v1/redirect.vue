<template>

</template>

<script>
export default {
  name: "Redirect",
  mounted() {
    const search = new URLSearchParams(window.location.hash.substring(1))

    // Get the original state and redirect_uri from the query string
    const encodedState = search.get('state');
    const decodedState = JSON.parse(decodeURIComponent(encodedState));
    const originalRedirectUri = decodedState.redirectUri;
    const originalState = decodedState.state;

    // Construct the modified redirect_uri with the modified query parameters
    const modifiedRedirectUri = new URL(originalRedirectUri);
    modifiedRedirectUri.hash = search.toString();

    // Add or update additional parameters in the modified redirect_uri
    modifiedRedirectUri.searchParams.set('state', originalState);

    // Redirect to the modified redirect_uri
    window.location.href = modifiedRedirectUri.href;
  }
}
</script>

export default defineEventHandler((event) => {
    const requestUrl = new URL(getRequestURL(event))
    const requestPath = requestUrl.pathname

    if (requestPath.endsWith('/authorize') ||
        requestPath.endsWith('/redirect') ||
        requestPath.endsWith('/access_token')) return

    const authorizationHeader = getHeader(event, 'authorization')
    if (!authorizationHeader) return

    const [authorizationType, encoded] = authorizationHeader.split(' ')
    const {
        site,
        clientId,
        accessToken
    } = JSON.parse(decodeURIComponent(encoded))

    const subdomain = requestUrl.host.startsWith('oauth') ? 'oauth' : 'www'
    const siteUrl = new URL(site)
    const url = new URL(`${siteUrl.protocol}//${subdomain}.${siteUrl.host}${event.node.req.url}`)
    url.searchParams.set("client_id", clientId)

    return proxyRequest(event, url.toString(), {
        headers: {
            authorization: `${authorizationType} ${accessToken}`
        }
    })
})

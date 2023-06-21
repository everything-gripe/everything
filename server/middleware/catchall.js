const siteRegex = /^(.*):(.*$)/

export default defineEventHandler(async (event) => {
    const requestUrl = new URL(getRequestURL(event))
    const requestSearch = requestUrl.search
    const requestPath = requestUrl.pathname

    if (requestPath.endsWith('/authorize') ||
        requestPath.endsWith('/redirect') ||
        requestPath.endsWith('/access_token')) return

    let pathSegments = requestPath.split('/')
    let pathSite
    pathSegments = pathSegments.map(segment => segment.replace(siteRegex, (substring, ...args) => {
        pathSite ||= args[0]
        return args[1] || substring
    }))
    if (pathSite && !pathSite.startsWith('http')) {
        pathSite = `https://${pathSite}`
    }

    const authHeader = getHeader(event, 'Authorization')
    const htmlAcceptHeader = getHeader(event, 'Accept')?.toLowerCase().includes('text/html')

    if (!authHeader && !pathSite) return

    if (authHeader) {
        var [authType, encoded] = authHeader.split(' ')
        var {
            site: authSite,
            clientId,
            accessToken
        } = JSON.parse(decodeURIComponent(encoded))
    }

    const siteUrl = new URL(pathSite || authSite)

    const subdomain = siteUrl.host.split('.').length < 3
        ? requestUrl.host.startsWith('oauth')
            ? 'oauth.'
            : 'www.'
        :''

    const url = new URL(`${siteUrl.protocol}//${subdomain}${siteUrl.host}${pathSegments.join('/')}${requestSearch}`)
    if (clientId) {
        url.searchParams.set("client_id", clientId)
    }

    if (htmlAcceptHeader) {
        return sendRedirect(event, url.toString())
    } else {
        return await proxyRequest(event, url.toString(), {
            headers: authHeader ? {
                authorization: `${authType} ${accessToken}`
            } : undefined,
            fetch: async (target, init) => {
                const proxyResponse = await fetch(target, init)
                const {status, statusText, headers, ...rest} = proxyResponse;

                let body = await proxyResponse.text();
                const regex = RegExp(`((https?:\\/\\/)?([a-z0-9-]+\\.)*${escapeRegex(siteUrl.host)})/?`, 'gm')
                body = body
                    .replaceAll(regex, (substring, ...args) => `${requestUrl.protocol}//${requestUrl.host}/${args[0].replace('https://', '')}:`)
                    .replaceAll(/(?<=[\s"])((\/?[ru]|user)\/)/gm, `$1${siteUrl.host}:`)
                    .replaceAll(RegExp(`("(?:display_name|subreddit|author)":\\s*")(.*?",?)`, 'gm'), `$1${siteUrl.host}:$2`)

                proxyResponse._data = body
                return proxyResponse
            }
        })
    }
})

const regexEscapeRegex = /[/\-\\^$*+?.()|[\]{}]/g
const escapeRegex = string => string.replace(regexEscapeRegex, '\\$&');

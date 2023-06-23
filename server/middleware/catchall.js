import {constructSiteUrl, replaceOauthSubdomain} from "~/utils";

const siteRegex = /^(.*):(.*$)/

export default defineEventHandler(async (event) => {
    const requestUrl = new URL(getRequestURL(event))
    const requestPath = requestUrl.pathname
    const requestPathSegments = requestPath.split("/")
    const requestLastPath = requestPathSegments[requestPathSegments.length - 1]
    const requestHostname = requestUrl.hostname
    const requestDomainSegments = requestHostname.split('.')

    if (requestLastPath.startsWith('authorize') ||
        requestLastPath.startsWith('redirect') ||
        requestLastPath.startsWith('refresh') ||
        requestLastPath.startsWith('access_token')) return

    let pathSegments = requestPath.split('/')
    let pathSite
    pathSegments = pathSegments.map(segment => segment.replace(siteRegex, (substring, ...args) => {
        pathSite ||= args[0]
        return args[1]
    })).filter(segment => segment)
    if (pathSite) {
        if (!pathSite.startsWith('http')) {
            pathSite = `https://${pathSite}`
        }
        if (!pathSite.includes('.') && !pathSite.includes('localhost')) {
            const pathSiteUrl = new URL(pathSite)
            pathSiteUrl.hostname += '.z.gripe'
            pathSite = pathSiteUrl.toString()
        }
    }

    const authHeader = getHeader(event, 'Authorization')
    const htmlAcceptHeader = getHeader(event, 'Accept')?.toLowerCase().includes('text/html')

    if (!authHeader && !pathSite) return

    if (authHeader) {
        try {
            var [authType, encoded] = authHeader.split(' ')
            var {
                ignore,
                site: authSite,
                clientId,
                accessToken
            } = JSON.parse(decodeURIComponent(encoded))
        } catch (e) {
            authType = encoded = null
            console.debug(e)
        }
    }

    const hasAuth = authHeader && !ignore;

    const siteUrl = new URL(pathSite || authSite)
    const url = constructSiteUrl(siteUrl, requestUrl, {
        path: `/${pathSegments.join('/')}`,
        replaceOauthSubdomain: !hasAuth
    });
    if (clientId) {
        url.searchParams.set("client_id", clientId)
    }

    if (htmlAcceptHeader) {
        return sendRedirect(event, url.toString())
    } else {
        return await proxyRequest(event, url.toString(), {
            headers: {
                //IMPORTANT: These are case-sensitive
                authorization: hasAuth ? `${authType} ${accessToken}` : undefined,
                'user-agent': 'everything:0.0.1'
            },
            fetch: async (target, init) => {
                const proxyResponse = await fetch(target, init)
                const {status, statusText, headers, ...rest} = proxyResponse;

                let body = await proxyResponse.text();
                const regex = RegExp(`((https?:\\/\\/)?([a-z0-9-]+\\.)*${escapeRegex(siteUrl.host)})/?`, 'gm')
                body = body
                    .replaceAll(regex, (substring, ...args) => `${requestUrl.protocol}//${replaceOauthSubdomain(requestDomainSegments).join('.')}/${siteUrl.host}:`)
                    .replaceAll(/(?<=[\s"])((\/?[ru]|user)\/)/gm, `$1${siteUrl.host}:`)
                    .replaceAll(RegExp(`("(?:display_name|subreddit|author)":\\s*")(.*?",?)`, 'gm'), `$1${siteUrl.host}:$2`)
                    // .replaceAll('preview.redd.it/', `images.${requestDomainSegments.slice(requestDomainSegments.length - 2).join('.')}/preview.redd.it:`)

                proxyResponse._data = body
                return proxyResponse
            }
        })
    }
})

const regexEscapeRegex = /[/\-\\^$*+?.()|[\]{}]/g
const escapeRegex = string => string.replace(regexEscapeRegex, '\\$&');

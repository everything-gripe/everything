import {addZDomain, constructSiteUrl, replaceOauthSubdomain} from "~/utils";
import {Everything, Kind} from "everything-sdk";

const siteRegex = /([a-zA-Z0-9.-:]+):([a-zA-Z0-9.-~]*)/g

async function redirectOrProxy(event, requestUrl, {pathSite, pathSegments}, hasAuth, authSite, authType, accessToken, clientId, htmlAcceptHeader) {
    const requestHostname = requestUrl.hostname
    const requestDomainSegments = requestHostname.split('.')
    const siteUrl = new URL((pathSite || authSite).replace('.z.gripe', ''))
    const url = constructSiteUrl(siteUrl, requestUrl, {
        path: pathSegments.join('/'),
        replaceOauthSubdomain: !hasAuth
    });
    if (clientId) {
        url.searchParams.set("client_id", clientId)
    }

    if (htmlAcceptHeader) {
        return sendRedirect(event, url.toString())
    } else {
        console.log(url.toString())
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
                // const regex = RegExp(`((https?:\\/\\/)?([a-z0-9-]+\\.)*${escapeRegex(siteUrl.host)})/?`, 'gm')
                const regex = RegExp(`(?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)*${escapeRegex(addZDomain(siteUrl.hostname.split('.')).join('.'))}((?:\\/[ru]|user)\\/)`, 'gm')
                body = body
                    // .replaceAll(regex, (substring, ...args) => `${requestUrl.protocol}//${replaceOauthSubdomain(requestDomainSegments).join('.')}/${siteUrl.host}:`)
                    .replaceAll(regex, (substring, ...args) => `${requestUrl.protocol}//${replaceOauthSubdomain(requestDomainSegments).join('.')}${args[0]}${siteUrl.host}:`)
                    .replaceAll(/(?<=[\s"])((\/?[ru]|user)\/)/gm, `$1${siteUrl.host}:`)
                    .replaceAll(RegExp(`("(?:display_name|subreddit|author)":\\s*")(.*?",?)`, 'gm'), `$1${siteUrl.host}:$2`)
                // .replaceAll('preview.redd.it/', `images.${requestDomainSegments.slice(requestDomainSegments.length - 2).join('.')}/preview.redd.it:`)

                proxyResponse._data = body
                return proxyResponse
            }
        })
    }
}

export default defineEventHandler(async (event) => {
    const requestUrl = new URL(getRequestURL(event))
    const requestPath = requestUrl.pathname
    const requestPathSegments = requestPath.split("/")
    const requestLastPath = requestPathSegments[requestPathSegments.length - 1]

    if (requestLastPath.startsWith('authorize') ||
        requestLastPath.startsWith('redirect') ||
        requestLastPath.startsWith('refresh') ||
        requestLastPath.startsWith('access_token')) return

    let pathSegments = requestPath.split('/')

    const pathSiteSegments = pathSegments.reduce((pathSites, segment, currentIndex, segments) => {
        if (!pathSites.length) {
            const matches = segment.matchAll(siteRegex)
            for (const match of matches) {
                const [, pathSite, segment] = match
                pathSites.push({
                    pathSite: pathSite.startsWith('http') ? pathSite : `https://${pathSite}`,
                    pathSegments: segment ? [...segments.slice(0, currentIndex), segment] : segments.slice(0, currentIndex)
                })
            }
        } else {
            for (const pathSite of pathSites) {
                pathSite.pathSegments.push(segment)
            }
        }

        return pathSites
    }, [])

    const authHeader = getHeader(event, 'Authorization')
    const htmlAcceptHeader = getHeader(event, 'Accept')?.toLowerCase().includes('text/html')

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

    if (!hasAuth && !pathSiteSegments.length) return

    if (pathSiteSegments.length === 1 || htmlAcceptHeader) {
        return await redirectOrProxy(event, requestUrl, pathSiteSegments[0], hasAuth, authSite, authType, clientId, accessToken, htmlAcceptHeader);
    } else {
        const responses = await Promise.all(pathSiteSegments.map(async ({pathSite, pathSegments}) => {
            const response =
                JSON.parse(await redirectOrProxy(event, requestUrl, {pathSite, pathSegments}, hasAuth, authSite, authType, clientId, accessToken, htmlAcceptHeader))

            return {
                response,
                pathSite: new URL(pathSite).host
            }
        }))

        switch (responses[0].response.kind) {
            case Kind.List:
                const interspersed = [...intersperse(...responses.map(({response}) => response.data.children))]
                const after = combineWithPathSite(responses, data => data.after)
                const before = combineWithPathSite(responses, data => data.before)
                const dist = interspersed.length

                return Everything.list({
                    before,
                    after,
                    dist,
                    children: interspersed
                })
            case Kind.Group:
                return Everything.group({
                    name: combine(responses, data => data.name),
                    display_name: combine(responses, data => data.display_name),
                    display_name_prefixed: combine(responses, data => data.display_name),
                })
        }
    }
})


function* intersperse(...arrays) {
    const maxLength = arrays.reduce((maxLength, currentArray) => Math.max(maxLength, currentArray.length), 0)
    for (let i = 0; i < maxLength; i++) {
        for (const array of arrays) {
            const item = array[i]
            if (!item) continue

            yield item
        }
    }
}


function combineWithPathSite(responses, func) {
    return responses.map(({response, pathSite}) => `${pathSite}:${func(response.data) ?? ''}`).join('+');
}

function combine(responses, func) {
    return responses.map(({response}) => func(response.data)).filter(value => value).join('+');
}

const regexEscapeRegex = /[/\-\\^$*+?.()|[\]{}]/g
const escapeRegex = string => string.replace(regexEscapeRegex, '\\$&');

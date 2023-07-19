import {addZDomain, constructSiteUrl, replaceOauthSubdomain} from "~/utils";
import {Everything, Kind} from "everything-sdk";

const runtimeConfig = useRuntimeConfig()
const siteRegex = /^([a-zA-Z0-9.-:]+):(.*?)$/
const searchParams = ['before', 'after', 'query']

async function redirectOrProxy(event, requestUrl, {pathSite, pathSegments, searchParams}, hasAuth, authSite, authType, accessToken, clientId, htmlAcceptHeader) {
    const requestHostname = requestUrl.hostname
    const requestDomainSegments = requestHostname.split('.')
    const siteUrl = new URL((pathSite || authSite)  /*using .replace here causes the returned display name to be different than the entered one, causing potential issues. (Infinity will go into an infinite request loop) .replace(runtimeConfig.public.baseServiceDomain, '')*/)
    const search = searchParams
        ? new URLSearchParams({
            ...Object.fromEntries(requestUrl.searchParams),
            ...searchParams
        })
        : undefined

    const url = constructSiteUrl(siteUrl, requestUrl, {
        path: pathSegments.join('/'),
        search: search,
        replaceOauthSubdomain: !hasAuth,
        addJsonToPath: !hasAuth && !htmlAcceptHeader
    });

    if (clientId) {
        url.searchParams.set("client_id", clientId)
    }
    if (htmlAcceptHeader) {
        return sendRedirect(event, url.toString())
    } else {
        const response = await proxyRequest(event, url.toString(), {
            headers: {
                //IMPORTANT: These are case-sensitive
                authorization: hasAuth ? `${authType} ${accessToken}` : undefined,
                'user-agent': 'everything:0.0.1'
            },
            onResponse: async (event, proxyResponse) => {
                let body = await proxyResponse.text();
                // const regex = RegExp(`((https?:\\/\\/)?([a-z0-9-]+\\.)*${escapeRegex(siteUrl.host)})/?`, 'gm')
                const regex = RegExp(`(?:https?:\\/\\/)?(?:[a-z0-9-]+\\.)*${escapeRegex(addZDomain(siteUrl.hostname.split('.')).join('.'))}((?:\\/[ru]|user|comments)\\/)`, 'gm')
                body = body
                    // .replaceAll(regex, (substring, ...args) => `${requestUrl.protocol}//${replaceOauthSubdomain(requestDomainSegments).join('.')}/${siteUrl.host}:`)
                    .replaceAll(regex, (substring, ...args) => `${requestUrl.protocol}//${replaceOauthSubdomain(requestDomainSegments).join('.')}${args[0]}${siteUrl.host}:`)
                    .replaceAll(/(?<=[\s"])((\/?[ru]|user|comments)\/)/gm, `$1${siteUrl.host}:`)
                    .replaceAll(RegExp(`("(?:display_name|subreddit|author)":\\s*")(.*?",?)`, 'gm'), `$1${siteUrl.host}:$2`)
                // .replaceAll(RegExp(`("(?:display_name|subreddit|author|id)":\\s*")(.*?",?)`, 'gm'), `$1${siteUrl.host}:$2`)
                // .replaceAll('preview.redd.it/', `images.${requestDomainSegments.slice(requestDomainSegments.length - 2).join('.')}/preview.redd.it:`)

                proxyResponse._data = body
            }
        });
        return response
    }
}

function matchSegment(segment)
{
    if (!segment) return

    const results = []
    const decodedSegment = decodeURIComponent(segment)

    // const potentialMatches = decodedSegment.split('+')
    const potentialMatches = decodedSegment.split(/[+ ]/)
    for (const potentialMatch of potentialMatches) {
        const match = potentialMatch.match(siteRegex)
        if (match) {
            const [, pathSite, value] = match
            results.push({pathSite, value})
        }

    }
    return results.length ? results : undefined
}


const pathSiteHttp = pathSite => pathSite.startsWith('http') ? pathSite : `https://${pathSite}`;

function processSegments(requestSearch, pathSites, segment, currentIndex, segments) {
    const pushResults = results =>
        pathSites.push(...results.map(result => ({
            pathSite: pathSiteHttp(result.pathSite),
            pathSegments: result.value ? [...segments.slice(0, currentIndex), result.value] : segments.slice(0, currentIndex),
            searchParams: result.values
        })));

    if (!pathSites.length) {
        const searchParamResults = searchParams
            .map(searchParam => ({searchParam, result: matchSegment(requestSearch.get(searchParam))}))
            .filter(searchParamResult => searchParamResult.result)

        if (searchParamResults.length) {
            const results = searchParamResults.reduce((finalResults, searchParamResult) => {
                for (const result of searchParamResult.result) {
                    let currentResult = finalResults.find(finalResult => finalResult.pathSite === result.pathSite)
                    if (!currentResult) {
                        currentResult = {pathSite: result.pathSite, values: {}}
                        finalResults.push(currentResult)
                    }

                    currentResult.values[searchParamResult.searchParam] = result.value
                }

                return finalResults
            }, [])

            pushResults(results);
        }
    }

    const results = matchSegment(segment)
    if (results) {
        if (!pathSites.length) {
            pushResults(results)
        } else {
            for (const result of results) {
                const pathSite = pathSites.find(pathSite => pathSite.pathSite === pathSiteHttp(result.pathSite))
                pathSite.pathSegments.push(result.value)
            }
        }
    } else {
        for (const pathSite of pathSites) {
            pathSite.pathSegments.push(segment)
        }
    }

    return pathSites
}

function combineResponses(successfulResponses, requestPathSegments) {
    switch (successfulResponses[0].response.kind) {
        case Kind.List:
            const interspersed = [...intersperse(...successfulResponses.map(({response}) => response.data.children))]
            const after = combineWithPathSite(successfulResponses, data => data.after)
            const before = combineWithPathSite(successfulResponses, data => data.before)
            const dist = interspersed.length

            return Everything.list({
                before,
                after,
                dist,
                children: interspersed
            })
        case Kind.User: {
            const displayName = requestPathSegments[2]

            return Everything.user({
                name: displayName,
                subreddit: {
                    name: combine(successfulResponses, data => data.subreddit.name),
                    display_name: `u_${displayName}`,
                    display_name_prefixed: `u/${displayName}`,
                    subreddit_type: `user`,
                    url: `/user/${displayName}`
                }
            })
        }

        case Kind.Group: {
            const displayName = requestPathSegments[2]

            return Everything.group({
                name: combine(successfulResponses, data => data.name),
                display_name: displayName,
                display_name_prefixed: `r/${displayName}`,
            })
        }
        case Kind.Post:
        case Kind.Comment:
            if (successfulResponses.length === 1) {
                return successfulResponses[0].response
            } else {
                return
            }
        default:
            if (Array.isArray(successfulResponses[0].response)) {

                return successfulResponses[0].response.map((_, index) => combineResponses(successfulResponses.map(({pathSite, response}) => ({pathSite, response: response[index]})), requestPathSegments))
            }
    }
}

export default defineEventHandler(async (event) => {
    const requestUrl = new URL(getRequestURL(event))
    const requestPath = requestUrl.pathname
    const requestPathSegments = requestPath.split("/")
    const requestLastPath = requestPathSegments[requestPathSegments.length - 1]
    const requestSearch = requestUrl.searchParams

    if (requestLastPath.startsWith('authorize') ||
        requestLastPath.startsWith('redirect') ||
        requestLastPath.startsWith('refresh') ||
        requestLastPath.startsWith('access_token')) return

    const pathSiteSegments = requestPathSegments.reduce((...args) => processSegments(requestSearch, ...args), [])

    const authHeader = getHeader(event, 'Authorization')
    const htmlAcceptHeader = getHeader(event, 'Accept')?.toLowerCase().includes('text/html')
    if (htmlAcceptHeader) {
        const client = new URL(requestUrl)
        const hostParts = client.hostname.split('.')
        hostParts.splice(-2, 0, 'client')
        client.hostname = hostParts.join('.')
        return sendRedirect(event, client.toString())
    }

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

    const hasAuth = authHeader && authType && !ignore;

    if (!hasAuth && !pathSiteSegments.length) {
        const defaultServices = runtimeConfig.public.defaultServices
        const pathSegments = requestPathSegments
        if (pathSegments[1] === 'r' && ['all', 'popular'].includes(pathSegments[2])) {
            pathSegments.splice(1, 2)
        }
        for (const service of defaultServices) {
            pathSiteSegments.push({
                pathSite: pathSiteHttp(service),
                pathSegments: pathSegments
            })
        }
    }

    if (pathSiteSegments.length <= 1 || htmlAcceptHeader) {
        const siteSegments = pathSiteSegments.length ? pathSiteSegments[0] : {pathSegments: requestPathSegments};
        return await redirectOrProxy(event, requestUrl, siteSegments, hasAuth, authSite, authType, accessToken, clientId, htmlAcceptHeader);
    } else {
        const responses = await Promise.allSettled(pathSiteSegments.map(async siteSegments => {
            const response =
                JSON.parse(await redirectOrProxy(event, requestUrl, siteSegments, hasAuth, authSite, authType, accessToken, clientId, htmlAcceptHeader))

            return {
                response,
                pathSite: new URL(siteSegments.pathSite).host
            }
        }))

        event.node.res.statusCode = 200
        event.node.res.statusMessage = undefined

        const successfulResponses = responses.filter(response => response.status === "fulfilled" && !response.value.response.error && !response.value.response.status).map(response => response.value)
        if (!successfulResponses.length) return

        return combineResponses(successfulResponses, requestPathSegments);
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
    if (!responses.filter(({response}) => func(response.data)).length) return

    return responses.map(({response, pathSite}) => `${pathSite}:${func(response.data) ?? ''}`).join('+');
}

function combine(responses, func) {
    return responses.map(({response}) => func(response.data)).filter(value => value).join('+');
}

const regexEscapeRegex = /[/\-\\^$*+?.()|[\]{}]/g
const escapeRegex = string => string.replace(regexEscapeRegex, '\\$&');

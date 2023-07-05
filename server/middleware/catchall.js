import {addZDomain, constructSiteUrl, replaceOauthSubdomain} from "~/utils";
import {Everything, Kind} from "everything-sdk";

const siteRegex = /^([a-zA-Z0-9.-:]+):(.*?)$/
const searchParams = ['before', 'after', 'query']

async function redirectOrProxy(event, requestUrl, {pathSite, pathSegments, searchParams}, hasAuth, authSite, authType, accessToken, clientId, htmlAcceptHeader) {
    const requestHostname = requestUrl.hostname
    const requestDomainSegments = requestHostname.split('.')
    const siteUrl = new URL((pathSite || authSite).replace('.z.gripe', ''))
    const search = searchParams
        ? new URLSearchParams({
            ...Object.fromEntries(requestUrl.searchParams),
            ...searchParams
        })
        : undefined

    const url = constructSiteUrl(siteUrl, requestUrl, {
        path: pathSegments.join('/'),
        search: search,
        replaceOauthSubdomain: !hasAuth
    });

    console.log(searchParams, url)

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
            fetch: async (target, init) => {
                const proxyResponse = await fetch(target, init)
                const {status, statusText, headers, ...rest} = proxyResponse;

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
                return proxyResponse
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
                console.log('pathSites:', pathSites, 'resultPathSite:', pathSiteHttp(result.pathSite))
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

    if (pathSiteSegments.length <= 1 || htmlAcceptHeader) {
        const siteSegments = pathSiteSegments.length ? pathSiteSegments[0] : {pathSegments: requestPathSegments};
        return await redirectOrProxy(event, requestUrl, siteSegments, hasAuth, authSite, authType, accessToken, clientId, htmlAcceptHeader);
    } else {
        const responses = await Promise.all(pathSiteSegments.map(async siteSegments => {
            const response =
                JSON.parse(await redirectOrProxy(event, requestUrl, siteSegments, hasAuth, authSite, authType, accessToken, clientId, htmlAcceptHeader))

            return {
                response,
                pathSite: new URL(siteSegments.pathSite).host
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

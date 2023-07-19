const runtimeConfig = useRuntimeConfig()

export function replaceOauthSubdomain(requestSubdomainSegments) {
    const segments = [...requestSubdomainSegments]
    if (segments[0]?.toLowerCase() === 'oauth') {
        segments[0] = 'www'
    }

    return segments
}

export function addJsonToPath(path) {
    if (!path.endsWith('.json')) {
        path = `${path}.json`
    }

    return path
}

export function addZDomain(requestDomainSegments) {
    const segments = [...requestDomainSegments]

    if (segments.length === 1 && segments[0] !== 'localhost') {
        segments.push(...runtimeConfig.public.baseServiceDomain.split('.'))
    }

    return segments
}

export function constructSiteUrl(siteUrl, requestUrl, {path, search, replaceOauthSubdomain: shouldReplaceOauthSubdomain = false, addJsonToPath: shouldAddJsonToPath = false} = {}) {
    path ||= requestUrl.pathname
    search ||= requestUrl.searchParams

    const requestDomain = requestUrl.hostname
    const requestDomainSegments = requestDomain.split('.')
    let requestSubdomainSegments = requestDomainSegments.slice(0, -2)
    let siteUrlDomainSegments = siteUrl.host.split('.')

    if (shouldReplaceOauthSubdomain) {
        requestSubdomainSegments = replaceOauthSubdomain(requestSubdomainSegments)
    }

    if (shouldAddJsonToPath) {
        path = addJsonToPath(path)
    }

    let requestSubdomain = requestSubdomainSegments.join('.')
    requestSubdomain = requestSubdomain ? `${requestSubdomain}.` : ''

    siteUrlDomainSegments = addZDomain(siteUrlDomainSegments)
    let siteUrlHost = siteUrlDomainSegments.join('.')
    siteUrlHost = siteUrl.port ? `${siteUrlHost}:${siteUrl.port}` : siteUrlHost


    return new URL(`${siteUrl.protocol}//${requestSubdomain}${siteUrlHost}${path}?${search}`);
}

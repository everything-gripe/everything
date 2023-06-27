export function replaceOauthSubdomain(requestSubdomainSegments) {
    const segments = [...requestSubdomainSegments]
    if (segments[0]?.toLowerCase() === 'oauth') {
        segments[0] = 'www'
    }

    return segments
}

export function addZDomain(requestDomainSegments) {
    const segments = [...requestDomainSegments]

    if (segments.length === 1 && segments[0] !== 'localhost') {
        segments.push('z', 'gripe')
    }

    return segments
}

export function constructSiteUrl(siteUrl, requestUrl, {path, replaceOauthSubdomain: shouldReplaceOauthSubdomain = false} = {}) {
    const requestDomain = requestUrl.hostname
    const requestDomainSegments = requestDomain.split('.')
    let requestSubdomainSegments = requestDomainSegments.slice(0, -2)
    const requestSearch = requestUrl.search
    let siteUrlDomainSegments = siteUrl.host.split('.')

    if (shouldReplaceOauthSubdomain) {
        requestSubdomainSegments = replaceOauthSubdomain(requestSubdomainSegments)
    }

    let requestSubdomain = requestSubdomainSegments.join('.')
    requestSubdomain = requestSubdomain ? `${requestSubdomain}.` : ''

    siteUrlDomainSegments = addZDomain(siteUrlDomainSegments)
    let siteUrlHost = siteUrlDomainSegments.join('.')
    siteUrlHost = siteUrl.port ? `${siteUrlHost}:${siteUrl.port}` : siteUrlHost

    path ||= requestUrl.pathname

    return new URL(`${siteUrl.protocol}//${requestSubdomain}${siteUrlHost}${path}${requestSearch}`);
}

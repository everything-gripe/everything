export function replaceOauthSubdomain(requestSubdomainSegments) {
    const segments = [...requestSubdomainSegments]
    if (segments[0]?.toLowerCase() === 'oauth') {
        segments[0] = 'www'
    }

    return segments
}

export function constructSiteUrl(siteUrl, requestUrl, {path, replaceOauthSubdomain: shouldReplaceOauthSubdomain = false} = {}) {
    const requestDomain = requestUrl.hostname
    const requestDomainSegments = requestDomain.split('.')
    let requestSubdomainSegments = requestDomainSegments.slice(0, -2)
    const requestSearch = requestUrl.search

    if (shouldReplaceOauthSubdomain) {
        requestSubdomainSegments = replaceOauthSubdomain(requestSubdomainSegments);
    }

    let requestSubdomain = requestSubdomainSegments.join('.')
    requestSubdomain = requestSubdomain ? `${requestSubdomain}.` : ''

    path ||= requestUrl.pathname

    console.log(`${siteUrl.protocol}//${requestSubdomain}${siteUrl.host}${path}${requestSearch}`)

    return new URL(`${siteUrl.protocol}//${requestSubdomain}${siteUrl.host}${path}${requestSearch}`);
}

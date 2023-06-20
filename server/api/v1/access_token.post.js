export default defineEventHandler(async (event) => {
    const {code: encodedResponse, redirect_uri: redirectUri, ...body} = await readBody(event)
    const {code, clientId, replacementRedirectUri, site} = JSON.parse(decodeURIComponent(encodedResponse));

    const accessTokenBody = new URLSearchParams({
        ...body,
        code,
        redirect_uri: replacementRedirectUri
    })

    const siteUrl = new URL(site)
    const accessTokenUrl = new URL(`${siteUrl.protocol}//www.${siteUrl.host}/api/v1/access_token`)

    const accessTokenResponse = await fetch(accessTokenUrl, {
        method: "POST",
        body: accessTokenBody,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:`).toString('base64')}`
        }
    })

    const {access_token: accessToken, ...rest} = await accessTokenResponse.json()

    const newAccessToken = {
        accessToken,
        site,
        clientId
    }

    rest.access_token = encodeURIComponent(JSON.stringify(newAccessToken))

    return rest;
})

import {constructSiteUrl} from "~/utils";

function clientCredentials(body) {
    const newAccessToken = {
        ignore: true
    }

    return {
        access_token: encodeURIComponent(JSON.stringify(newAccessToken)),
        token_type: 'bearer',
        expires_in: 4117387382,
        scope: body.scope,
    }
}

async function token(requestUrl, encodedResponse, body) {
    const {code, refreshToken, clientId, replacementRedirectUri, site} = JSON.parse(decodeURIComponent(encodedResponse));

    const accessTokenBody = new URLSearchParams({
        ...body,
        refresh_token: refreshToken,
        code,
        redirect_uri: replacementRedirectUri
    })

    const siteUrl = new URL(site)
    const accessTokenUrl = constructSiteUrl(siteUrl, requestUrl)

    console.log(accessTokenUrl)

    const accessTokenResponse = await fetch(accessTokenUrl, {
        method: "POST",
        body: accessTokenBody,
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'authorization': `Basic ${Buffer.from(`${clientId}:`).toString('base64')}`,
            'user-agents': 'everything:0.0.1'
        }
    })

    const {access_token: accessToken, refresh_token: accessTokenRefreshToken, ...rest} = await accessTokenResponse.json()

    const newAccessToken = {
        accessToken,
        site,
        clientId
    }
    rest.access_token = encodeURIComponent(JSON.stringify(newAccessToken))

    if (accessTokenRefreshToken) {
        const newRefreshToken = {
            refreshToken: accessTokenRefreshToken,
            site,
            clientId
        }

        rest.refresh_token = encodeURIComponent(JSON.stringify(newRefreshToken))
    }

    return rest;
}

export default defineEventHandler(async (event) => {
    const requestUrl = new URL(getRequestURL(event))

    const {code: encodedCodeResponse, refresh_token: encodedRefreshResponse, redirect_uri: redirectUri, ...body} = await readBody(event)

    switch (true) {
        case body.grant_type === 'client_credentials':
        case body.grant_type?.endsWith('/grants/installed_client'):
            return clientCredentials(body)
        // case body.grant_type === refr
        case body.grant_type === 'authorization_code':
            return await token(requestUrl, encodedCodeResponse, body)
        case body.grant_type === 'refresh_token':
            return await token(requestUrl, encodedRefreshResponse, body);

    }
})

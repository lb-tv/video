const DEBUG_MODE = true;
const DNS_RESOLVER_URL = "https://dns.google.com/resolve?type=TXT&name=";

var settings = {
    enabled: 1,
    block_id: "<!-- RKN-BLOCK-URANUS-PLS -->", // Часть контента, при отсутствии которого наш воркер будет считать, что страница заблокирована
    redirect_url: "//redir.liveball.pro", // Fallback URL, если не нашли настроек для текущего домена, то куда будем редиректить если enabled: 1
    dns_domains: ["redir.liveball.pro"] // Наши домены, в DNS ТХТ-записях у которых хранятся наши настройки
};

var redirect_params = {
    utm_term: self.location.hostname+'_swredir'
};

function getUrlParams(url, prop) {
    var params = {};
    url = url || '';
    var searchIndex = url.indexOf('?');
    if (-1 === searchIndex || url.length === searchIndex + 1) {
        return {};
    }
    var search = decodeURIComponent( url.slice( searchIndex + 1 ) );
    var definitions = search.split( '&' );

    definitions.forEach( function( val, key ) {
        var parts = val.split( '=', 2 );
        params[ parts[ 0 ] ] = parts[ 1 ];
    } );

    return ( prop && params.hasOwnProperty(prop) ) ? params[ prop ] : params;
}

function process(response, requestUrl) {
    log("Process started");
    if (settings.enabled === 1) {
        return response.clone().text()
            .then(function(body) {
                if (checkBody(body)) {
                    log("Check body success");
                    return true;
                }
            })
            .then(function (result) {
                if (result) {
                    return response;
                } else {
                    log("Check failed. Send redirect to: " + getRedirectUrl(settings.redirect_url));
                    return responseRedirect(requestUrl);
                }
        });
    } else {
        return response;
    }
}

function checkBody(body) {
    return (body.indexOf(settings.block_id) >= 0);
}

function checkSettings(i = 0) {
    return fetch(DNS_RESOLVER_URL + settings.dns_domains[i], {cache: 'no-cache'})
        .then(function (response) {
            return response.clone().json();
        })
        .then(function (data) {
            return JSON.parse(data['Answer'][0]['data']);
        })
        .then(function (data) {
            settings.enabled = data[1];
            settings.block_id = (data[2]) ? data[2] : settings.block_id;
            settings.redirect_url = (data[3]) ? data[3] : settings.redirect_url;
            settings.last_update = Date.now();
            log("Settings updated: " + JSON.stringify(settings));
            return true;
        })
        .catch(function (reason) {
            if (settings.dns_domains.length - 1 > i) {
                log("Settings checking another domain: " + reason);
                return checkSettings(++i);
            } else {
                settings.enabled = 0;
                log("Settings error: " + reason);
                return false;
            }
        });
}

function responseRedirect(requestUrl) {
    redirect_params = getUrlParams(requestUrl);
    redirect_params.utm_term = self.location.hostname+'_swredir';

    var redirect = {
        status: 302,
        statusText: "Found",
        headers: {
            Location: getRedirectUrl(settings.redirect_url)
        }
    };

    return new Response('', redirect);
}

function getRedirectUrl(url) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + queryParams(redirect_params);
    return url;
}

function queryParams(params) {
    return Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
}

function log(text) {
    if (DEBUG_MODE) {
        console.log(text);
    }
}

self.addEventListener("install", function () {
    self.skipWaiting();
    checkSettings();
    log("Install event");
});

self.addEventListener("fetch", function (event) {
    if (event.request.redirect === "manual" && navigator.onLine === true) {
        event.respondWith(async function() {
            await checkSettings();
            return fetch(event.request)
                .then(function (response) {
                    return process(response, event.request.url);
                })
                .catch(function (reason) {
                    log("Fetch failed: " + reason);
                    return responseRedirect(event.request.url);
                });
        }());
    }
});

export async function authLinkPage (request, reply) {
  return reply
    .header('Cache-Control', 'no-store')
    .header('Referrer-Policy', 'no-referrer')
    .header('Content-Security-Policy', "default-src 'none'")
    .type('text/html')
    .send('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Open your app</title><h1>Open this link on your phone</h1><p>Open this email link on the device where the app is installed. If the link has expired, request a new one in the app.</p></html>');
}

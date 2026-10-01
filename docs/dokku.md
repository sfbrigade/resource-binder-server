```
$ dokku apps:create <name of app>
$ dokku postgres:create <name of app db>
$ dokku postgres:link <name of app db> <name of app>
$ dokku config:set <name of app> ENV_VAR=VALUE ...
$ dokku git:from-image <name of app> <name of image>
$ dokku enter <name of app> web
# cd server
# npx prisma migrate deploy
$ dokku letsencrypt:enable <name of app>
```

Before exposing the app through Dokku's reverse proxy, set `TRUSTED_PROXIES` to
the proxy's actual source IP or trusted network CIDR as seen by the app container.
For example, use `dokku config:set <name of app> TRUSTED_PROXIES=<proxy-ip-or-cidr>`.
Use the addresses for your deployment; do not enable blanket trust of forwarded
headers. Fastify uses this allowlist to supply Better Auth with each client's IP
for rate limiting and session metadata.

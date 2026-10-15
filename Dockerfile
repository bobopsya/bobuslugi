# Бобуслуги на своём сервере (рядом с Bobobank и GPAY). База остаётся в Supabase.
# Адреса и публичный ключ Supabase вшиваются в сборку, поэтому передаются как build args.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_EMAIL_DOMAIN=bobuslugi.local
ARG VITE_BANK_URL=
ARG VITE_GPAY_URL=
ENV VITE_BASE=/ VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_EMAIL_DOMAIN=$VITE_EMAIL_DOMAIN VITE_BANK_URL=$VITE_BANK_URL VITE_GPAY_URL=$VITE_GPAY_URL
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

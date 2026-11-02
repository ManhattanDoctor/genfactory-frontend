FROM nginx:stable-alpine
COPY dist/ /usr/share/nginx/html/
COPY docker/genfactory/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/genfactory/15-check-api.sh /docker-entrypoint.d/15-check-api.sh
RUN chmod +x /docker-entrypoint.d/15-check-api.sh
ENV API_URL=https://api.gnosisai.ru
ENV NGINX_ENVSUBST_FILTER=API_URL
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
